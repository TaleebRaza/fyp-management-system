import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import mongoose, { ClientSession } from 'mongoose';

import StorageDeletionOutbox from '../models/StorageDeletionOutbox';
import SystemConfig from '../models/SystemConfig';
import UploadReservation from '../models/UploadReservation';
import { BUCKET_NAME, getS3Client, MAX_STORAGE_BYTES } from './s3-client';
import { hasExpectedStorageMagic, type StorageUploadKind } from './storageValidation';

const MAX_DELETION_ATTEMPTS = 8;

export class StorageProtocolError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StorageProtocolError';
  }
}

type ReserveUploadInput = {
  key: string;
  ownerId: string;
  kind: StorageUploadKind;
  projectId?: string;
  expectedBytes: number;
  expectedContentType: string;
  idempotencyKey: string;
  expiresAt: Date;
};

type FinalizeUploadInput<T> = {
  key: string;
  ownerId: string;
  kind: StorageUploadKind;
  projectId?: string;
  commit: (
    session: ClientSession,
    uploadedObject: { actualBytes: number; actualContentType: string }
  ) => Promise<T>;
};

type FinalizedUpload<T> =
  | { finalizedNow: false }
  | { finalizedNow: true; result: T };

export async function withStorageTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();

  try {
    let value: T | undefined;
    await session.withTransaction(async () => {
      value = await operation(session);
    });

    if (value === undefined) throw new Error('Storage transaction returned no result.');
    return value;
  } finally {
    await session.endSession();
  }
}

async function ensureStorageConfig(session: ClientSession) {
  await SystemConfig.updateOne(
    { configKey: 'storage' },
    { $setOnInsert: { usedBytes: 0, reservedBytes: 0 } },
    { upsert: true, session }
  );
}

function assertReservationInput(input: ReserveUploadInput) {
  if (!input.key || input.key.length > 500 || !input.ownerId || !input.idempotencyKey || input.idempotencyKey.length > 128) {
    throw new StorageProtocolError('Invalid upload reservation.', 400);
  }
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0) {
    throw new StorageProtocolError('A valid upload size is required.', 400);
  }
}

function isSameReservation(existing: {
  key: unknown;
  kind: unknown;
  projectId?: unknown;
  expectedBytes: unknown;
  expectedContentType: unknown;
}, input: ReserveUploadInput) {
  return String(existing.key) === input.key
    && String(existing.kind) === input.kind
    && String(existing.projectId || '') === String(input.projectId || '')
    && Number(existing.expectedBytes) === input.expectedBytes
    && String(existing.expectedContentType) === input.expectedContentType;
}

export async function reserveUpload(input: ReserveUploadInput) {
  assertReservationInput(input);

  return await withStorageTransaction(async (session) => {
    const existing = await UploadReservation.findOne({
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
    }).session(session);
    if (existing) {
      if (!isSameReservation(existing, input)) {
        throw new StorageProtocolError('Upload idempotency key was reused with different data.', 409);
      }
      return existing;
    }

    await ensureStorageConfig(session);
    const capacity = await SystemConfig.updateOne(
      {
        configKey: 'storage',
        $expr: {
          $lte: [
            {
              $add: [
                { $ifNull: ['$usedBytes', 0] },
                { $ifNull: ['$reservedBytes', 0] },
                input.expectedBytes,
              ],
            },
            MAX_STORAGE_BYTES,
          ],
        },
      },
      { $inc: { reservedBytes: input.expectedBytes } },
      { session }
    );
    if (capacity.modifiedCount !== 1) {
      throw new StorageProtocolError('System storage capacity reached.', 403);
    }

    const reservation = new UploadReservation(input);
    await reservation.save({ session });
    return reservation;
  });
}

export async function enqueueStorageDeletion(
  target: { key: string; bytes: number; reason: string },
  session: ClientSession
) {
  if (!target.key || target.key.length > 500 || !Number.isSafeInteger(target.bytes) || target.bytes < 0) {
    throw new StorageProtocolError('Invalid storage deletion target.', 400);
  }

  await StorageDeletionOutbox.findOneAndUpdate(
    { key: target.key },
    {
      $max: { bytes: target.bytes },
      $setOnInsert: {
        reason: target.reason.slice(0, 100),
        state: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastErrorCode: '',
      },
    },
    { upsert: true, session }
  );
}

export async function cancelUploadReservation(
  key: string,
  ownerId: string,
  reason: string
) {
  return await withStorageTransaction(async (session) => {
    const reservation = await UploadReservation.findOne({ key, ownerId }).session(session);
    if (!reservation || reservation.state !== 'pending') return false;

    await enqueueStorageDeletion(
      { key: reservation.key, bytes: 0, reason },
      session
    );
    const released = await SystemConfig.updateOne(
      { configKey: 'storage', reservedBytes: { $gte: reservation.expectedBytes } },
      { $inc: { reservedBytes: -reservation.expectedBytes } },
      { session }
    );
    if (released.modifiedCount !== 1) throw new Error('Storage reservation ledger is inconsistent.');

    reservation.state = 'cancelled';
    await reservation.save({ session });
    return true;
  });
}

async function verifyUploadObject(reservation: {
  key: string;
  kind: StorageUploadKind;
  expectedBytes: number;
  expectedContentType: string;
}) {
  const object = await getS3Client().send(
    new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: reservation.key })
  );
  const actualBytes = Number(object.ContentLength || 0);
  const actualContentType = String(object.ContentType || '').split(';', 1)[0];
  if (
    actualBytes <= 0
    || actualBytes > reservation.expectedBytes
    || actualContentType !== reservation.expectedContentType
  ) {
    throw new StorageProtocolError('Uploaded object does not match its reservation.', 400);
  }

  const prefix = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: reservation.key, Range: 'bytes=0-7' })
  );
  const bytes = prefix.Body ? await prefix.Body.transformToByteArray() : new Uint8Array();
  if (!hasExpectedStorageMagic(reservation.kind, bytes)) {
    throw new StorageProtocolError('Uploaded object has an invalid file signature.', 400);
  }

  return { actualBytes, actualContentType };
}

export async function finalizeUploadReservation<T>(input: FinalizeUploadInput<T>) {
  const reservation = await UploadReservation.findOne({
    key: input.key,
    ownerId: input.ownerId,
    kind: input.kind,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }).select('key ownerId kind expectedBytes expectedContentType state expiresAt');
  if (!reservation) throw new StorageProtocolError('Upload reservation not found.', 404);
  if (reservation.state === 'finalized') return { finalizedNow: false } satisfies FinalizedUpload<T>;
  if (reservation.state !== 'pending') throw new StorageProtocolError('Upload reservation is no longer active.', 409);
  if (reservation.expiresAt.getTime() <= Date.now()) {
    await cancelUploadReservation(input.key, input.ownerId, 'expired-upload');
    throw new StorageProtocolError('Upload reservation has expired. Upload the file again.', 409);
  }

  let verified: { actualBytes: number; actualContentType: string };
  try {
    verified = await verifyUploadObject({
      key: reservation.key,
      kind: reservation.kind,
      expectedBytes: reservation.expectedBytes,
      expectedContentType: reservation.expectedContentType,
    });
  } catch (error) {
    await cancelUploadReservation(input.key, input.ownerId, 'invalid-upload');
    throw error;
  }

  return await withStorageTransaction(async (session) => {
    const activeReservation = await UploadReservation.findOne({
      _id: reservation._id,
      state: 'pending',
      expiresAt: { $gt: new Date() },
    }).session(session);
    if (!activeReservation) return { finalizedNow: false } satisfies FinalizedUpload<T>;

    const result = await input.commit(session, verified);
    await ensureStorageConfig(session);
    const converted = await SystemConfig.updateOne(
      { configKey: 'storage', reservedBytes: { $gte: activeReservation.expectedBytes } },
      {
        $inc: {
          reservedBytes: -activeReservation.expectedBytes,
          usedBytes: verified.actualBytes,
        },
      },
      { session }
    );
    if (converted.modifiedCount !== 1) throw new Error('Storage reservation ledger is inconsistent.');

    activeReservation.actualBytes = verified.actualBytes;
    activeReservation.actualContentType = verified.actualContentType;
    activeReservation.state = 'finalized';
    await activeReservation.save({ session });

    return { finalizedNow: true, result };
  });
}

function retryDelay(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts, 8)));
}

export async function processStorageDeletionOutbox(limit = 25) {
  const targets = await StorageDeletionOutbox.find({
    state: 'pending',
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1, _id: 1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();

  let deleted = 0;
  let retried = 0;

  for (const target of targets) {
    try {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }));
      await withStorageTransaction(async (session) => {
        const activeTarget = await StorageDeletionOutbox.findOne({
          _id: target._id,
          state: 'pending',
        }).session(session);
        if (!activeTarget) return;

        await ensureStorageConfig(session);
        await SystemConfig.updateOne(
          { configKey: 'storage' },
          [
            {
              $set: {
                usedBytes: {
                  $max: [0, { $subtract: [{ $ifNull: ['$usedBytes', 0] }, activeTarget.bytes] }],
                },
              },
            },
          ],
          { session }
        );
        await StorageDeletionOutbox.deleteOne({ _id: activeTarget._id }).session(session);
      });
      deleted += 1;
    } catch (error) {
      const attempts = Number(target.attempts || 0) + 1;
      await StorageDeletionOutbox.updateOne(
        { _id: target._id, state: 'pending' },
        {
          $set: {
            state: attempts >= MAX_DELETION_ATTEMPTS ? 'dead-letter' : 'pending',
            nextAttemptAt: new Date(Date.now() + retryDelay(attempts)),
            lastErrorCode: error instanceof Error ? error.name : 'storage_delete_failed',
          },
          $inc: { attempts: 1 },
        }
      );
      retried += 1;
    }
  }

  return { processed: targets.length, deleted, retried };
}

export async function expireUploadReservations(limit = 25) {
  const reservations = await UploadReservation.find({
    state: 'pending',
    expiresAt: { $lte: new Date() },
  })
    .sort({ expiresAt: 1, _id: 1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .select('key ownerId')
    .lean();

  let cancelled = 0;
  for (const reservation of reservations) {
    if (await cancelUploadReservation(reservation.key, String(reservation.ownerId), 'expired-upload')) {
      cancelled += 1;
    }
  }

  return { processed: reservations.length, cancelled };
}
