export const APP_SETTINGS = {
  // The maximum number of slots a supervisor can hold
  MAX_SLOTS_PER_SUPERVISOR: 30,

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

export const PROGRAM_MAP: Record<string, string> = {
  'BSCS': 'BS Computer Science',
  'BSAI': 'BS Artificial Intelligence',
  'BSTN': 'BS Telecommunication & Networking',
  'BSSE': 'BS Software Engineering',
  'BSCYS': 'BS Cyber Security',
  'BSROB': 'BS Robotics',
  'BSDS': 'BS Data Science'
};
