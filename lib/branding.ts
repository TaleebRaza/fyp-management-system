import { Buffer } from 'node:buffer';

import SystemConfig from '../models/SystemConfig';
import {
  DEFAULT_BRANDING,
  type BrandingDto,
} from '../types/branding';
import connectToDatabase from './mongodb';

export const BRANDING_CONFIG_KEY = 'branding';
export const MAX_BRANDING_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_BRANDING_LOGO_DIMENSION = 2_048;

export class BrandingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandingValidationError';
  }
}

type BrandingRecord = {
  universityName?: unknown;
  primaryColor?: unknown;
  accentColor?: unknown;
  brandingLogo?: Buffer | Uint8Array | null;
  brandingLogoUpdatedAt?: Date | null;
};

type BrandingSettings = Pick<BrandingDto, 'universityName' | 'primaryColor' | 'accentColor'>;

function normalizeColor(value: unknown, field: string, fallback: string) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const color = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new BrandingValidationError(`${field} must be a six-digit hexadecimal color.`);
  }
  return color;
}

function getReadableTextColor(color: string): '#000000' | '#ffffff' {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
  const luminance = channels.reduce(
    (total, channel, index) => total + [0.2126, 0.7152, 0.0722][index] * (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ),
    0
  );
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function hasBrandingLogo(value: unknown): value is Buffer | Uint8Array {
  return value instanceof Uint8Array && value.byteLength > 0;
}

function readStoredColor(value: unknown, fallback: string) {
  try {
    return normalizeColor(value, 'Brand color', fallback);
  } catch {
    return fallback;
  }
}

function readStoredUniversityName(value: unknown) {
  const universityName = String(value || '').trim();
  return universityName && universityName.length <= 120
    ? universityName
    : DEFAULT_BRANDING.universityName;
}

export function parseBrandingSettings(input: {
  universityName?: unknown;
  primaryColor?: unknown;
  accentColor?: unknown;
}): BrandingSettings {
  const universityName = String(input.universityName || '').trim();
  if (!universityName || universityName.length > 120) {
    throw new BrandingValidationError('University name must be between 1 and 120 characters.');
  }

  return {
    universityName,
    primaryColor: normalizeColor(input.primaryColor, 'Primary color', DEFAULT_BRANDING.primaryColor),
    accentColor: normalizeColor(input.accentColor, 'Accent color', DEFAULT_BRANDING.accentColor),
  };
}

export function validateBrandingLogo(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BRANDING_LOGO_BYTES) {
    throw new BrandingValidationError('Logo must be a PNG no larger than 2 MiB.');
  }
  if (
    bytes.byteLength < 24
    || ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    throw new BrandingValidationError('Logo must be a valid PNG image.');
  }

  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isIhdr = header.getUint32(8) === 13
    && bytes[12] === 0x49
    && bytes[13] === 0x48
    && bytes[14] === 0x44
    && bytes[15] === 0x52;
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  if (!isIhdr || width === 0 || height === 0 || width > MAX_BRANDING_LOGO_DIMENSION || height > MAX_BRANDING_LOGO_DIMENSION) {
    throw new BrandingValidationError('Logo dimensions must be between 1 and 2048 pixels.');
  }
}

export function serializeBranding(record: BrandingRecord | null | undefined): BrandingDto {
  const primaryColor = readStoredColor(record?.primaryColor, DEFAULT_BRANDING.primaryColor);
  const accentColor = readStoredColor(record?.accentColor, DEFAULT_BRANDING.accentColor);
  const hasLogo = hasBrandingLogo(record?.brandingLogo);
  const updatedAt = record?.brandingLogoUpdatedAt?.getTime();

  return {
    universityName: readStoredUniversityName(record?.universityName),
    primaryColor,
    accentColor,
    primaryTextColor: getReadableTextColor(primaryColor),
    accentTextColor: getReadableTextColor(accentColor),
    logoUrl: hasLogo && updatedAt ? `/api/branding/logo?v=${updatedAt}` : DEFAULT_BRANDING.logoUrl,
  };
}

export async function getBranding() {
  await connectToDatabase();
  const branding = await SystemConfig.findOne({ configKey: BRANDING_CONFIG_KEY })
    .select('universityName primaryColor accentColor brandingLogo brandingLogoUpdatedAt')
    .lean();
  return serializeBranding(branding);
}

export async function getBrandingLogo() {
  await connectToDatabase();
  const branding = await SystemConfig.findOne({ configKey: BRANDING_CONFIG_KEY })
    .select('brandingLogo')
    .lean();
  return hasBrandingLogo(branding?.brandingLogo) ? Buffer.from(branding.brandingLogo) : null;
}

export async function saveBranding(settings: BrandingSettings, logo?: Buffer) {
  await connectToDatabase();
  const branding = await SystemConfig.findOneAndUpdate(
    { configKey: BRANDING_CONFIG_KEY },
    {
      $set: {
        ...settings,
        ...(logo ? { brandingLogo: logo, brandingLogoUpdatedAt: new Date() } : {}),
      },
      $setOnInsert: { configKey: BRANDING_CONFIG_KEY },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return serializeBranding(branding);
}
