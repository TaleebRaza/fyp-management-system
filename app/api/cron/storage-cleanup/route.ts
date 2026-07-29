import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';
import {
  expireUploadReservations,
  processStorageDeletionOutbox,
} from '../../../../lib/storageProtocol';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const [reservations, deletions] = await Promise.all([
      expireUploadReservations(),
      processStorageDeletionOutbox(),
    ]);
    return NextResponse.json({ reservations, deletions });
  } catch {
    console.error('storage_cleanup_failed');
    return NextResponse.json({ error: 'Failed to process storage cleanup.' }, { status: 500 });
  }
}
