import type { ProjectRatingValues } from '../../../config/projectRatings';
import type { SupervisorProject } from '../supervisorDashboardTypes';

export type SupervisorFetch = typeof fetch;

type JsonObject = Record<string, unknown>;

type SupervisorActionResponse = JsonObject & {
  message?: string;
};

export type SupervisorDashboardResponse = {
  projects: SupervisorProject[];
  migrationCode: string;
};

export type SupervisorExportRequest = {
  supervisorId: string;
  supervisorName: string;
  batchFilter: string;
  programFilter: string;
};

async function readJson(response: Response): Promise<JsonObject> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function getResponseError(json: JsonObject, fallback: string) {
  return typeof json.error === 'string' && json.error.trim()
    ? json.error
    : fallback;
}

async function postSupervisorAction(
  body: JsonObject,
  fallbackError: string,
  fetchImpl: SupervisorFetch
): Promise<SupervisorActionResponse> {
  const response = await fetchImpl('/api/dashboard/supervisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);

  if (!response.ok) {
    throw new Error(getResponseError(json, fallbackError));
  }

  return json;
}

export async function loadSupervisorDashboard(
  fetchImpl: SupervisorFetch = fetch
): Promise<SupervisorDashboardResponse> {
  const response = await fetchImpl('/api/dashboard/supervisor');
  const json = await readJson(response);

  if (!response.ok) {
    throw new Error(getResponseError(json, 'Failed to load supervisor projects.'));
  }

  return {
    projects: Array.isArray(json.projects)
      ? (json.projects as SupervisorProject[])
      : [],
    migrationCode:
      typeof json.migrationCode === 'string' && json.migrationCode
        ? json.migrationCode
        : 'N/A',
  };
}

export function updateSupervisorProjectStatus(
  input: {
    studentId: string;
    status: string;
    remarks: string;
    expectedStage: string;
    expectedVersion: number;
    ratings?: ProjectRatingValues;
  },
  fetchImpl: SupervisorFetch = fetch
) {
  return postSupervisorAction(
    {
      action: 'updateStatus',
      studentId: input.studentId,
      status: input.status,
      remarks: input.remarks,
      expectedStage: input.expectedStage,
      expectedVersion: input.expectedVersion,
      ...(input.ratings ? { ratings: input.ratings } : {}),
    },
    'Server failed to process the request.',
    fetchImpl
  );
}

export function migrateSupervisorStudent(
  input: {
    studentId: string;
    migrationCode: string;
  },
  fetchImpl: SupervisorFetch = fetch
) {
  return postSupervisorAction(
    {
      action: 'migrate',
      studentId: input.studentId,
      migrationCode: input.migrationCode,
    },
    'Invalid migration code.',
    fetchImpl
  );
}

export function expandSupervisorTeam(
  projectId: string,
  fetchImpl: SupervisorFetch = fetch
) {
  return postSupervisorAction(
    { action: 'expandTeam', projectId },
    'Failed to update team capacity.',
    fetchImpl
  );
}

export function removeSupervisorTeam(
  studentId: string,
  fetchImpl: SupervisorFetch = fetch
) {
  return postSupervisorAction(
    { action: 'removeStudent', studentId },
    'Failed to remove team.',
    fetchImpl
  );
}

export async function fetchSupervisorExport(
  request: SupervisorExportRequest,
  fetchImpl: SupervisorFetch = fetch
) {
  const response = await fetchImpl(
    `/api/export-pdf?id=${encodeURIComponent(request.supervisorId)}` +
      `&batch=${encodeURIComponent(request.batchFilter)}` +
      `&program=${encodeURIComponent(request.programFilter || 'All')}`
  );

  if (!response.ok) {
    throw new Error(
      `Export failed. Server responded with status: ${response.status}.`
    );
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('The exported file was empty.');
  }

  return blob;
}
