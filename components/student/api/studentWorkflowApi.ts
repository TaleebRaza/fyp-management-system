export type StudentWorkflowResponse = {
  message?: string;
  error?: string;
};

export type StudentSupervisorAction = 'assignSupervisor' | 'changeSupervisor';

export type StudentSupervisorRequest = {
  action: StudentSupervisorAction;
  id: string;
  supervisorId: string;
};

export type StudentAcademicUpdateRequest = {
  id: string;
  program: string;
  batch: string;
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

export async function updateStudentSupervisor(
  input: StudentSupervisorRequest
): Promise<StudentWorkflowResponse> {
  const response = await fetch('/api/dashboard/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson<StudentWorkflowResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to update supervisor.'));
  }
  return data;
}

export async function joinStudentTeam(
  inviteCode: string
): Promise<StudentWorkflowResponse> {
  const response = await fetch('/api/project/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  const data = await readJson<StudentWorkflowResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to join team.'));
  }
  return data;
}

export async function leaveStudentTeam(): Promise<StudentWorkflowResponse> {
  const response = await fetch('/api/project/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await readJson<StudentWorkflowResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to leave the team.'));
  }
  return data;
}

export async function updateStudentAcademicInfo(
  input: StudentAcademicUpdateRequest
): Promise<StudentWorkflowResponse> {
  const response = await fetch('/api/dashboard/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateProgramBatch',
      id: input.id,
      program: input.program,
      batch: input.batch,
    }),
  });
  const data = await readJson<StudentWorkflowResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to update program and batch.'));
  }
  return data;
}

export async function updateStudentName(name: string): Promise<StudentWorkflowResponse> {
  const response = await fetch('/api/dashboard/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateName', name }),
  });
  const data = await readJson<StudentWorkflowResponse>(response);
  if (!response.ok) {
    throw new Error(readError(data, 'Failed to update name.'));
  }
  return data;
}
