export const APP_SETTINGS = {
  // The maximum number of slots a supervisor can hold
  MAX_SLOTS_PER_SUPERVISOR: 30,

  // Voice notes retained per sender in each project.
  MAX_VOICE_NOTES_PER_SENDER: 3,

  // Late-registration policy.
  // Students registering on or before DEADLINE_DATE in Asia/Karachi pay no fine.
  // Every Pakistan calendar day after the deadline adds FINE_PER_DAY.
  LATE_REGISTRATION: {
    ENABLED: true,
    DEADLINE_DATE: '2026-07-13',
    TIME_ZONE: 'Asia/Karachi',
    FINE_PER_DAY: 10,
  },
};

export const DEFAULT_TEAM_SIZE = 2 as const;
export const EXPANDED_TEAM_SIZE = 3 as const;

type TeamCapacity = typeof DEFAULT_TEAM_SIZE | typeof EXPANDED_TEAM_SIZE;

export function getTeamCapacity(value: unknown): TeamCapacity {
  return Number(value) === EXPANDED_TEAM_SIZE
    ? EXPANDED_TEAM_SIZE
    : DEFAULT_TEAM_SIZE;
}

export const PROGRAM_MAP: Record<string, string> = {
  'BSCS': 'BS Computer Science',
  'BSAI': 'BS Artificial Intelligence',
  'BSTN': 'BS Telecommunication & Networking',
  'BSSE': 'BS Software Engineering',
  'BSCYS': 'BS Cyber Security',
  'BSROB': 'BS Robotics',
  'BSDS': 'BS Data Science'
};
