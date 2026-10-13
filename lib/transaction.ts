import mongoose, { type ClientSession } from 'mongoose';

export class TransactionBusyError extends Error {
  readonly statusCode = 503;
  constructor() {
    super('Too many changes are in progress. Please try again shortly.');
  }
}

export async function withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    // An invite collision aborts the transaction; retry the entire operation.
    for (let attempt = 0; ; attempt++) {
      try {
        let value!: T;
        await session.withTransaction(async () => { value = await operation(session); });
        return value;
      } catch (error) {
        const duplicate = error as { code?: unknown; keyPattern?: { inviteCode?: unknown } };
        if (attempt >= 4 || duplicate?.code !== 11000 || !duplicate.keyPattern?.inviteCode) throw error;
      }
    }
  } finally {
    await session.endSession();
  }
}

const transactionGlobal = globalThis as typeof globalThis & {
  sharedWriteQueue?: { tail: Promise<void>; pending: number };
};
const queue = transactionGlobal.sharedWriteQueue ??= { tail: Promise.resolve(), pending: 0 };

export async function withSharedWriteTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  if (queue.pending >= 256) throw new TransactionBusyError();
  queue.pending++;
  const previous = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    // shortcut: admission is per process; add distributed admission if cross-instance contention stays high.
    return await withTransaction(operation);
  } finally {
    queue.pending--;
    release();
  }
}
