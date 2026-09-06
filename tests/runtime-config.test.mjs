import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const runtimeConfig = await importTypeScriptModule('lib/runtimeConfig.ts');
const mailer = await importTypeScriptModule('lib/mailer.ts');

test('runtime configuration validates required MongoDB and NextAuth settings', () => {
  assert.equal(
    runtimeConfig.getMongoDbUri({ MONGODB_URI: 'mongodb+srv://user:password@cluster.example/fyp' }),
    'mongodb+srv://user:password@cluster.example/fyp'
  );
  assert.throws(() => runtimeConfig.getMongoDbUri({ MONGODB_URI: 'https://database.example' }), /mongodb/);
  assert.throws(() => runtimeConfig.getNextAuthSecret({}), /NEXTAUTH_SECRET is required/);
});

test('generic SMTP requires explicit TLS, sender identity, and paired optional credentials', () => {
  const configuration = runtimeConfig.getMailConfiguration({
    SMTP_HOST: 'mail.example.edu',
    SMTP_PORT: '587',
    SMTP_TLS_MODE: 'starttls',
    SMTP_FROM_ADDRESS: 'portal@example.edu',
    SMTP_FROM_NAME: 'FYP Portal',
  });

  assert.deepEqual(configuration, {
    transport: 'smtp',
    host: 'mail.example.edu',
    port: 587,
    tlsMode: 'starttls',
    fromAddress: 'portal@example.edu',
    fromName: 'FYP Portal',
    replyTo: undefined,
  });
  assert.throws(
    () => runtimeConfig.getMailConfiguration({ SMTP_HOST: 'mail.example.edu' }),
    /SMTP_PORT is required/
  );
  assert.throws(
    () => runtimeConfig.getMailConfiguration({
      SMTP_HOST: 'mail.example.edu',
      SMTP_PORT: '465',
      SMTP_TLS_MODE: 'tls',
      SMTP_USER: 'portal',
      SMTP_FROM_ADDRESS: 'portal@example.edu',
    }),
    /SMTP_USER and SMTP_PASSWORD must be configured together/
  );
});

test('legacy Gmail remains available and does not mix with generic SMTP', () => {
  const legacySettings = {
    EMAIL_USER: 'portal@example.edu',
    EMAIL_APP_PASSWORD: 'app-password',
    EMAIL_FROM_NAME: 'FYP Portal',
  };
  const configuration = runtimeConfig.getMailConfiguration(legacySettings);

  assert.equal(configuration?.transport, 'gmail');
  assert.equal(configuration?.fromAddress, 'portal@example.edu');
  assert.equal(configuration?.replyTo, 'portal@example.edu');
  assert.throws(
    () => runtimeConfig.getMailConfiguration({
      ...legacySettings,
      SMTP_HOST: 'mail.example.edu',
    }),
    /either SMTP_\* settings or legacy EMAIL_\* Gmail settings/
  );
});

test('absent mail settings disable email without treating an empty configuration as malformed', () => {
  assert.equal(runtimeConfig.getMailConfiguration({}), null);
});

test('generic S3 storage uses separate service and browser endpoints with a configurable quota', () => {
  const genericStorage = {
    S3_ENDPOINT: 'http://seaweedfs:8333',
    S3_BROWSER_ENDPOINT: 'https://portal.example.edu/fyp-uploads',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'access-key',
    S3_SECRET_ACCESS_KEY: 'secret-key',
    S3_BUCKET_NAME: 'fyp-portal',
    S3_FORCE_PATH_STYLE: 'true',
    STORAGE_QUOTA_BYTES: '1048576',
  };

  assert.deepEqual(runtimeConfig.getStorageConfiguration(genericStorage), {
    endpoint: 'http://seaweedfs:8333',
    browserEndpoint: 'https://portal.example.edu/fyp-uploads',
    region: 'us-east-1',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    bucketName: 'fyp-portal',
    forcePathStyle: true,
  });
  assert.equal(runtimeConfig.getStorageQuotaBytes(genericStorage), 1_048_576);
  assert.throws(
    () => runtimeConfig.getStorageConfiguration({ S3_ENDPOINT: 'http://storage.example.edu' }),
    /S3_BROWSER_ENDPOINT is required/
  );
  assert.throws(
    () => runtimeConfig.getStorageConfiguration({ ...genericStorage, R2_BUCKET_NAME: 'legacy' }),
    /either S3_\* storage settings or legacy R2_\* settings/
  );
  assert.throws(
    () => runtimeConfig.getStorageQuotaBytes({ STORAGE_QUOTA_BYTES: '-1' }),
    /positive integer/
  );
});

test('legacy R2 settings remain a complete storage fallback', () => {
  assert.deepEqual(runtimeConfig.getStorageConfiguration({
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET_NAME: 'fyp-portal',
  }), {
    endpoint: 'https://account-id.r2.cloudflarestorage.com',
    browserEndpoint: 'https://account-id.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    bucketName: 'fyp-portal',
    forcePathStyle: true,
  });
});

test('unconfigured mail operations fail without attempting delivery', async () => {
  const names = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS_MODE', 'SMTP_USER', 'SMTP_PASSWORD',
    'SMTP_FROM_ADDRESS', 'SMTP_FROM_NAME', 'SMTP_REPLY_TO',
    'EMAIL_USER', 'EMAIL_APP_PASSWORD', 'EMAIL_FROM_NAME', 'EMAIL_REPLY_TO',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const warn = console.warn;
  console.warn = () => {};

  try {
    for (const name of names) delete process.env[name];
    assert.equal(mailer.isEmailConfigured(), false);
    assert.equal(await mailer.verifyEmailConnection(), false);
    assert.equal(await mailer.sendNotificationEmail('student@example.edu', 'Subject', '<p>Body</p>'), false);
    assert.equal(await mailer.sendTestEmail('student@example.edu'), false);
  } finally {
    console.warn = warn;
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
