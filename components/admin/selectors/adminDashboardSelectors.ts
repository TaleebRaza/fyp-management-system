import type {
  AdminStats,
  AdminStudent,
  AdminSupervisor,
} from '../adminDashboardTypes';

export function filterAdminSupervisors(
  supervisors: AdminSupervisor[],
  search: string
): AdminSupervisor[] {
  const query = search.trim().toLowerCase();
  if (!query) return supervisors;

  return supervisors.filter((supervisor) => {
    const fields = [
      supervisor.name,
      supervisor.rollNo,
      supervisor.email,
      supervisor.migrationCode,
    ];

    return fields.some((field) => String(field || '').toLowerCase().includes(query));
  });
}

export function buildAdminStats(
  students: AdminStudent[],
  totalStudents: number,
  supervisorCount: number
): AdminStats {
  const loadedStudents = Array.isArray(students) ? students : [];
  const activeStudents = loadedStudents.filter(
    (student) => student.isActive !== false
  ).length;
  const pendingStudents = loadedStudents.filter(
    (student) => student.status && student.status !== 'Approved'
  ).length;

  return {
    totalStudents: totalStudents || loadedStudents.length,
    loadedStudents: loadedStudents.length,
    activeStudents,
    pendingStudents,
    supervisors: supervisorCount,
  };
}

export function createAdminBatchOptions(currentYear: number): string[] {
  const options: string[] = [];

  for (let year = 2021; year <= currentYear + 1; year += 1) {
    options.push(`Spring ${year}`);
    options.push(`Fall ${year}`);
  }

  return options;
}

export function clampSupervisorExtraSlots(
  value: unknown,
  maximum: number
): number {
  return Math.min(Math.max(Number(value || 0), 0), maximum);
}

export function createSupervisorMigrationCode(randomValue = Math.random()): string {
  return randomValue.toString(36).substring(2, 8).toUpperCase();
}
