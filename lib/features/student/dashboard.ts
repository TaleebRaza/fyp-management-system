import { isProjectGraded } from '../../gradedProject';
import { formatProjectDomainLabels, normalizeProjectDomainIds } from '../../../config/projectDomains';
import { getSafeProjectRatings } from '../../../config/projectRatings';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { buildFineRestriction, type FineRestrictedUser } from '../../fineRestriction';
import { getOrCreateRegistrationPolicy, serializeRegistrationPolicy } from '../../registrationPolicy';
import type { CurrentUser } from '../../security/auth';
import { getTeamFineRestrictionFromMembers } from '../../teamFineRestriction';
import { getCompletedVivaResultsForStudent } from '../../vivaResults';
import { getConfirmedVivaSchedulesForStudent } from '../../vivaScheduling';

export type StudentDashboardFields = FineRestrictedUser & {
  email?: string;
  program?: string;
  batch?: string;
  semester?: string;
  notificationsEnabled?: boolean;
  isActive?: boolean;
  lateRegistrationFineResolvedAt?: Date | null;
};

export type StudentDashboardUser = CurrentUser<StudentDashboardFields>;

export const STUDENT_DASHBOARD_AUTH_FIELDS =
  'email program batch semester notificationsEnabled isActive lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus lateRegistrationFineResolvedAt registrationPunishment';

export async function getStudentDashboard(student: StudentDashboardUser) {
  const fineRestriction = buildFineRestriction(student);
  const projectQuery = Project.findOne({ members: student.id })
    .select('_id supervisorId members title description status reviewRemarks stage version domains tools pdfUrl inviteCode maxTeamSize ratings')
    .lean().exec();
  const [project, policyDocument, vivaResults, vivaSessions] = await Promise.all([
    projectQuery,
    getOrCreateRegistrationPolicy(),
    getCompletedVivaResultsForStudent(student.id),
    getConfirmedVivaSchedulesForStudent(student.id, projectQuery),
  ]);
  const [supervisor, projectMembers] = await Promise.all([
    project?.supervisorId
      ? User.findById(project.supervisorId)
          .select('_id name email broadcastType broadcastContent broadcastSize broadcastCreatedAt')
          .lean()
      : Promise.resolve(null),
    project?.members?.length
      ? User.find({ _id: { $in: project.members }, role: 'student' })
          .select('_id name rollNo email lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment')
          .lean()
      : Promise.resolve([]),
  ]);
  const teamFineRestriction = getTeamFineRestrictionFromMembers(projectMembers, student.id);
  const policy = serializeRegistrationPolicy(policyDocument);
  const safeProjectMembers = projectMembers.map((member) => ({
    _id: member._id,
    name: member.name,
    rollNo: member.rollNo,
    email: member.email,
  }));
  const supervisorBroadcast = supervisor?.broadcastType && supervisor?.broadcastContent
    ? {
        type: supervisor.broadcastType,
        content: supervisor.broadcastContent,
        size: supervisor.broadcastSize || 0,
        createdAt: supervisor.broadcastCreatedAt || null,
        supervisorName: supervisor.name || 'Supervisor',
      }
    : null;
  const projectRecord = project as {
    _id?: unknown;
    supervisorId?: unknown;
    title?: string;
    description?: string;
    status?: string;
    reviewRemarks?: string;
    domains?: unknown;
    tools?: string;
    pdfUrl?: string;
    ratings?: unknown;
  } | null;
  const normalizedDomains = normalizeProjectDomainIds(projectRecord?.domains);
  const normalizedDomainText = formatProjectDomainLabels(normalizedDomains);
  const studentFields = {
    _id: student.id,
    name: student.name,
    email: student.email,
    rollNo: student.rollNo,
    role: student.role,
    program: student.program,
    batch: student.batch,
    semester: student.semester,
    notificationsEnabled: student.notificationsEnabled,
    isActive: student.isActive,
    lateRegistrationDays: student.lateRegistrationDays,
    lateRegistrationFine: student.lateRegistrationFine,
    lateRegistrationFineStatus: student.lateRegistrationFineStatus,
    lateRegistrationFineResolvedAt: student.lateRegistrationFineResolvedAt,
    registrationPunishment: student.registrationPunishment,
  };

  return {
    student: {
      ...studentFields,
      supervisorId: projectRecord?.supervisorId || null,
      status: projectRecord?.supervisorId ? (projectRecord.status || 'Pending') : 'Unassigned',
      remarks: projectRecord?.reviewRemarks || '',
      projectTitle: projectRecord?.title || '',
      projectDesc: projectRecord?.description || '',
      tools: projectRecord?.tools || '',
      pdfUrl: projectRecord?.pdfUrl || '',
      projectId: projectRecord?._id || null,
      lateRegistrationDays: fineRestriction?.lateRegistrationFine?.daysLate || 0,
      lateRegistrationFine: fineRestriction?.lateRegistrationFine?.amount || 0,
      domains: normalizedDomains,
      domain: normalizedDomainText,
    },
    supervisor: supervisor ? { _id: supervisor._id, name: supervisor.name, email: supervisor.email } : null,
    project: projectRecord
      ? {
          ...projectRecord,
          vivaGraded: await isProjectGraded(projectRecord._id),
          members: safeProjectMembers,
          domains: normalizedDomains,
          domain: normalizedDomainText,
          ratings: getSafeProjectRatings(projectRecord.ratings),
        }
      : projectRecord,
    supervisorBroadcast,
    fineRestriction: fineRestriction
      ? { ...fineRestriction, payment: policy.finePayment }
      : null,
    teamFineRestriction,
    fineRestrictions: fineRestriction || teamFineRestriction ? policy.fineRestrictions : undefined,
    projectSubmissionsOpen: policy.projectSubmissionsOpen,
    projectResetEnabled: policy.projectResetEnabled,
    vivaResults,
    vivaSessions,
  };
}
