import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../../lib/mongodb';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { isRecord, normalizeText } from '../../../../../lib/security/input';
import { normalizeStorageKey } from '../../../../../lib/security/storage';
import { findSharedStorageKeys } from '../../../../../lib/storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  finalizeUploadReservation,
  StorageProtocolError,
  withStorageTransaction,
} from '../../../../../lib/storageProtocol';
import User from '../../../../../models/User';
import { recordPortalActivity } from '../../../../../lib/portalActivityLog';

export const dynamic = 'force-dynamic';

async function enqueueCurrentBroadcastDeletion(
  supervisor: InstanceType<typeof User>,
  session: Parameters<typeof enqueueStorageDeletion>[1]
) {
  if (supervisor.broadcastType !== 'audio' || !supervisor.broadcastContent) return;

  const key = normalizeStorageKey(supervisor.broadcastContent);
  if (!key) {
    throw new StorageProtocolError(
      'The stored audio key is invalid. Run the storage integrity audit before replacing it.',
      409
    );
  }
  await assertStorageLedgerReady(session);
  const sharedKeys = await findSharedStorageKeys({
    keys: [key],
    excludedSupervisorIds: [supervisor._id],
    session,
  });
  if (sharedKeys.has(key)) return;
  await enqueueStorageDeletion(
    { key, bytes: Number(supervisor.broadcastSize || 0), reason: 'broadcast-replaced' },
    session
  );
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['supervisor']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized: Supervisor access required.' }, { status: 401 });
    }

    await connectToDatabase();
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid broadcast request.' }, { status: 400 });

    const broadcastType = body.broadcastType;
    const broadcastContent = typeof body.broadcastContent === 'string' ? body.broadcastContent.trim() : '';
    if ((broadcastType !== 'text' && broadcastType !== 'audio') || !broadcastContent) {
      return NextResponse.json({ error: 'Missing required broadcast fields.' }, { status: 400 });
    }

    if (broadcastType === 'text') {
      const text = normalizeText(broadcastContent, 2_000);
      if (!text) return NextResponse.json({ error: 'Broadcast text is required.' }, { status: 400 });

      await withStorageTransaction(async (session) => {
        const supervisor = await User.findOne({ _id: currentUser.id, role: 'supervisor' }).session(session);
        if (!supervisor) throw new StorageProtocolError('Supervisor not found.', 404);

        await enqueueCurrentBroadcastDeletion(supervisor, session);
        supervisor.broadcastType = 'text';
        supervisor.broadcastContent = text;
        supervisor.broadcastSize = 0;
        supervisor.broadcastCreatedAt = new Date();
        await supervisor.save({ session });
      });
    } else {
      const key = normalizeStorageKey(broadcastContent);
      if (!key) return NextResponse.json({ error: 'Invalid broadcast upload.' }, { status: 400 });

      await finalizeUploadReservation({
        key,
        ownerId: currentUser.id,
        kind: 'broadcast',
        commit: async (session, uploadedObject) => {
          const supervisor = await User.findOne({ _id: currentUser.id, role: 'supervisor' }).session(session);
          if (!supervisor) throw new StorageProtocolError('Supervisor not found.', 404);

          await enqueueCurrentBroadcastDeletion(supervisor, session);
          supervisor.broadcastType = 'audio';
          supervisor.broadcastContent = key;
          supervisor.broadcastSize = uploadedObject.actualBytes;
          supervisor.broadcastCreatedAt = new Date();
          await supervisor.save({ session });
        },
      });
    }

    await recordPortalActivity({
      action: 'supervisor-broadcast-published',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({ message: 'Broadcast published successfully!' }, { status: 200 });
  } catch (error) {
    console.error('broadcast_publish_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to publish broadcast.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['supervisor']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized: Supervisor access required.' }, { status: 401 });
    }

    await connectToDatabase();
    await withStorageTransaction(async (session) => {
      const supervisor = await User.findOne({ _id: currentUser.id, role: 'supervisor' }).session(session);
      if (!supervisor) throw new StorageProtocolError('Supervisor not found.', 404);

      await enqueueCurrentBroadcastDeletion(supervisor, session);
      supervisor.broadcastType = null;
      supervisor.broadcastContent = null;
      supervisor.broadcastSize = 0;
      supervisor.broadcastCreatedAt = null;
      await supervisor.save({ session });
    });

    await recordPortalActivity({
      action: 'supervisor-broadcast-cleared',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({ message: 'Broadcast cleared.' }, { status: 200 });
  } catch (error) {
    console.error('broadcast_clear_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to clear broadcast.' }, { status: 500 });
  }
}
