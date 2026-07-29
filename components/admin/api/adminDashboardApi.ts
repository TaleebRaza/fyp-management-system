import type {
  AdminReportsData,
  AdminStudent,
  AdminSupervisor,
  StudentPagination,
} from '../adminDashboardTypes';

type JsonObject = Record<string, unknown>;

export type AdminMutationResult<T extends JsonObject = JsonObject> = {
  ok: boolean;
  data: T;
};

export type AdminStudentQuery = {
  page: number;
  limit: number;
  studentFilter: string;
  batchFilter: string;
  search: string;
  programCodes: readonly string[];
};

export type AdminStudentsResponse = {
  students?: AdminStudent[];
  pagination?: StudentPagination;
  filterMeta?: {
    batches?: string[];
  };
  error?: string;
};

type HeadlineResponse = {
  headline?: {
    text?: string;
  };
  message?: string;
  error?: string;
};

type UpdateEmailResponse = {
  user?: {
    email?: string;
  };
  email?: string;
  message?: string;
  error?: string;
};

async function readJson<T extends JsonObject>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T));
}

async function postJson<T extends JsonObject>(
  path: string,
  body: JsonObject
): Promise<AdminMutationResult<T>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    ok: response.ok,
    data: await readJson<T>(response),
  };
}

export function buildAdminStudentSearchParams(query: AdminStudentQuery): URLSearchParams {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });

  if (query.programCodes.includes(query.studentFilter)) {
    params.set('program', query.studentFilter);
  } else if (query.studentFilter !== 'All') {
    params.set('status', query.studentFilter);
  }

  if (query.batchFilter !== 'All') {
    params.set('batch', query.batchFilter);
  }

  if (query.search) {
    params.set('search', query.search);
  }

  return params;
}

export async function getAdminHeadline(): Promise<string> {
  const response = await fetch('/api/headline');
  const data = await readJson<HeadlineResponse>(response);
  return data.headline?.text || '';
}

export async function publishAdminHeadline(
  text: string
): Promise<AdminMutationResult<HeadlineResponse>> {
  return postJson<HeadlineResponse>('/api/headline', { text });
}

export async function getAdminSupervisors(): Promise<AdminSupervisor[]> {
  const response = await fetch('/api/admin/supervisors', { cache: 'no-store' });
  const data: unknown = await response.json();
  return Array.isArray(data) ? (data as AdminSupervisor[]) : [];
}

export async function getAdminStudents(
  query: AdminStudentQuery
): Promise<AdminStudentsResponse> {
  const params = buildAdminStudentSearchParams(query);
  const response = await fetch(`/api/admin/students?${params.toString()}`, {
    cache: 'no-store',
  });
  const data = await readJson<AdminStudentsResponse>(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch students');
  }

  return data;
}

export async function getAdminReports(): Promise<AdminReportsData> {
  const response = await fetch('/api/admin/reports', { cache: 'no-store' });
  const data = await readJson<AdminReportsData & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load reports');
  }

  return data;
}

export async function createAdminSupervisor(input: {
  name: string;
  email: string;
  rollNo: string;
  password: string;
  migrationCode: string;
}): Promise<AdminMutationResult<{ message?: string; error?: string }>> {
  return postJson('/api/add-supervisor', input);
}

export async function deleteAdminSupervisor(
  id: string
): Promise<AdminMutationResult> {
  return postJson('/api/delete-supervisor', { id });
}

export async function setSupervisorNotifications(
  id: string,
  enabled: boolean
): Promise<AdminMutationResult> {
  return postJson('/api/supervisors/toggle-notifications', { id, enabled });
}

export async function updateSupervisorExtraSlots(
  supervisorId: string,
  extraSlots: number
): Promise<AdminMutationResult<{ message?: string; error?: string }>> {
  return postJson('/api/admin/update-supervisor-slots', {
    supervisorId,
    extraSlots,
  });
}

export async function updateAdminEmail(
  targetUserId: string,
  newEmail: string
): Promise<AdminMutationResult<UpdateEmailResponse>> {
  return postJson('/api/admin/update-email', { targetUserId, newEmail });
}

export async function updateStudentProgram(
  targetUserId: string,
  newProgram: string
): Promise<AdminMutationResult<{ message?: string; error?: string }>> {
  return postJson('/api/admin/update-program', { targetUserId, newProgram });
}

export async function updateStudentBatch(
  targetUserId: string,
  newBatch: string
): Promise<AdminMutationResult<{ message?: string; error?: string }>> {
  return postJson('/api/admin/update-batch', { targetUserId, newBatch });
}

export async function promoteStudentBatch(
  targetBatch: string
): Promise<AdminMutationResult<{ message?: string; error?: string }>> {
  return postJson('/api/admin/promote-batch', { targetBatch });
}

export async function toggleAdminStudent(
  studentId: string,
  isActive: boolean
): Promise<AdminMutationResult> {
  return postJson('/api/admin/toggle-student', { studentId, isActive });
}
