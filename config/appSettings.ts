export const APP_SETTINGS = {
  // The maximum number of slots a supervisor can hold
  MAX_SLOTS_PER_SUPERVISOR: 30,

  // This flexible flag determines how we count slots.
  // 'STUDENT' = 1 slot per student user.
  // 'PROJECT' = 1 slot per project group.
  SLOT_CALCULATION_MODE: 'PROJECT' as 'STUDENT' | 'PROJECT',

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

export const MAX_TEAM_MEMBERS = 2;

export const PROJECT_STAGES = [
  'PROPOSAL',
  'THESIS_DRAFT',
  'FINAL_DELIVERABLES',
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const DEFAULT_PROJECT_STAGE: ProjectStage = 'PROPOSAL';

export const PROGRAM_MAP = {
  'BSCS': 'BS Computer Science',
  'BSAI': 'BS Artificial Intelligence',
  'BSTN': 'BS Telecommunication & Networking',
  'BSSE': 'BS Software Engineering',
  'BSCYS': 'BS Cyber Security',
  'BSROB': 'BS Robotics',
  'BSDS': 'BS Data Science',
} as const;

export type ProgramKey = keyof typeof PROGRAM_MAP;
export const PROGRAM_KEYS = Object.keys(PROGRAM_MAP) as ProgramKey[];
export const DEFAULT_PROGRAM: ProgramKey = 'BSCS';
