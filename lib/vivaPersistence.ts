import mongoose, { type ClientSession } from 'mongoose';

import VivaAuditEvent, { type VivaAuditEventType } from '../models/VivaAuditEvent';

export type VivaAuditEventInput = {
  roundId: string;
  sessionId?: string | null;
  event: VivaAuditEventType;
  actorId: string;
  actorRole: 'admin' | 'supervisor' | 'student';
  actorName: string;
  actorRollNo: string;
  occurredAt?: Date;
};

export async function withVivaTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function recordVivaAuditEvent(input: VivaAuditEventInput, session: ClientSession) {
  const event = new VivaAuditEvent(input);
  await event.save({ session });
  return event;
}
