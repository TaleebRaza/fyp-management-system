export const DEFAULT_TEAM_SIZE = 2 as const;
export const EXPANDED_TEAM_SIZE = 3 as const;

export type TeamCapacity = typeof DEFAULT_TEAM_SIZE | typeof EXPANDED_TEAM_SIZE;

export function getTeamCapacity(value: unknown): TeamCapacity {
  return Number(value) === EXPANDED_TEAM_SIZE
    ? EXPANDED_TEAM_SIZE
    : DEFAULT_TEAM_SIZE;
}
