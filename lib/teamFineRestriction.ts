import User from '../models/User';
import {
  buildFineRestriction,
  OUTSTANDING_STUDENT_FINE_FILTER,
} from './fineRestriction';

const TEAM_FINE_FIELDS =
  '_id name rollNo lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment';

export type TeamFineRestriction = {
  active: true;
  member: {
    id: string;
    name: string;
    rollNo: string;
  };
  isCurrentStudent: boolean;
};

type TeamFineMember = {
  _id?: unknown;
  name?: unknown;
  rollNo?: unknown;
} & Parameters<typeof buildFineRestriction>[0];

export function getTeamFineRestrictionFromMembers(
  members: TeamFineMember[],
  currentStudentId: unknown
): TeamFineRestriction | null {
  const currentId = String(currentStudentId || '');
  const member = members.find((item) => String(item._id) === currentId && buildFineRestriction(item)) ||
    members.find((item) => buildFineRestriction(item));

  if (!member) return null;

  return {
    active: true,
    member: {
      id: String(member._id),
      name: String(member.name || 'A team member'),
      rollNo: String(member.rollNo || ''),
    },
    isCurrentStudent: String(member._id) === currentId,
  };
}

export async function getTeamFineRestriction(
  projectId: unknown,
  currentStudentId: unknown
): Promise<TeamFineRestriction | null> {
  const currentId = String(currentStudentId || '');
  const scope = projectId ? { projectId } : { _id: currentId };
  const members = await User.find({
    ...OUTSTANDING_STUDENT_FINE_FILTER,
    ...scope,
  })
    .select(TEAM_FINE_FIELDS)
    .lean();

  return getTeamFineRestrictionFromMembers(members, currentId);
}

export function getTeamFineRestrictionMessage(
  restriction: TeamFineRestriction,
  action: 'uploads' | 'submission'
) {
  const lock = action === 'submission' ? 'Project submission is locked' : 'Project uploads are locked';
  if (restriction.isCurrentStudent) {
    return `${lock} until the administrator verifies and clears your outstanding fine.`;
  }

  const rollNo = restriction.member.rollNo ? ` (${restriction.member.rollNo})` : '';
  const nextAction = action === 'submission' ? 'submit the proposal' : 'upload the proposal';
  return `${lock} because ${restriction.member.name}${rollNo} has an outstanding fine. The administrator must clear it before any team member can ${nextAction}.`;
}
