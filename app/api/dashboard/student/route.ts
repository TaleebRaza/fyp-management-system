import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import { enqueueNotificationEmail } from '../../../../lib/emailOutbox';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../../../../config/projectDomains';
import {
  buildFineRestriction,
  FINE_RESTRICTION_CODE,
  isFineRestrictionBlocking,
} from '../../../../lib/fineRestriction';
import {
  getTeamFineRestriction,
  getTeamFineRestrictionMessage,
} from '../../../../lib/teamFineRestriction';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import {
  hasPreviousProjectSubmission,
  isProjectComplete,
  isProjectSubmissionPendingReview,
  PROJECT_COMPLETE_MESSAGE,
  PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE,
  PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
} from '../../../../lib/projectSubmissionPolicy';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';
import { enqueueDeletedProjectStorage } from '../../../../lib/projectStorageCleanup';
import { findSharedStorageKeys } from '../../../../lib/storageReferenceSafety';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { JSON_BODY_LIMITS, readBoundedJson } from '../../../../lib/security/request';
import { createProjectWithUniqueInviteCode } from '../../../../lib/projectCreation';
import { escapeHtml, isRecord, normalizeText } from '../../../../lib/security/input';
import { normalizeStorageKey } from '../../../../lib/storageValidation';
import {
  capacityReservationError,
  releaseSupervisorProjectSlot,
  reserveSupervisorProjectSlot,
} from '../../../../lib/supervisorCapacity';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  finalizeUploadReservation,
  StorageProtocolError,
  withStorageTransaction,
} from '../../../../lib/storageProtocol';
import { recordCurrentUserActivity } from '../../../../lib/portalActivityLog';
import {
  getStudentDashboard,
  STUDENT_DASHBOARD_AUTH_FIELDS,
  type StudentDashboardFields,
} from '../../../../lib/features/student/dashboard';

export const dynamic = 'force-dynamic';

const NAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser<StudentDashboardFields>(
      req,
      ['student'],
      STUDENT_DASHBOARD_AUTH_FIELDS
    );
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(currentUser.id)) {
      return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
    }

    return NextResponse.json(
      await getStudentDashboard(currentUser),
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    await connectToDatabase();
    const json = await readBoundedJson(req, JSON_BODY_LIMITS.form);
    if (!json.ok) return json.response;
    const body = json.value;
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid student action.' }, { status: 400 });
    }
    const action = body.action;
    if (!['updateName', 'updateProgramBatch', 'resetProject', 'changeSupervisor', 'assignSupervisor', 'submitProject'].includes(String(action))) {
      return NextResponse.json({ error: 'Unknown student action.' }, { status: 400 });
    }

    if (action === 'updateName') {
      const normalizedName = normalizeText(body.name, 100);
      if (!normalizedName) {
        return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
      }

      const student = await User.findOne({ _id: currentUser.id, role: 'student' })
        .select('name')
        .lean();
      if (!student) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }
      if (normalizedName === student.name) {
        return NextResponse.json({ error: 'Your name is already up to date.' }, { status: 400 });
      }

      const now = new Date();
      const nameChangeCutoff = new Date(now.getTime() - NAME_CHANGE_COOLDOWN_MS);
      const updatedStudent = await User.findOneAndUpdate(
        {
          _id: currentUser.id,
          role: 'student',
          $or: [
            { lastNameChangeAt: { $exists: false } },
            { lastNameChangeAt: null },
            { lastNameChangeAt: { $lte: nameChangeCutoff } },
          ],
        },
        { $set: { name: normalizedName, lastNameChangeAt: now } },
        { returnDocument: 'after' }
      )
        .select('name')
        .lean();

      if (!updatedStudent) {
        return NextResponse.json(
          { error: 'You can change your name once per day. Please try again later.' },
          { status: 429 }
        );
      }

      await recordCurrentUserActivity('student-name-updated', currentUser);

      return NextResponse.json(
        { message: 'Name updated. You can change it again after 24 hours.', name: updatedStudent.name },
        { status: 200 }
      );
    }

    // ==========================================
    // ACTION: STUDENT PROGRAM/BATCH SELF UPDATE
    // ==========================================
    if (action === 'updateProgramBatch') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized Program/Batch update request.' }, { status: 401 });
      }

      try {
        const result = await resetStudentAcademicInfo({
          targetUserId: String(body.id || '').trim(),
          newProgram: typeof body.program === 'string' ? body.program : undefined,
          newBatch: typeof body.batch === 'string' ? body.batch : undefined,
          actor: 'student',
          enforceStudentCooldown: true,
        });
        await recordCurrentUserActivity('student-academic-details-updated', currentUser);
        return NextResponse.json(result, { status: 200 });
      } catch (error) {
        if (error instanceof AcademicResetError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        console.error('student_academic_reset_failed');
        return NextResponse.json({ error: 'Failed to update Program/Batch.' }, { status: 500 });
      }
    }

    if (action === 'resetProject') {
      if (!mongoose.Types.ObjectId.isValid(currentUser.id)) {
        return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
      }

      try {
        const queuedDeletionBytes = await withStorageTransaction(async (session) => {
          const project = await Project.findOne({ members: currentUser.id }).session(session);
          if (!project) {
            throw new StorageProtocolError('Your current project record could not be found.', 404);
          }

          const pdfKey = project.pdfUrl ? normalizeStorageKey(project.pdfUrl) : null;
          if (project.pdfUrl && !pdfKey) {
            throw new StorageProtocolError(
              'The stored project file key is invalid. Run the storage integrity audit before resetting your project.',
              409
            );
          }

          let deletedBytes = 0;
          if (pdfKey) {
            await assertStorageLedgerReady(session);
            const sharedKeys = await findSharedStorageKeys({
              keys: [pdfKey],
              excludedProjectIds: [project._id],
              session,
            });
            if (!sharedKeys.has(pdfKey)) {
              deletedBytes = Math.max(Number(project.pdfSize || 0), 0);
              await enqueueStorageDeletion({
                key: pdfKey,
                bytes: deletedBytes,
                reason: 'student-project-reset',
              }, session);
            }
          }

          project.stage = 'PROPOSAL';
          project.status = 'Pending';
          project.reviewRemarks = '';
          project.pdfUrl = '';
          project.pdfSize = 0;
          project.ratings = undefined;
          project.version = Number(project.version || 0) + 1;
          await project.save({ session });

          return deletedBytes;
        });

        await recordCurrentUserActivity('student-project-reset', currentUser);
        return NextResponse.json(
          {
            message: 'Your project was reset to the proposal stage. Your team, supervisor, and project details were kept.',
            queuedDeletionBytes,
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof StorageProtocolError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        console.error('student_project_reset_failed');
        return NextResponse.json({ error: 'Failed to reset project.' }, { status: 500 });
      }
    }

    // ==========================================
    // ACTION: CHANGE SUPERVISOR (student starts fresh)
    // ==========================================
    if (action === 'changeSupervisor') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized supervisor change request.' }, { status: 401 });
      }

      const studentId = String(body.id || '').trim();
      const newSupervisorId = String(body.supervisorId || '').trim();

      if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(newSupervisorId)) {
        return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      let queuedDeletionBytes = 0;
      let leftTeam = false;

      try {
        const student = await User.findById(studentId).select('_id role').session(session);

        if (!student || student.role !== 'student') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        const oldProject = await Project.findOne({ members: student._id }).session(session);

        if (String(oldProject?.supervisorId || '') === newSupervisorId) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'You are already assigned to this supervisor.' }, { status: 400 });
        }

        const targetSupervisor = await User.findOne({
          _id: newSupervisorId,
          role: 'supervisor',
        })
          .select('_id name')
          .session(session);

        if (!targetSupervisor) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        const reservation = await reserveSupervisorProjectSlot(targetSupervisor._id, session);
        if (reservation !== 'reserved') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: capacityReservationError(reservation) }, { status: reservation === 'missing' ? 404 : 409 });
        }
        if (oldProject) {
          const projectIsLocked = oldProject.status === 'Approved' || oldProject.stage !== 'PROPOSAL';

          if (projectIsLocked) {
            await session.abortTransaction();
            session.endSession();

            return NextResponse.json(
              {
                error:
                  'Supervisor change is blocked because this project has already been approved. Use migration instead.',
              },
              { status: 403 }
            );
          }

          const oldProjectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];
          const isOnlyMember =
            oldProjectMembers.length <= 1 ||
            oldProjectMembers.every((member: unknown) => String(member) === String(student._id));

          if (isOnlyMember) {
            const cleanup = await enqueueDeletedProjectStorage({
              project: oldProject,
              extraPdfUrls: [oldProject.pdfUrl],
              reason: 'supervisor-change',
              session,
            });
            queuedDeletionBytes = cleanup.queuedDeletionBytes;

            if (oldProject.supervisorId && !await releaseSupervisorProjectSlot(oldProject.supervisorId, session)) {
              throw new Error('Unable to release the previous supervisor capacity.');
            }
            await Project.findByIdAndDelete(oldProject._id, { session });
          } else {
            leftTeam = true;

            await Project.findByIdAndUpdate(
              oldProject._id,
              { $pull: { members: student._id } },
              { session }
            );
          }
        }

        await createProjectWithUniqueInviteCode({
          supervisorId: targetSupervisor._id,
          members: [student._id],
          stage: 'PROPOSAL',
          status: 'Pending',
          title: '',
          titleFingerprint: '',
          domains: [],
          pdfUrl: '',
          pdfSize: 0,
        }, session);
await session.commitTransaction();
        session.endSession();

        await recordCurrentUserActivity('student-supervisor-updated', currentUser);

        return NextResponse.json(
          {
            message: leftTeam
              ? 'Supervisor changed. You left your old team and started fresh under the new supervisor.'
              : 'Supervisor changed. Your previous project files are queued for deletion.',
            queuedDeletionBytes,
          },
          { status: 200 }
        );
      } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Supervisor Change Error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Failed to change supervisor.' }, { status: 500 });
      }
    }

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (action === 'assignSupervisor') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized supervisor assignment request.' }, { status: 401 });
      }

      if (!mongoose.Types.ObjectId.isValid(String(body.id || '')) || !mongoose.Types.ObjectId.isValid(String(body.supervisorId || ''))) {
        return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
      }

      // 1. Start an Atomic Transaction Session to prevent race conditions
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const triggeringStudent = await User.findById(body.id).select('_id').session(session);
        if (!triggeringStudent) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

                const existingProject = await Project.findOne({ members: triggeringStudent._id }).session(session);
        if (existingProject?.supervisorId) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json(
            { error: 'You already have a supervisor. Use the change supervisor option instead.' },
            { status: 400 }
          );
        }

        const supervisor = await User.findOne({ _id: body.supervisorId, role: 'supervisor' })
          .select('_id')
          .session(session);

        if (!supervisor) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        const reservation = await reserveSupervisorProjectSlot(supervisor._id, session);
        if (reservation !== 'reserved') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: capacityReservationError(reservation) }, { status: reservation === 'missing' ? 404 : 409 });
        }

                const supObjectId = new mongoose.Types.ObjectId(supervisor._id);
        // Project owns the student/project relationship.
        if (existingProject) {
          await Project.findByIdAndUpdate(
            existingProject._id,
            { $set: { supervisorId: supObjectId } },
            { session }
          );
} else {
          await createProjectWithUniqueInviteCode({
            supervisorId: supObjectId,
            members: [triggeringStudent._id],
            stage: 'PROPOSAL',
            status: 'Pending',
            title: '',
            titleFingerprint: '',
            domains: [],
            pdfUrl: '',
            pdfSize: 0,
          }, session);
}

        // 5. Commit the transaction ONLY if no other request modified the count during our process
        await session.commitTransaction();
        session.endSession();
        await recordCurrentUserActivity('student-supervisor-updated', currentUser);
        return NextResponse.json({ message: 'Supervisor successfully assigned to your team!' }, { status: 200 });

      } catch (transactionError) {
        // Safe Fallback: Abort all changes if anything fails
        await session.abortTransaction();
        session.endSession();
        throw transactionError;
      }
    }

    // ==========================================
    // HELPER: LEXICAL FINGERPRINT GENERATOR
    // ==========================================
    const generateFingerprint = (title: string) => {
      if (!title) return '';
      const cleanTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
      const stopWords = new Set([
        'a', 'an', 'the', 'for', 'and', 'nor', 'but', 'or', 'yet', 'so', 'of', 'at', 'by', 'from', 'in', 'into', 'on', 'to', 'with', 'using', 'based',
        'system', 'smart', 'advanced', 'iot', 'project', 'application', 'app', 'web', 'design', 'implementation', 'development'
      ]);
      return cleanTitle.split(/\s+/).filter(word => word.length > 0 && !stopWords.has(word)).sort().join('-');
    };

    // ==========================================
    // ACTION: PROJECT SUBMISSION
    // ==========================================
    const submissionStudentId = currentUser.id;
    if (!mongoose.Types.ObjectId.isValid(submissionStudentId)) {
      return NextResponse.json({ error: 'Unauthorized student submission.' }, { status: 401 });
    }

    const triggeringStudent = await User.findOne({
      _id: submissionStudentId,
      role: 'student',
    }).select('_id lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment');
        if (!triggeringStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const triggeringProject = await Project.findOne({ members: triggeringStudent._id })
      .select('_id')
      .lean();
    if (!triggeringProject) {
      return NextResponse.json({ error: 'Project record not found for this student.' }, { status: 409 });
    }
    const title = normalizeText(body.title, 200);
    const description = normalizeText(body.desc, 2_000);
    const tools = normalizeText(body.tools, 1_000);
    const pdfUrl = typeof body.pdfUrl === 'string' ? body.pdfUrl.trim() : '';
    if (!title || !description || !tools || !pdfUrl) {
      return NextResponse.json({ error: 'Title, description, tools, and a PDF are required.' }, { status: 400 });
    }

    const submissionFineRestriction = buildFineRestriction(triggeringStudent);
        const submissionTeamFineRestriction = await getTeamFineRestriction(
      triggeringProject._id,
      triggeringStudent._id
    );
    const fineRestrictions = submissionTeamFineRestriction
      ? serializeRegistrationPolicy(await getOrCreateRegistrationPolicy()).fineRestrictions
      : null;
    if (
      submissionTeamFineRestriction &&
      isFineRestrictionBlocking(
        submissionTeamFineRestriction,
        fineRestrictions?.proposalUpload
      )
    ) {
      return NextResponse.json(
        {
          code: FINE_RESTRICTION_CODE,
          error: getTeamFineRestrictionMessage(submissionTeamFineRestriction, 'submission'),
          fineRestriction: submissionFineRestriction,
          teamFineRestriction: submissionTeamFineRestriction,
        },
        { status: 403 }
      );
    }

    const hasDomainArrayPayload = Object.prototype.hasOwnProperty.call(body, 'domains');
    const legacyDomainText = String(body.domain || '').trim();
    let selectedDomainIds: string[] = [];

    if (hasDomainArrayPayload) {
      const domainValidation = validateProjectDomainIds(body.domains);

      if (!domainValidation.isArray) {
        return NextResponse.json(
          { error: 'Project domains must be submitted as a list.' },
          { status: 400 }
        );
      }

      if (domainValidation.invalid.length > 0) {
        return NextResponse.json(
          {
            error: 'One or more selected project domains are invalid.',
            invalidDomains: domainValidation.invalid,
          },
          { status: 400 }
        );
      }

      if (domainValidation.ids.length === 0) {
        return NextResponse.json(
          { error: 'Select at least one project domain.' },
          { status: 400 }
        );
      }

      selectedDomainIds = domainValidation.ids;
    } else {
      // Transitional support for the current free-text UI.
      // Once the checkbox UI is installed, requests will always use `domains`.
      selectedDomainIds = normalizeProjectDomainIds([], legacyDomainText);

      if (!legacyDomainText && selectedDomainIds.length === 0) {
        return NextResponse.json(
          { error: 'Select at least one project domain.' },
          { status: 400 }
        );
      }
    }

    const normalizedDomainText = formatProjectDomainLabels(
      selectedDomainIds,
      legacyDomainText
    );

    const fingerprint = generateFingerprint(title);

    const uploadedKey = normalizeStorageKey(pdfUrl);
    if (!uploadedKey || !uploadedKey.startsWith(`proposals/${submissionStudentId}/`)) {
      return NextResponse.json({ error: 'Invalid uploaded PDF.' }, { status: 400 });
    }

    await finalizeUploadReservation({
      key: uploadedKey,
      ownerId: submissionStudentId,
      kind: 'pdf',
      commit: async (session, uploadedObject) => {
        const studentInTransaction = await User.findOne({
          _id: submissionStudentId,
          role: 'student',
        }).select('_id name').session(session);
                if (!studentInTransaction) {
          throw new StorageProtocolError('Student record not found.', 409);
        }
        const project = await Project.findOne({
          members: studentInTransaction._id,
        }).session(session);
        if (!project) throw new StorageProtocolError('Project membership changed. Refresh and try again.', 409);
        if (isProjectComplete(project)) {
          throw new StorageProtocolError(PROJECT_COMPLETE_MESSAGE, 403);
        }
        if (isProjectSubmissionPendingReview(project)) {
          throw new StorageProtocolError(PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE, 409);
        }

        const canEditProjectDetails = project.stage === 'PROPOSAL';
        if (canEditProjectDetails) {
          const duplicateProject = await Project.findOne({
            titleFingerprint: fingerprint,
            _id: { $ne: project._id },
            $or: [
              { status: 'Approved' },
              { stage: { $in: ['THESIS_DRAFT', 'FINAL_DELIVERABLES'] } },
            ],
          }).select('_id').session(session);
          if (duplicateProject) {
            throw new StorageProtocolError(
              'A project utilizing these core concepts has already been approved for another team. Please select a unique topic.',
              409
            );
          }
        }

        const acceptedSubmissionPolicy = await RegistrationPolicy.findOneAndUpdate(
          hasPreviousProjectSubmission(project)
            ? { policyKey: REGISTRATION_POLICY_KEY }
            : {
                policyKey: REGISTRATION_POLICY_KEY,
                projectSubmissionsOpen: { $ne: false },
              },
          { $inc: { projectSubmissionsAccepted: 1 } },
          { returnDocument: 'after', session }
        );
        if (!acceptedSubmissionPolicy) {
          throw new StorageProtocolError(PROJECT_SUBMISSIONS_CLOSED_MESSAGE, 403);
        }

        const oldPdfKey = normalizeStorageKey(project.pdfUrl);
        if (project.pdfUrl && !oldPdfKey) {
          throw new StorageProtocolError(
            'The current project file key is invalid. Run the storage integrity audit before replacing it.',
            409
          );
        }
        if (!canEditProjectDetails && oldPdfKey === uploadedObject.key) {
          throw new StorageProtocolError(
            'Select a new project document PDF before submitting.',
            400
          );
        }
        const submittedTitle = canEditProjectDetails ? title : String(project.title || '');
        const submittedDomainText = canEditProjectDetails
          ? normalizedDomainText
          : formatProjectDomainLabels(normalizeProjectDomainIds(project.domains));
        const updatedProject = await Project.updateOne(
          {
            _id: project._id,
            members: studentInTransaction._id,
            $or: [{ version: Number(project.version || 0) }, { version: { $exists: false } }],
          },
          {
            $set: {
              ...(canEditProjectDetails
                ? {
                    title,
                    description,
                    titleFingerprint: fingerprint,
                    domains: selectedDomainIds,
                    tools,
                  }
                : {}),
              pdfUrl: uploadedObject.key,
              pdfSize: uploadedObject.actualBytes,
              status: 'Submitted For Review',
            },
            $inc: { version: 1 },
          },
          { session }
        );
        if (updatedProject.modifiedCount !== 1) {
          throw new StorageProtocolError('Project changed while submitting. Refresh and try again.', 409);
        }
if (oldPdfKey && oldPdfKey !== uploadedObject.key) {
          const sharedKeys = await findSharedStorageKeys({
            keys: [oldPdfKey],
            excludedProjectIds: [project._id],
            session,
          });
          const isShared = sharedKeys.has(oldPdfKey);
          if (!isShared) {
            await enqueueStorageDeletion(
              { key: oldPdfKey, bytes: Number(project.pdfSize || 0), reason: 'project-pdf-replaced' },
              session
            );
          }
        }

                const supervisorId = project.supervisorId;
        const supervisor = supervisorId
          ? await User.findOne({ _id: supervisorId, role: 'supervisor' })
              .select('email notificationsEnabled')
              .session(session)
              .lean()
          : null;
        if (supervisor?.email && supervisor.notificationsEnabled !== false) {
          await enqueueNotificationEmail({
            dedupeKey: `project-submission:${project._id}:${uploadedObject.key}`,
            to: supervisor.email,
            subject: `New FYP Project Submitted: ${studentInTransaction.name}`,
            html: `
              <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                  <div style="background-color: #18181b; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">New Project Submission</h2>
                    <p style="color: #71717a; margin-bottom: 24px;">A new Final Year Project proposal has been submitted.</p>
                    <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${escapeHtml(studentInTransaction.name)}</p>
                      <p style="margin: 0 0 12px 0;"><strong>Domains:</strong> ${escapeHtml(submittedDomainText)}</p>
                      <p style="margin: 0;"><strong>Title:</strong> ${escapeHtml(submittedTitle)}</p>
                    </div>
                  </div>
                </div>
              </div>`,
          }, session);
        }

        return true;
      },
    });

    await recordCurrentUserActivity('project-submitted', currentUser);

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    console.error('student_dashboard_submission_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
