export const APP_SETTINGS = {
  // The maximum number of slots a supervisor can hold
  MAX_SLOTS_PER_SUPERVISOR: 10,
  
  // This flexible flag determines how we count slots. 
  // 'STUDENT' = 1 slot per student user.
  // 'PROJECT' = 1 slot per project group.
  SLOT_CALCULATION_MODE: 'PROJECT' as 'STUDENT' | 'PROJECT',
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