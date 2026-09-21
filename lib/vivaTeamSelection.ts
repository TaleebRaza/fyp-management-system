export type ProgramTeam = { id: string; program: string };

export type ProgramQuotaResult = {
  selectedIds: string[];
  shortages: Array<{ program: string; requested: number; selected: number; missing: number }>;
};

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectTeamsByProgramQuota(
  teams: readonly ProgramTeam[],
  quotas: Readonly<Record<string, number>>,
  random: () => number = Math.random
): ProgramQuotaResult {
  const selectedIds: string[] = [];
  const shortages: ProgramQuotaResult['shortages'] = [];

  for (const [program, rawRequested] of Object.entries(quotas)) {
    const requested = Number.isFinite(rawRequested) ? Math.max(0, Math.floor(rawRequested)) : 0;
    if (requested === 0) continue;

    const available = teams.filter((team) => team.program === program);
    const selected = shuffled(available, random).slice(0, requested);
    selectedIds.push(...selected.map((team) => team.id));
    if (selected.length < requested) {
      shortages.push({
        program,
        requested,
        selected: selected.length,
        missing: requested - selected.length,
      });
    }
  }

  return { selectedIds, shortages };
}
