import type { FineRestriction, StudentDashboardData } from '../studentDashboardTypes';

export type StudentFineRestrictionState = {
  fineRestriction: FineRestriction | null;
  teamFineRestriction: FineRestriction | null;
  isOwnFineRestricted: boolean;
  isFineRestricted: boolean;
  teamFineMessage: string;
};

export function getStudentFineRestrictionState(
  data: StudentDashboardData | null
): StudentFineRestrictionState {
  const fineRestriction = data?.fineRestriction || null;
  const teamFineRestriction = data?.teamFineRestriction || fineRestriction;
  const isOwnFineRestricted = Boolean(fineRestriction?.active);
  const isFineRestricted = Boolean(teamFineRestriction?.active);
  const restrictedMember = teamFineRestriction?.member;
  const restrictedMemberLabel = `${restrictedMember?.name || 'A team member'}${
    restrictedMember?.rollNo ? ` (${restrictedMember.rollNo})` : ''
  }`;
  const teamFineMessage =
    teamFineRestriction?.isCurrentStudent !== false
      ? 'Project uploads are locked until the administrator verifies and clears your outstanding fine.'
      : `Project uploads are locked because ${restrictedMemberLabel} has an outstanding fine. The administrator must clear it before any team member can upload the proposal.`;

  return {
    fineRestriction,
    teamFineRestriction,
    isOwnFineRestricted,
    isFineRestricted,
    teamFineMessage,
  };
}
