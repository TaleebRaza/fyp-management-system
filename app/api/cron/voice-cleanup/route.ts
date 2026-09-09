import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { processEssentialBackgroundWork } from '../../../../lib/backgroundWork';
import { getCronSecret } from '../../../../lib/runtimeConfig';
import {
  getRetentionConfiguration,
  processConfiguredRetention,
  processLegacyContentRetention,
} from '../../../../lib/retention';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';
import type { RetentionExecutionReport } from '../../../../types/retention';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), getCronSecret())) {
    console.warn('Unauthorized cron execution attempt blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const configuration = await getRetentionConfiguration();
    let retention: RetentionExecutionReport;
    if (configuration.configured || configuration.invalid) {
      retention = await processConfiguredRetention();
    } else {
      retention = await processLegacyContentRetention();
    }
    const essential = await processEssentialBackgroundWork();

    return NextResponse.json({
      message: 'Legacy cleanup and durable background work completed.',
      ...essential,
      retention,
    });
  } catch {
    console.error('voice_cleanup_failed');
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}
