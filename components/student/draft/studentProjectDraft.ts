export type StudentProjectDraft = {
  title: string;
  desc: string;
  selectedDomains: string[];
  legacyDomain: string;
  tools: string;
};

type StudentProjectDraftInput = {
  title?: string;
  desc?: string;
  domains?: string[];
  legacyDomain?: string;
  tools?: string;
};

export const EMPTY_STUDENT_PROJECT_DRAFT: StudentProjectDraft = {
  title: '',
  desc: '',
  selectedDomains: [],
  legacyDomain: '',
  tools: '',
};

export function getStudentProjectDraftKey(userId: string): string {
  return `fyp-portal:student-project-draft:v1:${userId}`;
}

export function getStudentProjectFileDraftKey(userId: string): string {
  return `${getStudentProjectDraftKey(userId)}:pdf`;
}

export function createStudentProjectDraft(
  input: StudentProjectDraftInput
): StudentProjectDraft {
  const selectedDomains = Array.isArray(input.domains)
    ? input.domains.filter((domain): domain is string => typeof domain === 'string')
    : [];

  return {
    title: input.title || '',
    desc: input.desc || '',
    selectedDomains,
    legacyDomain: selectedDomains.length === 0 ? input.legacyDomain || '' : '',
    tools: input.tools || '',
  };
}

export function hasStudentProjectDraftChanges(
  draft: StudentProjectDraft,
  baseline: StudentProjectDraft | null
): boolean {
  if (!baseline) return true;
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}
