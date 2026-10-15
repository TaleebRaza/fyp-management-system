export type SupervisorLoginRow = {
  _id: unknown;
  name?: string;
  rollNo?: string;
  monthlyLoginCount?: number;
  lastLoginMonth?: string;
  lastLoginAt?: Date | string;
};

export function buildSupervisorLoginReport(supervisors: SupervisorLoginRow[], now = new Date()) {
  const currentMonth = now.toISOString().slice(0, 7);
  return supervisors.map((row) => ({
    label: row.name || row.rollNo || 'Unknown Supervisor',
    total: row.lastLoginMonth === currentMonth ? Number(row.monthlyLoginCount || 0) : 0,
    note: row.lastLoginAt
      ? `Last login ${new Date(row.lastLoginAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })}`
      : row.lastLoginMonth
        ? `Last login ${row.lastLoginMonth} (exact date unavailable)`
        : 'No recorded logins',
  })).sort((first, second) => second.total - first.total || first.label.localeCompare(second.label));
}
