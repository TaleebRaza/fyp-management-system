import mongoose from 'mongoose';
import FineAudit from '../models/FineAudit';
import Project from '../models/Project';
import StudentFine from '../models/StudentFine';
import User from '../models/User';
import { releaseSupervisorProjectSlot } from './supervisorCapacity';
import { getEffectiveFineRestrictions } from './dynamicFineRestriction';

type StructuralAction =
  | 'supervisor-disband-project'
  | 'supervisor-detach-student'
  | 'team-membership';

function validId(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error(`${label} is invalid.`);
  return new mongoose.Types.ObjectId(value);
}

export async function previewStructuralFineEnforcement(fineId: string) {
  const fine = await StudentFine.findOne({
    _id: validId(fineId, 'Fine record'),
    status: { $nin: ['paid', 'waived', 'cancelled'] },
  });
  if (!fine) throw new Error('Unresolved fine record not found.');
  const student = await User.findOne({ _id: fine.studentId, role: 'student' })
    .select('_id name rollNo projectId supervisorId')
    .lean();
  if (!student) throw new Error('Student account not found.');
  const effective = await getEffectiveFineRestrictions(String(student._id), false);
  const actions = effective.sources
    .filter((source) => source.fineId === String(fine._id))
    .map((source) => source.restriction)
    .filter((restriction): restriction is StructuralAction =>
      restriction === 'supervisor-disband-project' ||
      restriction === 'supervisor-detach-student' ||
      restriction === 'team-membership'
    );
  const appliedActions = new Set(
    fine.restorationSnapshots.map((snapshot: { action: StructuralAction }) => snapshot.action)
  );
  const pendingActions = [...new Set(actions)].filter((action) => !appliedActions.has(action));
  const project = student.projectId
    ? await Project.findById(student.projectId).select('_id members supervisorId title status').lean()
    : null;
  const members = project?.members?.length
    ? await User.find({ _id: { $in: project.members }, role: 'student' })
        .select('_id name rollNo')
        .lean()
    : [];
  return {
    fineId: String(fine._id),
    student: { id: String(student._id), name: student.name, rollNo: student.rollNo },
    actions: pendingActions,
    appliedActions: [...appliedActions],
    project: project
      ? {
          id: String(project._id),
          title: project.title || 'Untitled project',
          status: project.status,
          supervisorId: project.supervisorId ? String(project.supervisorId) : null,
          members: members.map((member) => ({
            id: String(member._id),
            name: member.name,
            rollNo: member.rollNo,
          })),
        }
      : null,
    warnings: pendingActions.includes('supervisor-disband-project')
      ? ['The supervisor will be detached from every member of this project.']
      : [],
  };
}

export async function applyStructuralFineEnforcement(
  fineId: string,
  actorId: string,
  reason: string
) {
  const preview = await previewStructuralFineEnforcement(fineId);
  const administrativeReason = String(reason || '').trim().slice(0, 1_000);
  if (!administrativeReason) throw new Error('An administrative reason is required.');
  if (preview.actions.length === 0) return preview;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fine = await StudentFine.findOne({
        _id: validId(fineId, 'Fine record'),
        status: { $nin: ['paid', 'waived', 'cancelled'] },
      }).session(session);
      if (!fine) throw new Error('Unresolved fine record not found.');
      const student = await User.findOne({ _id: fine.studentId, role: 'student' }).session(session);
      if (!student) throw new Error('Student account not found.');
      const project = student.projectId ? await Project.findById(student.projectId).session(session) : null;
      const now = new Date();

      if (preview.actions.includes('supervisor-disband-project') && project?.supervisorId) {
        const supervisorId = project.supervisorId;
        if (!await releaseSupervisorProjectSlot(supervisorId, session)) {
          throw new Error('Unable to release the previous supervisor capacity.');
        }
        fine.restorationSnapshots.push({
          action: 'supervisor-disband-project',
          projectId: project._id,
          supervisorId,
          memberIds: project.members,
          reason: administrativeReason,
          appliedAt: now,
        });
        project.supervisorId = null;
        await project.save({ session });
        await User.updateMany(
          { projectId: project._id, role: 'student', supervisorId },
          { $set: { supervisorId: null, status: 'Unassigned' } },
          { session }
        );
      }

      const removeFromTeam =
        preview.actions.includes('team-membership') ||
        preview.actions.includes('supervisor-detach-student');
      if (removeFromTeam && project) {
        const memberIds = project.members.map((memberId: unknown) => String(memberId));
        if (
          preview.actions.includes('supervisor-detach-student') &&
          !preview.actions.includes('team-membership') &&
          memberIds.length <= 1
        ) {
          throw new Error('A sole project member cannot be detached without a team-membership restriction.');
        }
        const action: StructuralAction = preview.actions.includes('team-membership')
          ? 'team-membership'
          : 'supervisor-detach-student';
        fine.restorationSnapshots.push({
          action,
          projectId: project._id,
          supervisorId: project.supervisorId,
          memberIds: project.members,
          reason: administrativeReason,
          appliedAt: now,
        });
        project.members = project.members.filter(
          (memberId: unknown) => String(memberId) !== String(student._id)
        );
        if (project.members.length < 2) project.status = 'Incomplete';
        if (project.members.length === 0 && project.supervisorId) {
          if (!await releaseSupervisorProjectSlot(project.supervisorId, session)) {
            throw new Error('Unable to release the previous supervisor capacity.');
          }
          project.supervisorId = null;
        }
        await project.save({ session });
        student.projectId = null;
        student.supervisorId = null;
        student.status = 'Unassigned';
        student.remarks = 'Fine restrictions removed you from the previous team. Contact the FYP administration for restoration options.';
        await student.save({ session });
      }

      fine.updatedBy = validId(actorId, 'Administrator');
      fine.history.push({
        action: 'structural-restrictions-applied',
        details: administrativeReason,
        actorId: validId(actorId, 'Administrator'),
        at: now,
      });
      await fine.save({ session });
      const audit = new FineAudit({
        entityType: 'fine-record',
        entityId: fine._id,
        action: 'structural-restrictions-applied',
        details: administrativeReason,
        actorId: validId(actorId, 'Administrator'),
      });
      await audit.save({ session });
    });
    return preview;
  } finally {
    await session.endSession();
  }
}
