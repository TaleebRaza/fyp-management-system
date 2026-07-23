// app/api/dashboard/supervisor/broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../../lib/mongodb';
import User from '../../../../../models/User';
import SystemConfig from '../../../../../models/SystemConfig';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../../lib/s3-client';
import { requireCurrentUser } from '../../../../../lib/security/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Authentication
    const currentUser = await requireCurrentUser(req, ['supervisor']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized: Supervisor access required.' }, { status: 401 });
    }

    await connectToDatabase();
    const { broadcastType, broadcastContent, broadcastSize = 0 } = await req.json();

    if (!broadcastType || !broadcastContent) {
      return NextResponse.json({ error: 'Missing required broadcast fields.' }, { status: 400 });
    }

    const supervisor = await User.findById(currentUser.id);
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }

    let sizeDelta = 0;

    // 2. Orphan Prevention: Purge old audio from R2 if it exists
    if (supervisor.broadcastType === 'audio' && supervisor.broadcastContent) {
      try {
        let keyToDelete = supervisor.broadcastContent;
        if (keyToDelete.includes('.com/')) keyToDelete = keyToDelete.split('.com/')[1];
        
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
        sizeDelta -= (supervisor.broadcastSize || 0); // Refund the bytes
        console.log(`🧹 Broadcast Overwrite: Wiped old audio -> ${keyToDelete}`);
      } catch (e: any) {
        console.error('Failed to wipe old broadcast audio:', e.message);
      }
    }

    // 3. Add new audio bytes to the ledger payload if applicable
    if (broadcastType === 'audio') {
      sizeDelta += broadcastSize;
    }

    // 4. Update the Supervisor's Document
    supervisor.broadcastType = broadcastType;
    supervisor.broadcastContent = broadcastContent;
    supervisor.broadcastSize = broadcastType === 'audio' ? broadcastSize : 0;
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
  } catch (error: any) {
    console.error('Broadcast POST Error:', error);
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
    
    const supervisor = await User.findById(currentUser.id);
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
        console.log(`🧹 Broadcast Clear: Wiped audio -> ${keyToDelete}`);
      } catch (e: any) {
        console.error('Failed to wipe broadcast audio during clear:', e.message);
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
  } catch (error: any) {
    console.error('Broadcast DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to clear broadcast.' }, { status: 500 });
  }
}
