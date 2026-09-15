import { NextRequest, NextResponse } from 'next/server';

import {
  getPanelAdminVivaSessions,
  startVivaSession,
} from '../../../../../lib/vivaSessionDashboard';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { isRecord } from '../../../../../lib/security/input';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized Viva session request.' }, { status: 401 });
  }

  try {
    return NextResponse.json({ sessions: await getPanelAdminVivaSessions(currentUser.id) });
  } catch (error) {
    console.error('Supervisor Viva session fetch error:', error);
    return NextResponse.json({ error: 'Failed to load Viva sessions.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized Viva session request.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid Viva session request.' }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.sessionId !== 'string') {
    return NextResponse.json({ error: 'Invalid Viva session request.' }, { status: 400 });
  }

  try {
    const result = await startVivaSession(body.sessionId, currentUser);
    if (!result.success) {
      const status = result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : result.reason === 'concurrent-change' ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ session: result.workspace, started: result.started });
  } catch (error) {
    console.error('Supervisor Viva session start error:', error);
    return NextResponse.json({ error: 'Failed to start the Viva session.' }, { status: 500 });
  }
}
