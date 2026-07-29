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

export const MAX_STUDENT_DRAFT_TITLE_LENGTH = 200;
export const MAX_STUDENT_DRAFT_DESCRIPTION_LENGTH = 5_000;
export const MAX_STUDENT_DRAFT_TOOLS_LENGTH = 1_000;
export const MAX_STUDENT_DRAFT_DOMAINS = 10;
export const MAX_STUDENT_DRAFT_DOMAIN_LENGTH = 64;
export const MAX_STUDENT_PROJECT_FILE_BYTES = 4 * 1024 * 1024;

function draftText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

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
    ? input.domains
        .filter((domain): domain is string => typeof domain === 'string')
        .slice(0, MAX_STUDENT_DRAFT_DOMAINS)
        .map((domain) => domain.slice(0, MAX_STUDENT_DRAFT_DOMAIN_LENGTH))
    : [];

  return {
    title: draftText(input.title, MAX_STUDENT_DRAFT_TITLE_LENGTH),
    desc: draftText(input.desc, MAX_STUDENT_DRAFT_DESCRIPTION_LENGTH),
    selectedDomains,
    legacyDomain: selectedDomains.length === 0
      ? draftText(input.legacyDomain, MAX_STUDENT_DRAFT_DOMAIN_LENGTH)
      : '',
    tools: draftText(input.tools, MAX_STUDENT_DRAFT_TOOLS_LENGTH),
  };
}

export function hasStudentProjectDraftChanges(
  draft: StudentProjectDraft,
  baseline: StudentProjectDraft | null
): boolean {
  if (!baseline) return true;
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}
