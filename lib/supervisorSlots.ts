import { APP_SETTINGS } from '../config/appSettings';

export const MAX_EXTRA_SUPERVISOR_SLOTS = 10;

export function normalizeExtraSupervisorSlots(value: unknown) {
  const parsedValue = Number(value ?? 0);

  if (!Number.isFinite(parsedValue)) return 0;

  return Math.min(
    Math.max(Math.trunc(parsedValue), 0),
    MAX_EXTRA_SUPERVISOR_SLOTS
  );
}

export function getSupervisorExtraSlots(supervisor: any) {
  return normalizeExtraSupervisorSlots(supervisor?.extraSlots ?? 0);
}

export function getSupervisorMaxSlots(supervisor: any) {
  return APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR + getSupervisorExtraSlots(supervisor);
}