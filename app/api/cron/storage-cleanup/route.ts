import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { drainBatches } from '../../../../lib/drainBatches';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';
import {
  expireUploadReservations,
  processStorageDeletionOutbox,
} from '../../../../lib/storageProtocol';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const deadline = Date.now() + 40_000;
    const reservations = await drainBatches(
      () => expireUploadReservations(25, deadline), (batch) => batch.processed === 25, deadline
    );
    const deletions = await drainBatches(
      () => processStorageDeletionOutbox(25, deadline), (batch) => batch.claimed === 25, deadline
    );
    return NextResponse.json({ reservations, deletions });
  } catch {
    console.error('storage_cleanup_failed');
    return NextResponse.json({ error: 'Failed to process storage cleanup.' }, { status: 500 });
  }
}
