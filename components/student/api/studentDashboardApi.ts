import type {
  AvailableSupervisor,
  StudentDashboardData,
  WordTemplate,
} from '../studentDashboardTypes';

type HeadlineResponse = {
  headline?: { text?: string };
  error?: string;
};

type TemplatesResponse = {
  templates?: unknown[];
  error?: string;
};

type UploadTokenResponse = {
  uploadUrl?: string;
  url?: string;
  error?: string;
};

export type StudentProjectSubmission = {
  id: string;
  title: string;
  desc: string;
  domains: string[];
  tools: string;
  pdfUrl?: string;
  fileSize: number;
};

export type StudentProjectSubmissionResponse = {
  message?: string;
  error?: string;
};

export type StudentPdfUpload = {
  url: string;
  fileSize: number;
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T));
}

function readError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

function isWordTemplate(value: unknown): value is WordTemplate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WordTemplate>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.filename === 'string' &&
    candidate.format === 'word' &&
    typeof candidate.content === 'string'
  );
}

export async function getStudentHeadline(): Promise<string> {
  const response = await fetch('/api/headline');
  const data = await readJson<HeadlineResponse>(response);
  if (!response.ok) throw new Error(readError(data, 'Failed to load headline.'));
  return data.headline?.text || '';
}

export async function getStudentDashboard(
  userId: string
): Promise<StudentDashboardData> {
  const response = await fetch(
    `/api/dashboard/student?id=${encodeURIComponent(userId)}`,
    { cache: 'no-store' }
  );
  const data = await readJson<StudentDashboardData & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to load student dashboard.'));
  }
  return data;
}

export async function getStudentSupervisors(): Promise<AvailableSupervisor[]> {
  const response = await fetch('/api/supervisors');
  const data: unknown = await response.json().catch(() => []);
  if (!response.ok) throw new Error(readError(data, 'Failed to load supervisors.'));
  return Array.isArray(data) ? (data as AvailableSupervisor[]) : [];
}

export async function getStudentTemplates(stage: string): Promise<WordTemplate[]> {
  const response = await fetch(`/api/templates?stage=${encodeURIComponent(stage)}`);
  const data = await readJson<TemplatesResponse>(response);
  if (!response.ok) throw new Error(readError(data, 'Failed to load templates.'));
  return Array.isArray(data.templates) ? data.templates.filter(isWordTemplate) : [];
}

export async function uploadStudentPdf(selectedFile: File): Promise<StudentPdfUpload> {
  if (selectedFile.type !== 'application/pdf') {
    throw new Error('Only PDF documents are allowed.');
  }
  if (selectedFile.size > 4 * 1024 * 1024) {
    throw new Error('File exceeds the 4MB limit.');
  }

  const tokenResponse = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: selectedFile.name,
      contentType: selectedFile.type,
      fileSize: selectedFile.size,
    }),
  });
  const tokenData = await readJson<UploadTokenResponse>(tokenResponse);
  if (!tokenResponse.ok) {
    throw new Error(readError(tokenData, 'Failed to prepare secure upload.'));
  }
  if (!tokenData.uploadUrl || !tokenData.url) {
    throw new Error('Secure upload response was incomplete.');
  }

  const uploadResponse = await fetch(tokenData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': selectedFile.type },
    body: selectedFile,
  });
  if (!uploadResponse.ok) {
    throw new Error('PDF upload failed. Please try again.');
  }

  return { url: tokenData.url, fileSize: selectedFile.size };
}

export async function submitStudentProject(
  input: StudentProjectSubmission
): Promise<StudentProjectSubmissionResponse> {
  const response = await fetch('/api/dashboard/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, action: 'submitProject' }),
  });
  const data = await readJson<StudentProjectSubmissionResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to submit project.'));
  }
  return data;
}
