import connectToDatabase from './mongodb';
import SystemConfig from '../models/SystemConfig';

export const PORTAL_CONFIG_KEY = 'portal';
export const DEFAULT_PORTAL_PAUSE_REASON =
  'The portal is temporarily unavailable while the administrator performs maintenance.';

export type PortalPause = {
  paused: boolean;
  reason: string;
};

const PORTAL_PAUSE_CACHE_MS = 5_000;
let cachedPortalPause: { value: PortalPause; expiresAt: number } | null = null;
let portalPauseRead: Promise<PortalPause> | null = null;
let portalPauseCacheGeneration = 0;

export function invalidatePortalPauseCache(): void {
  cachedPortalPause = null;
  portalPauseCacheGeneration += 1;
}

export async function getPortalPause(): Promise<PortalPause> {
  if (cachedPortalPause && cachedPortalPause.expiresAt > Date.now()) {
    return cachedPortalPause.value;
  }
  if (portalPauseRead) return portalPauseRead;

  const readGeneration = portalPauseCacheGeneration;
  portalPauseRead = (async () => {
    await connectToDatabase();
    const config = await SystemConfig.findOne({ configKey: PORTAL_CONFIG_KEY })
      .select('portalPaused portalPauseReason')
      .lean();
    const value = {
      paused: config?.portalPaused === true,
      reason: String(config?.portalPauseReason || DEFAULT_PORTAL_PAUSE_REASON),
    };
    if (readGeneration === portalPauseCacheGeneration) {
      cachedPortalPause = { value, expiresAt: Date.now() + PORTAL_PAUSE_CACHE_MS };
    }
    return value;
  })();

  try {
    return await portalPauseRead;
  } finally {
    portalPauseRead = null;
  }
}
