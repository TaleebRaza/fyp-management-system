import { pathToFileURL } from 'node:url';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';

import {
  createStorageClient,
  getPortalPublicOrigin,
  getStorageConfiguration,
} from './storage-config.mjs';

const LOCAL_STORAGE_ENDPOINT = 'http://seaweedfs:8333';
const LOCAL_STORAGE_BUCKET = 'fyp-uploads';

export function getLocalStorageConfiguration(environment = process.env) {
  const configuration = getStorageConfiguration(environment);
  const portalOrigin = getPortalPublicOrigin(environment);
  const browserEndpoint = new URL(configuration.browserEndpoint);

  if (configuration.endpoint !== LOCAL_STORAGE_ENDPOINT) {
    throw new Error(`Local storage requires S3_ENDPOINT=${LOCAL_STORAGE_ENDPOINT}.`);
  }
  if (configuration.bucketName !== LOCAL_STORAGE_BUCKET) {
    throw new Error(`Local storage requires S3_BUCKET_NAME=${LOCAL_STORAGE_BUCKET}.`);
  }
  if (!configuration.forcePathStyle) {
    throw new Error('Local storage requires S3_FORCE_PATH_STYLE=true.');
  }
  if (browserEndpoint.origin !== portalOrigin || browserEndpoint.pathname !== '/') {
    throw new Error('Local storage requires S3_BROWSER_ENDPOINT to equal PORTAL_PUBLIC_URL.');
  }

  return { configuration, portalOrigin };
}

export function localStorageCorsConfiguration(portalOrigin) {
  return {
    CORSRules: [{
      AllowedOrigins: [portalOrigin],
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedHeaders: ['content-type'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 600,
    }],
  };
}

function isMissingBucket(error) {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

async function ensureBucket(client, bucketName) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return;
  } catch (error) {
    if (!isMissingBucket(error)) throw error;
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    if (!isMissingBucket(error)) {
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return;
    }
    throw error;
  }
}

export async function initializeLocalStorage(environment = process.env) {
  const { configuration, portalOrigin } = getLocalStorageConfiguration(environment);
  const client = createStorageClient(configuration);

  try {
    await ensureBucket(client, configuration.bucketName);
    await client.send(new PutBucketCorsCommand({
      Bucket: configuration.bucketName,
      CORSConfiguration: localStorageCorsConfiguration(portalOrigin),
    }));
  } finally {
    client.destroy();
  }

  return { bucket: configuration.bucketName, origin: portalOrigin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await initializeLocalStorage()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'local_storage_initialization_failed');
    process.exitCode = 1;
  }
}
