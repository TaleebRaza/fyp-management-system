import { S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

export function assertStorageConfigured() {
  if (!accountId || !accessKeyId || !secretAccessKey || !BUCKET_NAME) {
    throw new Error('R2 storage is not configured.');
  }
}

const storageClient = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId || 'invalid'}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || 'invalid',
    secretAccessKey: secretAccessKey || 'invalid',
  },
  forcePathStyle: true,
});

export const s3Client = new Proxy(storageClient, {
  get(target, property, receiver) {
    if (property === 'send') {
      return (...args: Parameters<S3Client['send']>) => {
        assertStorageConfigured();
        return target.send(...args);
      };
    }
    return Reflect.get(target, property, receiver);
  },
}) as S3Client;

export function getS3Client() {
  assertStorageConfigured();
  return s3Client;
}

// 9.5 GB limit (Leaves a 500MB safety buffer before the 10GB free tier billing threshold)
export const MAX_STORAGE_BYTES = 9.5 * 1024 * 1024 * 1024;
