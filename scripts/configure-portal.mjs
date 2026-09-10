import mongoose from 'mongoose';

const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

class ConfigurationValidationError extends Error {}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, maximum, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) throw new ConfigurationValidationError(`${name} is invalid.`);
  return text;
}

function parseCategory(value, name) {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || !Number.isInteger(value.ageDays) || value.ageDays < 1 || value.ageDays > 3650) {
    throw new ConfigurationValidationError(`${name} retention is invalid.`);
  }
  return { enabled: value.enabled, ageDays: value.ageDays };
}

function parseRetention(value) {
  if (!isRecord(value) || !isRecord(value.schedule) || typeof value.schedule.enabled !== 'boolean') {
    throw new ConfigurationValidationError('Retention settings are invalid.');
  }
  const timezone = requiredText(value.schedule.timezone, 100, 'Retention timezone');
  const time = requiredText(value.schedule.time, 5, 'Retention time');
  if (!TIME_PATTERN.test(time)) throw new ConfigurationValidationError('Retention time is invalid.');
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
  } catch {
    throw new ConfigurationValidationError('Retention timezone is invalid.');
  }
  return {
    schedule: { enabled: value.schedule.enabled, timezone, time },
    playedVoiceNotes: parseCategory(value.playedVoiceNotes, 'Played voice-note'),
    unplayedVoiceNotes: parseCategory(value.unplayedVoiceNotes, 'Unplayed voice-note'),
    audioBroadcasts: parseCategory(value.audioBroadcasts, 'Audio broadcast'),
    unusedPdfUploads: parseCategory(value.unusedPdfUploads, 'Unused PDF upload'),
  };
}

function parseLogo(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 3 * 1024 * 1024) {
    throw new ConfigurationValidationError('Branding logo is invalid.');
  }
  const logo = Buffer.from(value, 'base64');
  if (logo.length < 24 || logo.length > 2 * 1024 * 1024 || !logo.subarray(0, 8).equals(PNG_SIGNATURE) || logo.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ConfigurationValidationError('Branding logo is invalid.');
  }
  const width = logo.readUInt32BE(16);
  const height = logo.readUInt32BE(20);
  if (width < 1 || width > 2048 || height < 1 || height > 2048) {
    throw new ConfigurationValidationError('Branding logo dimensions are invalid.');
  }
  return logo;
}

function parseInput(value) {
  if (!isRecord(value) || !isRecord(value.branding)) {
    throw new ConfigurationValidationError('Portal configuration is invalid.');
  }
  const primaryColor = requiredText(value.branding.primaryColor, 7, 'Primary color').toLowerCase();
  const accentColor = requiredText(value.branding.accentColor, 7, 'Accent color').toLowerCase();
  if (!COLOR_PATTERN.test(primaryColor) || !COLOR_PATTERN.test(accentColor)) {
    throw new ConfigurationValidationError('Branding colors are invalid.');
  }
  return {
    branding: {
      universityName: requiredText(value.branding.universityName, 120, 'University name'),
      primaryColor,
      accentColor,
      logo: parseLogo(value.branding.logoBase64),
    },
    retention: parseRetention(value.retention),
  };
}

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4 * 1024 * 1024) throw new ConfigurationValidationError('Portal configuration is too large.');
  }
  try {
    return parseInput(JSON.parse(input));
  } catch (error) {
    if (error instanceof ConfigurationValidationError) throw error;
    throw new ConfigurationValidationError('Portal configuration is invalid.');
  }
}

async function configure(input) {
  const database = mongoose.connection.db;
  if (!database) throw new Error('Database connection is unavailable.');
  const configs = database.collection('systemconfigs');
  const now = new Date();
  const branding = {
    universityName: input.branding.universityName,
    primaryColor: input.branding.primaryColor,
    accentColor: input.branding.accentColor,
    updatedAt: now,
  };
  if (input.branding.logo) {
    branding.brandingLogo = input.branding.logo;
    branding.brandingLogoUpdatedAt = now;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await configs.updateOne(
        { configKey: 'branding' },
        { $set: branding, $setOnInsert: { configKey: 'branding', createdAt: now } },
        { upsert: true, session }
      );
      await configs.updateOne(
        { configKey: 'retention' },
        { $set: { retentionSettings: input.retention, updatedAt: now }, $setOnInsert: { configKey: 'retention', createdAt: now } },
        { upsert: true, session }
      );
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new ConfigurationValidationError('MONGODB_URI is required.');
  const input = await readInput();
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  await configure(input);
  process.stdout.write('{"configured":true}\n');
}

try {
  await main();
} catch (error) {
  if (error instanceof ConfigurationValidationError) {
    console.error(error.message);
  } else {
    console.error('portal_configuration_failed');
  }
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
