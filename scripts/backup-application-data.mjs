import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import mongodb from 'mongodb';

import { createStorageClient, getStorageConfiguration } from '../deploy/storage-config.mjs';

const { BSON, MongoClient } = mongodb;
const { EJSON } = BSON;

export const BACKUP_FORMAT_VERSION = 1;

function assertBackupId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error('Backup identifier is invalid.');
  }
  return value;
}

function workspaceRoot(environment = process.env) {
  const value = environment.FYP_BACKUP_WORKSPACE?.trim();
  if (!value) throw new Error('FYP_BACKUP_WORKSPACE is required.');
  const root = resolve(value);
  if (root === '/') throw new Error('FYP_BACKUP_WORKSPACE is invalid.');
  return root;
}

function inside(root, file) {
  const resolved = resolve(root, file);
  const path = relative(root, resolved);
  if (!path || path === '..' || path.startsWith('..\\') || path.startsWith('../')) {
    throw new Error('Backup path is invalid.');
  }
  return resolved;
}

function fileName(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeJson(path, value) {
  await writeFile(path, `${EJSON.stringify(value, { relaxed: false })}\n`, { mode: 0o600, flag: 'wx' });
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function dumpCollection(collection, path) {
  const output = createWriteStream(path, { mode: 0o600, flags: 'wx' });
  const hash = createHash('sha256');
  let documents = 0;

  try {
    for await (const document of collection.find({})) {
      const line = `${EJSON.stringify(document, { relaxed: false })}\n`;
      hash.update(line);
      if (!output.write(line)) await new Promise((resolveDrain) => output.once('drain', resolveDrain));
      documents += 1;
    }
    output.end();
    await finished(output);
  } catch (error) {
    output.destroy();
    throw error;
  }

  return { documents, sha256: hash.digest('hex') };
}

async function copyObject(body, path) {
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw new Error('Storage object body is unavailable.');
  }

  const output = createWriteStream(path, { mode: 0o600, flags: 'wx' });
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of body) {
      const buffer = Buffer.from(chunk);
      hash.update(buffer);
      bytes += buffer.length;
      if (!output.write(buffer)) await new Promise((resolveDrain) => output.once('drain', resolveDrain));
    }
    output.end();
    await finished(output);
  } catch (error) {
    output.destroy();
    throw error;
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function dumpMongoDatabase(database, root) {
  const mongoDirectory = join(root, 'mongo');
  await mkdir(mongoDirectory, { mode: 0o700 });
  const collections = await database.listCollections().toArray();
  const backups = [];

  for (const metadata of collections.filter((collection) => collection.type === 'collection').sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `mongo/${fileName(metadata.name)}.ndjson`;
    const path = inside(root, relativePath);
    const collection = database.collection(metadata.name);
    const dump = await dumpCollection(collection, path);
    const indexes = await collection.indexes();
    backups.push({
      name: metadata.name,
      options: EJSON.stringify(metadata.options || {}, { relaxed: false }),
      indexes: EJSON.stringify(indexes, { relaxed: false }),
      file: relativePath,
      ...dump,
    });
  }

  return backups;
}

async function listStorageObjects(client, bucketName) {
  const objects = [];
  let continuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: continuationToken }));
    objects.push(...(page.Contents || []).filter((object) => typeof object.Key === 'string'));
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  return objects.sort((left, right) => String(left.Key).localeCompare(String(right.Key)));
}

async function dumpStorage(client, bucketName, root) {
  const objectsDirectory = join(root, 'objects');
  await mkdir(objectsDirectory, { mode: 0o700 });
  const objectBackups = [];

  for (const object of await listStorageObjects(client, bucketName)) {
    const key = String(object.Key);
    const relativePath = `objects/${fileName(key)}`;
    const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    const copied = await copyObject(response.Body, inside(root, relativePath));
    const listedBytes = Number(object.Size || 0);
    if (!Number.isSafeInteger(listedBytes) || listedBytes < 0 || listedBytes !== copied.bytes) {
      throw new Error('Storage object size changed while the backup was running.');
    }
    objectBackups.push({
      key,
      file: relativePath,
      bytes: copied.bytes,
      sha256: copied.sha256,
      contentType: response.ContentType || null,
    });
  }

  return objectBackups;
}

function parseManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('Backup format is unsupported.');
  }
  if (!Array.isArray(value.collections) || !Array.isArray(value.objects)) {
    throw new Error('Backup manifest is invalid.');
  }
  return value;
}

async function readManifest(root) {
  return parseManifest(EJSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')));
}

async function assertBackupFile(root, entry, prefix) {
  if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string' || !entry.file.startsWith(prefix) || typeof entry.sha256 !== 'string') {
    throw new Error('Backup manifest contains an invalid file entry.');
  }
  const path = inside(root, entry.file);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await hashFile(path) !== entry.sha256) {
    throw new Error('Backup data integrity check failed.');
  }
  return path;
}

export async function verifyApplicationBackup(backupId, environment = process.env) {
  const root = inside(workspaceRoot(environment), assertBackupId(backupId));
  const manifest = await readManifest(root);
  for (const collection of manifest.collections) await assertBackupFile(root, collection, 'mongo/');
  for (const object of manifest.objects) await assertBackupFile(root, object, 'objects/');
  return manifest;
}

export async function createApplicationBackup(backupId, environment = process.env) {
  const root = inside(workspaceRoot(environment), assertBackupId(backupId));
  const mongoUri = environment.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');

  const storage = getStorageConfiguration(environment);
  const databaseClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  const storageClient = createStorageClient(storage);
  let created = false;
  try {
    await mkdir(workspaceRoot(environment), { mode: 0o700, recursive: true });
    await mkdir(root, { mode: 0o700 });
    created = true;
    await databaseClient.connect();
    const database = databaseClient.db();
    const [collections, objects, pendingUploads] = await Promise.all([
      dumpMongoDatabase(database, root),
      dumpStorage(storageClient, storage.bucketName, root),
      database.collection('uploadreservations').countDocuments({ state: 'pending' }),
    ]);
    const manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      database: database.databaseName,
      bucket: storage.bucketName,
      collections,
      objects,
      pendingUploads,
    };
    await writeJson(join(root, 'manifest.json'), manifest);
    return manifest;
  } catch (error) {
    if (created) await rm(root, { recursive: true, force: true });
    throw error;
  } finally {
    await databaseClient.close();
    storageClient.destroy();
  }
}

function restoredIndex(index) {
  const { ns, v, ...specification } = index;
  void ns;
  void v;
  return specification;
}

async function restoreCollection(database, root, backup) {
  if (typeof backup.name !== 'string' || !backup.name) throw new Error('Backup manifest contains an invalid collection.');
  const options = EJSON.parse(backup.options);
  await database.createCollection(backup.name, options);
  const collection = database.collection(backup.name);
  const stream = createReadStream(await assertBackupFile(root, backup, 'mongo/'), { encoding: 'utf8' });
  let remainder = '';
  let batch = [];

  for await (const chunk of stream) {
    const lines = `${remainder}${chunk}`.split('\n');
    remainder = lines.pop() || '';
    for (const line of lines) {
      if (!line) continue;
      batch.push(EJSON.parse(line));
      if (batch.length === 1_000) {
        await collection.insertMany(batch);
        batch = [];
      }
    }
  }
  if (remainder) batch.push(EJSON.parse(remainder));
  if (batch.length > 0) await collection.insertMany(batch);

  const indexes = EJSON.parse(backup.indexes);
  if (!Array.isArray(indexes)) throw new Error('Backup manifest contains invalid indexes.');
  const secondaryIndexes = indexes.filter((index) => index?.name !== '_id_').map(restoredIndex);
  if (secondaryIndexes.length > 0) await collection.createIndexes(secondaryIndexes);
}

async function restoreStorageObject(client, bucketName, root, backup) {
  if (!backup || typeof backup.key !== 'string' || !backup.key) throw new Error('Backup manifest contains an invalid storage object.');
  const path = await assertBackupFile(root, backup, 'objects/');
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: backup.key,
    Body: createReadStream(path),
    ...(typeof backup.contentType === 'string' && backup.contentType ? { ContentType: backup.contentType } : {}),
  }));
}

export async function restoreApplicationBackup(backupId, environment = process.env) {
  const root = inside(workspaceRoot(environment), assertBackupId(backupId));
  const manifest = await verifyApplicationBackup(backupId, environment);
  const mongoUri = environment.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const storage = getStorageConfiguration(environment);
  if (manifest.bucket !== storage.bucketName) throw new Error('Backup bucket does not match the configured storage bucket.');

  const databaseClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  const storageClient = createStorageClient(storage);
  try {
    await databaseClient.connect();
    const database = databaseClient.db();
    if ((await database.listCollections().toArray()).length > 0) {
      throw new Error('Restore requires an empty MongoDB database.');
    }
    if ((await storageClient.send(new ListObjectsV2Command({ Bucket: storage.bucketName, MaxKeys: 1 }))).KeyCount) {
      throw new Error('Restore requires an empty storage bucket.');
    }

    for (const collection of manifest.collections) await restoreCollection(database, root, collection);
    for (const object of manifest.objects) await restoreStorageObject(storageClient, storage.bucketName, root, object);
    return { collections: manifest.collections.length, objects: manifest.objects.length };
  } finally {
    await databaseClient.close();
    storageClient.destroy();
  }
}

async function main() {
  const [operation, backupId] = process.argv.slice(2);
  if (!backupId || !['create', 'verify', 'restore'].includes(operation)) {
    throw new Error('Usage: node scripts/backup-application-data.mjs <create|verify|restore> <backup-id>');
  }
  const result = operation === 'create'
    ? await createApplicationBackup(backupId)
    : operation === 'verify'
      ? await verifyApplicationBackup(backupId)
      : await restoreApplicationBackup(backupId);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('backup_application_data_failed');
    process.exitCode = 1;
  });
}
