import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const storageClient = await importTypeScriptModule('lib/s3-client.ts');

const storageEnvironmentNames = [
  'S3_ENDPOINT',
  'S3_BROWSER_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_FORCE_PATH_STYLE',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

async function withStorageEnvironment(values, operation) {
  const original = Object.fromEntries(storageEnvironmentNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of storageEnvironmentNames) delete process.env[name];
    Object.assign(process.env, values);
    await operation();
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function startLocalS3Server() {
  const objects = new Map();
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://local-storage.test');
    const [bucket, ...keyParts] = url.pathname.slice(1).split('/');
    const key = decodeURIComponent(keyParts.join('/'));
    requests.push({ method: request.method, path: url.pathname });

    if (bucket !== 'fyp-test' || !key) {
      response.writeHead(404).end();
      return;
    }

    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(key, {
        body: Buffer.concat(chunks),
        contentType: request.headers['content-type'] || 'application/octet-stream',
      });
      response.writeHead(200, { ETag: '"local-storage"' }).end();
      return;
    }

    const object = objects.get(key);
    if (!object) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Content-Length': object.body.length,
        'Content-Type': object.contentType,
      }).end();
      return;
    }
    if (request.method === 'GET') {
      response.writeHead(200, {
        'Content-Length': object.body.length,
        'Content-Type': object.contentType,
      }).end(object.body);
      return;
    }
    if (request.method === 'DELETE') {
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }

    response.writeHead(405).end();
  });
  return { server, objects, requests };
}

test('generic S3 uses local service storage while browser signed URLs use the public endpoint', async () => {
  const { server, objects, requests } = startLocalS3Server();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    await withStorageEnvironment({
      S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
      S3_BROWSER_ENDPOINT: 'http://browser.storage.test/fyp-uploads',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'local-access-key',
      S3_SECRET_ACCESS_KEY: 'local-secret-key',
      S3_BUCKET_NAME: 'fyp-test',
      S3_FORCE_PATH_STYLE: 'true',
    }, async () => {
      const bucket = storageClient.getStorageBucketName();
      const key = 'proposals/student-1/submission.pdf';
      const body = Buffer.from('%PDF-local-test');
      const serviceClient = storageClient.getS3Client();

      await serviceClient.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
      }));
      const object = await serviceClient.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      assert.equal(object.ContentLength, body.length);
      assert.equal(object.ContentType, 'application/pdf');

      const download = await serviceClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      assert.deepEqual(Buffer.from(await download.Body.transformToByteArray()), body);

      const uploadUrl = new URL(await getSignedUrl(
        storageClient.getBrowserS3Client(),
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'application/pdf' }),
        { expiresIn: 60 }
      ));
      assert.equal(uploadUrl.origin, 'http://browser.storage.test');
      assert.equal(uploadUrl.pathname, `/fyp-uploads/${bucket}/${key}`);
      assert.ok(uploadUrl.searchParams.get('X-Amz-Signature'));

      await serviceClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      assert.equal(objects.has(key), false);
      assert.deepEqual(requests.map((request) => request.method), ['PUT', 'HEAD', 'GET', 'DELETE']);
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
