import { pathToFileURL } from 'node:url';
import { HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  createStorageClient,
  getPortalPublicOrigin,
  getStorageConfiguration,
} from './storage-config.mjs';

const LOCAL_VALIDATION_CONFIRMATION = 'LOCAL_FALSE_DATA';

function headerAllowsValue(headers, name, value) {
  return (headers.get(name) || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === '*' || item === value.toLowerCase());
}

export function assertCorsPreflight(response, portalOrigin) {
  if (!response.ok) {
    throw new Error(`Browser storage preflight failed with HTTP ${response.status}.`);
  }

  const allowedOrigin = response.headers.get('access-control-allow-origin');
  if (allowedOrigin !== '*' && allowedOrigin !== portalOrigin) {
    throw new Error('Browser storage preflight does not allow the portal origin.');
  }
  if (!headerAllowsValue(response.headers, 'access-control-allow-methods', 'PUT')) {
    throw new Error('Browser storage preflight does not allow PUT.');
  }
  if (!headerAllowsValue(response.headers, 'access-control-allow-headers', 'content-type')) {
    throw new Error('Browser storage preflight does not allow Content-Type.');
  }
}

export async function verifyBrowserStorage(environment = process.env) {
  if (environment.FYP_STORAGE_VALIDATION_CONFIRM !== LOCAL_VALIDATION_CONFIRMATION) {
    throw new Error(`Set FYP_STORAGE_VALIDATION_CONFIRM=${LOCAL_VALIDATION_CONFIRMATION} to validate false local data.`);
  }

  const configuration = getStorageConfiguration(environment);
  const portalOrigin = getPortalPublicOrigin(environment);
  const serviceClient = createStorageClient(configuration);
  const browserClient = createStorageClient(configuration, configuration.browserEndpoint);

  try {
    await serviceClient.send(new HeadBucketCommand({ Bucket: configuration.bucketName }));
    const uploadUrl = await getSignedUrl(
      browserClient,
      new PutObjectCommand({
        Bucket: configuration.bucketName,
        Key: '__fyp-portal-validation__/cors-probe',
        ContentType: 'application/octet-stream',
      }),
      { expiresIn: 60 }
    );
    const response = await fetch(uploadUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: portalOrigin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assertCorsPreflight(response, portalOrigin);
    return { browserOrigin: new URL(uploadUrl).origin, cors: 'ok' };
  } finally {
    serviceClient.destroy();
    browserClient.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyBrowserStorage()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'browser_storage_validation_failed');
    process.exitCode = 1;
  }
}
