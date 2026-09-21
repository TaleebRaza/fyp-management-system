import { NextRequest, NextResponse } from 'next/server';

import {
  completeVivaSession,
  getVivaPanelSessions,
  requeueVivaSession,
  saveVivaGrade,
  startVivaSession,
} from '../../../../../lib/vivaSessionDashboard';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { isRecord } from '../../../../../lib/security/input';

export const dynamic = 'force-dynamic';

function responseStatus(reason: 'not-found' | 'forbidden' | 'not-startable' | 'invalid' | 'concurrent-change') {
  if (reason === 'not-found') return 404;
  if (reason === 'forbidden') return 403;
  if (reason === 'concurrent-change') return 409;
  return 400;
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized Viva session request.' }, { status: 401 });
  }

  try {
    return NextResponse.json({ sessions: await getVivaPanelSessions(currentUser.id) });
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
    const action = typeof body.action === 'string' ? body.action : 'start';
    if (action === 'start') {
      const result = await startVivaSession(body.sessionId, currentUser);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: responseStatus(result.reason) });
      }
      return NextResponse.json({ session: result.workspace, started: result.started });
    }

    if (action === 'save-grade') {
      if (typeof body.grade !== 'string' || !isVersion(body.version)) {
        return NextResponse.json({ error: 'Invalid Viva grade request.' }, { status: 400 });
      }
      const result = await saveVivaGrade(body.sessionId, body.version, body.grade, currentUser);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: responseStatus(result.reason) });
      }
      return NextResponse.json({ session: result.workspace });
    }

    if (action === 'complete') {
      if (!isVersion(body.version)) {
        return NextResponse.json({ error: 'Invalid Viva completion request.' }, { status: 400 });
      }
      const result = await completeVivaSession(body.sessionId, body.version, currentUser);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: responseStatus(result.reason) });
      }
      return NextResponse.json({
        completed: true,
        result: result.result,
        completedAt: result.completedAt,
        session: result.workspace,
      });
    }

    if (action === 'requeue-session') {
      if (!isVersion(body.version)) {
        return NextResponse.json({ error: 'Invalid Viva requeue request.' }, { status: 400 });
      }
      const result = await requeueVivaSession(body.sessionId, body.version, currentUser);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: responseStatus(result.reason) });
      }
      return NextResponse.json({ sessions: await getVivaPanelSessions(currentUser.id) });
    }

    return NextResponse.json({ error: 'Invalid Viva session request.' }, { status: 400 });
  } catch (error) {
    console.error('Supervisor Viva session request error:', error);
    return NextResponse.json({ error: 'Failed to process the Viva session request.' }, { status: 500 });
  }
}
