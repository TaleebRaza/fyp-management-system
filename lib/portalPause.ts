import connectToDatabase from './mongodb';
import SystemConfig from '../models/SystemConfig';

export const PORTAL_CONFIG_KEY = 'portal';
export const DEFAULT_PORTAL_PAUSE_REASON =
  'The portal is temporarily unavailable while the administrator performs maintenance.';

export type PortalPause = {
  paused: boolean;
  reason: string;
};

export async function getPortalPause(): Promise<PortalPause> {
  await connectToDatabase();
  const config = await SystemConfig.findOne({ configKey: PORTAL_CONFIG_KEY })
    .select('portalPaused portalPauseReason')
    .lean();

  return {
    paused: config?.portalPaused === true,
    reason: String(config?.portalPauseReason || DEFAULT_PORTAL_PAUSE_REASON),
  };
}
