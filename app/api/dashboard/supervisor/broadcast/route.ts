// app/api/dashboard/supervisor/broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../../../lib/mongodb';
import User from '../../../../../models/User';
import SystemConfig from '../../../../../models/SystemConfig';
import { toR2DeletionTarget } from '../../../../../lib/r2Cleanup';
import { deleteR2Targets } from '../../../../../lib/r2Deletion';
import { decrementStorageLedger } from '../../../../../lib/storageLedger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Authentication
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized: Supervisor access required.' }, { status: 401 });
    }

    await connectToDatabase();
    const { broadcastType, broadcastContent, broadcastSize = 0 } = await req.json();

    if (!broadcastType || !broadcastContent) {
      return NextResponse.json({ error: 'Missing required broadcast fields.' }, { status: 400 });
    }

    const supervisor = await User.findById(token.id);
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }

    let sizeDelta = 0;

    // 2. Orphan Prevention: Purge old audio from R2 if it exists
    if (supervisor.broadcastType === 'audio' && supervisor.broadcastContent) {
      const oldTarget = toR2DeletionTarget(supervisor.broadcastContent, supervisor.broadcastSize);
      if (oldTarget) {
        await deleteR2Targets([oldTarget]);
        sizeDelta -= oldTarget.size;
        console.log(`🧹 Broadcast Overwrite: Wiped old audio -> ${oldTarget.key}`);
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
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized: Supervisor access required.' }, { status: 401 });
    }

    await connectToDatabase();
    
    const supervisor = await User.findById(token.id);
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }

    let sizeRefund = 0;

    // 1. If the active broadcast is audio, wipe the physical file
    if (supervisor.broadcastType === 'audio' && supervisor.broadcastContent) {
      const oldTarget = toR2DeletionTarget(supervisor.broadcastContent, supervisor.broadcastSize);
      if (oldTarget) {
        await deleteR2Targets([oldTarget]);
        sizeRefund = oldTarget.size;
        console.log(`🧹 Broadcast Clear: Wiped audio -> ${oldTarget.key}`);
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
      await decrementStorageLedger(sizeRefund);
    }

    return NextResponse.json({ message: 'Broadcast cleared.' }, { status: 200 });
  } catch (error: any) {
    console.error('Broadcast DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to clear broadcast.' }, { status: 500 });
  }
}
