type StoredPasswordResetKnowledge = {
  rollNo: string;
  supervisorId: string;
  batch: string;
  program: string;
  teammateRollNos: string[];
  requiresTeammate: boolean;
};

type ProvidedPasswordResetKnowledge = Omit<StoredPasswordResetKnowledge, 'teammateRollNos' | 'requiresTeammate'> & {
  teammateRollNo: string;
};

export function matchesPasswordResetKnowledge(
  stored: StoredPasswordResetKnowledge,
  provided: ProvidedPasswordResetKnowledge
) {
  return stored.rollNo === provided.rollNo
    && stored.supervisorId === provided.supervisorId
    && stored.batch === provided.batch
    && stored.program === provided.program
    && (!stored.requiresTeammate || stored.teammateRollNos.includes(provided.teammateRollNo));
}
