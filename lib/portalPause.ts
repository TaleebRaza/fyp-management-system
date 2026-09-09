import connectToDatabase from './mongodb';
import SystemConfig from '../models/SystemConfig';

export const PORTAL_CONFIG_KEY = 'portal';
export const DEFAULT_PORTAL_PAUSE_REASON =
  'The portal is temporarily unavailable while the administrator performs maintenance.';
export const DEFAULT_MAINTENANCE_REASON =
  'The portal is temporarily unavailable while a protected maintenance operation is running.';

export type PortalPause = {
  paused: boolean;
  maintenance: boolean;
  reason: string;
};

export async function getPortalPause(): Promise<PortalPause> {
  await connectToDatabase();
  const config = await SystemConfig.findOne({ configKey: PORTAL_CONFIG_KEY })
    .select('portalPaused portalPauseReason portalMaintenance portalMaintenanceReason')
    .lean();

  const maintenance = config?.portalMaintenance === true;

  return {
    paused: config?.portalPaused === true || maintenance,
    maintenance,
    reason: String(
      maintenance
        ? config?.portalMaintenanceReason || DEFAULT_MAINTENANCE_REASON
        : config?.portalPauseReason || DEFAULT_PORTAL_PAUSE_REASON
    ),
  };
}
