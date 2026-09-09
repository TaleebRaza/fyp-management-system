import { NextRequest, NextResponse } from 'next/server';

import {
  getRetentionConfiguration,
  getRetentionPreview,
  saveRetentionSettings,
} from '../../../../lib/retention';
import { recordCurrentUserActivity } from '../../../../lib/portalActivityLog';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { RetentionValidationError, parseRetentionSettings } from '../../../../types/retention';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  }

  try {
    const configuration = await getRetentionConfiguration();
    return NextResponse.json({
      configuration,
      preview: await getRetentionPreview(configuration.settings),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    console.error('retention_configuration_read_failed');
    return NextResponse.json({ error: 'Unable to load retention settings.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  }

  try {
    const settings = parseRetentionSettings(await req.json());
    const configuration = await saveRetentionSettings(settings);
    await recordCurrentUserActivity('admin-retention-updated', currentUser);
    return NextResponse.json({
      configuration,
      preview: await getRetentionPreview(configuration.settings),
    });
  } catch (error) {
    if (error instanceof RetentionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('retention_configuration_update_failed');
    return NextResponse.json({ error: 'Unable to save retention settings.' }, { status: 500 });
  }
}
