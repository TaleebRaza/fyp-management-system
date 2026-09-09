import { NextResponse } from 'next/server';

import { processEssentialBackgroundWork } from '../../../../lib/backgroundWork';
import connectToDatabase from '../../../../lib/mongodb';
import { getCronSecret } from '../../../../lib/runtimeConfig';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), getCronSecret())) {
    console.warn('Unauthorized essential background operation blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    return NextResponse.json(await processEssentialBackgroundWork());
  } catch {
    console.error('essential_background_work_failed');
    return NextResponse.json({ error: 'Failed to process essential background work.' }, { status: 500 });
  }
}
