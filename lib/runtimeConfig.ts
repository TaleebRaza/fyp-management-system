import { isValidEmailAddress, normalizeEmailAddress } from './security/input';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export class RuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigurationError';
  }
}

export type SmtpTlsMode = 'none' | 'starttls' | 'tls';

export type MailConfiguration = {
  fromAddress: string;
  fromName: string;
  replyTo?: string;
} & (
  | {
      transport: 'gmail';
      username: string;
      password: string;
    }
  | {
      transport: 'smtp';
      host: string;
      port: number;
      tlsMode: SmtpTlsMode;
      username?: string;
      password?: string;
    }
);

export type StorageConfiguration = {
  endpoint: string;
  browserEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  forcePathStyle: boolean;
};

export const DEFAULT_STORAGE_QUOTA_BYTES = 9.5 * 1024 * 1024 * 1024;

function optionalValue(environment: RuntimeEnvironment, name: string) {
  const value = environment[name]?.trim();
  return value || undefined;
}

function requiredValue(environment: RuntimeEnvironment, name: string) {
  const value = optionalValue(environment, name);
  if (!value) throw new RuntimeConfigurationError(`${name} is required.`);
  return value;
}

function requireEmailAddress(environment: RuntimeEnvironment, name: string) {
  const value = normalizeEmailAddress(requiredValue(environment, name));
  if (!isValidEmailAddress(value)) {
    throw new RuntimeConfigurationError(`${name} must be a valid email address.`);
  }
  return value;
}

function hasAnyValue(environment: RuntimeEnvironment, names: readonly string[]) {
  return names.some((name) => optionalValue(environment, name));
}

export function getMongoDbUri(environment: RuntimeEnvironment = process.env) {
  const uri = requiredValue(environment, 'MONGODB_URI');

  try {
    const protocol = new URL(uri).protocol;
    if (protocol !== 'mongodb:' && protocol !== 'mongodb+srv:') {
      throw new RuntimeConfigurationError('MONGODB_URI must use mongodb:// or mongodb+srv://.');
    }
  } catch (error) {
    if (error instanceof RuntimeConfigurationError) throw error;
    throw new RuntimeConfigurationError('MONGODB_URI must be a valid MongoDB connection URI.');
  }

  return uri;
}

export function getOptionalNextAuthSecret(environment: RuntimeEnvironment = process.env) {
  return optionalValue(environment, 'NEXTAUTH_SECRET');
}

export function getNextAuthSecret(environment: RuntimeEnvironment = process.env) {
  return requiredValue(environment, 'NEXTAUTH_SECRET');
}

export function getCronSecret(environment: RuntimeEnvironment = process.env) {
  return optionalValue(environment, 'CRON_SECRET');
}

function requireStorageEndpoint(environment: RuntimeEnvironment, name: string) {
  const value = requiredValue(environment, name);

  try {
    const endpoint = new URL(value);
    if (
      (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:')
      || endpoint.username
      || endpoint.password
      || endpoint.search
      || endpoint.hash
    ) {
      throw new Error('invalid endpoint');
    }
    return endpoint.toString().replace(/\/$/, '');
  } catch {
    throw new RuntimeConfigurationError(`${name} must be an HTTP or HTTPS endpoint without credentials, a query, or a fragment.`);
  }
}

function getLegacyR2StorageConfiguration(environment: RuntimeEnvironment): StorageConfiguration {
  return {
    endpoint: `https://${requiredValue(environment, 'R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    browserEndpoint: `https://${requiredValue(environment, 'R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    region: 'auto',
    accessKeyId: requiredValue(environment, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredValue(environment, 'R2_SECRET_ACCESS_KEY'),
    bucketName: requiredValue(environment, 'R2_BUCKET_NAME'),
    forcePathStyle: true,
  };
}

const S3_STORAGE_SETTING_NAMES = [
  'S3_ENDPOINT',
  'S3_BROWSER_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_FORCE_PATH_STYLE',
] as const;

const LEGACY_R2_STORAGE_SETTING_NAMES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
] as const;

function getS3ForcePathStyle(environment: RuntimeEnvironment) {
  const value = optionalValue(environment, 'S3_FORCE_PATH_STYLE');
  if (!value) return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new RuntimeConfigurationError('S3_FORCE_PATH_STYLE must be true or false.');
}

function getGenericS3StorageConfiguration(environment: RuntimeEnvironment): StorageConfiguration {
  return {
    endpoint: requireStorageEndpoint(environment, 'S3_ENDPOINT'),
    browserEndpoint: requireStorageEndpoint(environment, 'S3_BROWSER_ENDPOINT'),
    region: requiredValue(environment, 'S3_REGION'),
    accessKeyId: requiredValue(environment, 'S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredValue(environment, 'S3_SECRET_ACCESS_KEY'),
    bucketName: requiredValue(environment, 'S3_BUCKET_NAME'),
    forcePathStyle: getS3ForcePathStyle(environment),
  };
}

export function getStorageConfiguration(
  environment: RuntimeEnvironment = process.env
): StorageConfiguration {
  const hasS3Settings = hasAnyValue(environment, S3_STORAGE_SETTING_NAMES);
  const hasLegacyR2Settings = hasAnyValue(environment, LEGACY_R2_STORAGE_SETTING_NAMES);

  if (hasS3Settings && hasLegacyR2Settings) {
    throw new RuntimeConfigurationError('Configure either S3_* storage settings or legacy R2_* settings, not both.');
  }
  if (hasS3Settings) return getGenericS3StorageConfiguration(environment);
  if (hasLegacyR2Settings) return getLegacyR2StorageConfiguration(environment);
  throw new RuntimeConfigurationError('Storage is not configured. Configure S3_* storage settings or legacy R2_* settings.');
}

export function getStorageQuotaBytes(environment: RuntimeEnvironment = process.env) {
  const value = optionalValue(environment, 'STORAGE_QUOTA_BYTES');
  if (!value) return DEFAULT_STORAGE_QUOTA_BYTES;
  if (!/^\d+$/.test(value)) {
    throw new RuntimeConfigurationError('STORAGE_QUOTA_BYTES must be a positive integer number of bytes.');
  }

  const quota = Number(value);
  if (!Number.isSafeInteger(quota) || quota <= 0) {
    throw new RuntimeConfigurationError('STORAGE_QUOTA_BYTES must be a positive integer number of bytes.');
  }
  return quota;
}

function getSmtpTlsMode(environment: RuntimeEnvironment): SmtpTlsMode {
  const value = requiredValue(environment, 'SMTP_TLS_MODE').toLowerCase();
  if (value === 'none' || value === 'starttls' || value === 'tls') return value;
  throw new RuntimeConfigurationError('SMTP_TLS_MODE must be one of: none, starttls, tls.');
}

function getSmtpPort(environment: RuntimeEnvironment) {
  const value = requiredValue(environment, 'SMTP_PORT');
  if (!/^\d+$/.test(value)) {
    throw new RuntimeConfigurationError('SMTP_PORT must be an integer between 1 and 65535.');
  }

  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new RuntimeConfigurationError('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function getOptionalReplyTo(environment: RuntimeEnvironment, name: string) {
  const value = optionalValue(environment, name);
  if (!value) return undefined;
  const replyTo = normalizeEmailAddress(value);
  if (!isValidEmailAddress(replyTo)) {
    throw new RuntimeConfigurationError(`${name} must be a valid email address.`);
  }
  return replyTo;
}

function getGenericSmtpConfiguration(environment: RuntimeEnvironment): MailConfiguration {
  const username = optionalValue(environment, 'SMTP_USER');
  const password = optionalValue(environment, 'SMTP_PASSWORD');
  if (Boolean(username) !== Boolean(password)) {
    throw new RuntimeConfigurationError('SMTP_USER and SMTP_PASSWORD must be configured together.');
  }

  return {
    transport: 'smtp',
    host: requiredValue(environment, 'SMTP_HOST'),
    port: getSmtpPort(environment),
    tlsMode: getSmtpTlsMode(environment),
    ...(username && password ? { username, password } : {}),
    fromAddress: requireEmailAddress(environment, 'SMTP_FROM_ADDRESS'),
    fromName: optionalValue(environment, 'SMTP_FROM_NAME') || 'FYP Portal',
    replyTo: getOptionalReplyTo(environment, 'SMTP_REPLY_TO'),
  };
}

function getLegacyGmailConfiguration(environment: RuntimeEnvironment): MailConfiguration {
  const username = requireEmailAddress(environment, 'EMAIL_USER');
  return {
    transport: 'gmail',
    username,
    password: requiredValue(environment, 'EMAIL_APP_PASSWORD'),
    fromAddress: username,
    fromName: optionalValue(environment, 'EMAIL_FROM_NAME') || 'FYP Portal',
    replyTo: getOptionalReplyTo(environment, 'EMAIL_REPLY_TO') || username,
  };
}

const SMTP_SETTING_NAMES = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_TLS_MODE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM_ADDRESS',
  'SMTP_FROM_NAME',
  'SMTP_REPLY_TO',
] as const;

const LEGACY_GMAIL_SETTING_NAMES = [
  'EMAIL_USER',
  'EMAIL_APP_PASSWORD',
  'EMAIL_FROM_NAME',
  'EMAIL_REPLY_TO',
] as const;

export function getMailConfiguration(
  environment: RuntimeEnvironment = process.env
): MailConfiguration | null {
  const hasSmtpSettings = hasAnyValue(environment, SMTP_SETTING_NAMES);
  const hasLegacyGmailSettings = hasAnyValue(environment, LEGACY_GMAIL_SETTING_NAMES);

  if (hasSmtpSettings && hasLegacyGmailSettings) {
    throw new RuntimeConfigurationError('Configure either SMTP_* settings or legacy EMAIL_* Gmail settings, not both.');
  }
  if (hasSmtpSettings) return getGenericSmtpConfiguration(environment);
  if (hasLegacyGmailSettings) return getLegacyGmailConfiguration(environment);
  return null;
}
