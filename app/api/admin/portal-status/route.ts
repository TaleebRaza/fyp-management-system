import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '../../../../lib/security/auth';
import connectToDatabase from '../../../../lib/mongodb';
import {
  DEFAULT_PORTAL_PAUSE_REASON,
  PORTAL_CONFIG_KEY,
} from '../../../../lib/portalPause';
import SystemConfig from '../../../../models/SystemConfig';

export async function PUT(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    const body = await req.json();
    if (typeof body?.paused !== 'boolean') {
      return NextResponse.json({ error: 'Portal status must be paused or active.' }, { status: 400 });
    }

    const reason = String(body.reason || '').trim().slice(0, 500)
      || DEFAULT_PORTAL_PAUSE_REASON;

    await connectToDatabase();
    await SystemConfig.updateOne(
      { configKey: PORTAL_CONFIG_KEY },
      { $set: { portalPaused: body.paused, portalPauseReason: reason } },
      { upsert: true }
    );

    return NextResponse.json({ paused: body.paused, reason });
  } catch (error) {
    console.error('Portal status update error:', error);
    return NextResponse.json({ error: 'Unable to update portal status.' }, { status: 500 });
  }
}
