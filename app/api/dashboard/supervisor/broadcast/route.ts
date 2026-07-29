// app/api/dashboard/supervisor/broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../../lib/mongodb';
import User from '../../../../../models/User';
import SystemConfig from '../../../../../models/SystemConfig';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../../lib/s3-client';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { isRecord, normalizeText } from '../../../../../lib/security/input';
import { isOwnedBroadcastKey } from '../../../../../lib/security/voice';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Authentication
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

    const supervisor = await User.findOne({ _id: currentUser.id, role: 'supervisor' });
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }

    let sizeDelta = 0;
    let verifiedAudioSize = 0;

    if (broadcastType === 'text') {
      const text = normalizeText(broadcastContent, 2_000);
      if (!text) return NextResponse.json({ error: 'Broadcast text is required.' }, { status: 400 });
      supervisor.broadcastContent = text;
    } else {
      if (!isOwnedBroadcastKey(broadcastContent, currentUser.id)) {
        return NextResponse.json({ error: 'Invalid broadcast upload.' }, { status: 400 });
      }

      const object = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: broadcastContent }));
      verifiedAudioSize = Number(object.ContentLength || 0);
      if (verifiedAudioSize <= 0 || verifiedAudioSize > 1024 * 1024 || object.ContentType !== 'audio/webm') {
        return NextResponse.json({ error: 'Uploaded broadcast audio is invalid.' }, { status: 400 });
      }
      supervisor.broadcastContent = broadcastContent;
    }

    // 2. Orphan Prevention: Purge old audio from R2 if it exists
    if (supervisor.broadcastType === 'audio' && supervisor.broadcastContent) {
      try {
        let keyToDelete = supervisor.broadcastContent;
        if (keyToDelete.includes('.com/')) keyToDelete = keyToDelete.split('.com/')[1];
        
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
        sizeDelta -= (supervisor.broadcastSize || 0); // Refund the bytes
      } catch {
        console.error('broadcast_overwrite_cleanup_failed');
      }
    }

    // 3. Add new audio bytes to the ledger payload if applicable
    if (broadcastType === 'audio') sizeDelta += verifiedAudioSize;

    // 4. Update the Supervisor's Document
    supervisor.broadcastType = broadcastType;
    supervisor.broadcastSize = broadcastType === 'audio' ? verifiedAudioSize : 0;
    supervisor.broadcastCreatedAt = new Date();
    await supervisor.save();

    // 5. Atomically sync the global storage ledger
    if (sizeDelta !== 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: sizeDelta } },
        { upsert: true }
      );
    }

    return NextResponse.json({ message: 'Broadcast published successfully!' }, { status: 200 });
  } catch {
    console.error('broadcast_publish_failed');
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
    
    const supervisor = await User.findOne({ _id: currentUser.id, role: 'supervisor' });
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }

    let sizeRefund = 0;

    // 1. If the active broadcast is audio, wipe the physical file
    if (supervisor.broadcastType === 'audio' && supervisor.broadcastContent) {
      try {
        let keyToDelete = supervisor.broadcastContent;
        if (keyToDelete.includes('.com/')) keyToDelete = keyToDelete.split('.com/')[1];
        
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
        sizeRefund = supervisor.broadcastSize || 0;
      } catch {
        console.error('broadcast_clear_cleanup_failed');
      }
    }

    // 2. Clear the database fields
    supervisor.broadcastType = null;
    supervisor.broadcastContent = null;
    supervisor.broadcastSize = 0;
    supervisor.broadcastCreatedAt = null;
    await supervisor.save();

    // 3. Refund the ledger
    if (sizeRefund > 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: -sizeRefund } },
        { upsert: true }
      );
    }

    return NextResponse.json({ message: 'Broadcast cleared.' }, { status: 200 });
  } catch {
    console.error('broadcast_clear_failed');
    return NextResponse.json({ error: 'Failed to clear broadcast.' }, { status: 500 });
  }
}
