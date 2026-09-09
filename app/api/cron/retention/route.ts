import { NextResponse } from 'next/server';

import { processConfiguredRetention } from '../../../../lib/retention';
import { getCronSecret } from '../../../../lib/runtimeConfig';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), getCronSecret())) {
    console.warn('Unauthorized retention operation blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    return NextResponse.json(await processConfiguredRetention());
  } catch {
    console.error('retention_background_work_failed');
    return NextResponse.json({ error: 'Failed to process configured retention.' }, { status: 500 });
  }
}
