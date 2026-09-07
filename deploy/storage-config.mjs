import { S3Client } from '@aws-sdk/client-s3';

const genericSettingNames = [
  'S3_ENDPOINT',
  'S3_BROWSER_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_FORCE_PATH_STYLE',
];
const legacySettingNames = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

function optionalValue(environment, name) {
  const value = environment[name]?.trim();
  return value || undefined;
}

function requiredValue(environment, name) {
  const value = optionalValue(environment, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hasAnyValue(environment, names) {
  return names.some((name) => optionalValue(environment, name));
}

function endpoint(environment, name) {
  const value = requiredValue(environment, name);
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      throw new Error('invalid endpoint');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be an HTTP or HTTPS endpoint without credentials, a query, or a fragment.`);
  }
}

function forcePathStyle(environment) {
  const value = optionalValue(environment, 'S3_FORCE_PATH_STYLE');
  if (!value || value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('S3_FORCE_PATH_STYLE must be true or false.');
}

export function getStorageConfiguration(environment = process.env) {
  const hasGenericSettings = hasAnyValue(environment, genericSettingNames);
  const hasLegacySettings = hasAnyValue(environment, legacySettingNames);

  if (hasGenericSettings && hasLegacySettings) {
    throw new Error('Configure either S3_* storage settings or legacy R2_* settings, not both.');
  }
  if (hasGenericSettings) {
    return {
      endpoint: endpoint(environment, 'S3_ENDPOINT'),
      browserEndpoint: endpoint(environment, 'S3_BROWSER_ENDPOINT'),
      region: requiredValue(environment, 'S3_REGION'),
      accessKeyId: requiredValue(environment, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredValue(environment, 'S3_SECRET_ACCESS_KEY'),
      bucketName: requiredValue(environment, 'S3_BUCKET_NAME'),
      forcePathStyle: forcePathStyle(environment),
    };
  }
  if (hasLegacySettings) {
    const accountId = requiredValue(environment, 'R2_ACCOUNT_ID');
    return {
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      browserEndpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      accessKeyId: requiredValue(environment, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredValue(environment, 'R2_SECRET_ACCESS_KEY'),
      bucketName: requiredValue(environment, 'R2_BUCKET_NAME'),
      forcePathStyle: true,
    };
  }
  throw new Error('Storage is not configured. Configure S3_* storage settings or legacy R2_* settings.');
}

export function getPortalPublicOrigin(environment = process.env) {
  const value = requiredValue(environment, 'PORTAL_PUBLIC_URL');
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error('invalid public URL');
    }
    return parsed.origin;
  } catch {
    throw new Error('PORTAL_PUBLIC_URL must be an HTTPS origin without a path, query, or fragment.');
  }
}

export function createStorageClient(configuration, endpointOverride = configuration.endpoint) {
  return new S3Client({
    region: configuration.region,
    endpoint: endpointOverride,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    forcePathStyle: configuration.forcePathStyle,
  });
}
