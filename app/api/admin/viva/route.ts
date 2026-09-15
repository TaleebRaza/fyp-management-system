import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import {
  createVivaRound,
  getVivaRoundAdminData,
  parseVivaRoundInput,
  updateVivaRound,
} from '../../../../lib/vivaRoundAdmin';
import {
  parseVivaPanelAllocationInput,
  parseVivaPanelSaveInput,
  previewRandomVivaPanels,
  saveVivaPanels,
} from '../../../../lib/vivaPanelAdmin';
import { parseVivaPublicationInput, publishVivaResults } from '../../../../lib/vivaPublication';
import {
  cancelVivaSession,
  parseVivaSessionCancellationInput,
  parseVivaScheduleInput,
  parseVivaScheduleUpdateInput,
  rescheduleVivaSession,
  scheduleVivaSession,
} from '../../../../lib/vivaScheduling';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { isRecord } from '../../../../lib/security/input';

export const dynamic = 'force-dynamic';

function adminActor(user: { id: string; name: string; rollNo: string }) {
  return { id: user.id, name: user.name, rollNo: user.rollNo };
}

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    return NextResponse.json(await getVivaRoundAdminData());
  } catch (error) {
    console.error('Admin Viva configuration fetch error:', error);
    return NextResponse.json({ error: 'Failed to load Viva configuration.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid Viva request.' }, { status: 400 });
  }

  if (isRecord(body) && body.action === 'generate-panels') {
    const parsed = parseVivaPanelAllocationInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const result = await previewRandomVivaPanels(parsed.input);
      if (!result.success) {
        const status = result.reason === 'not-found' ? 404 : result.reason === 'invalid' ? 400 : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ panels: result.panels, panelRevision: result.panelRevision });
    } catch (error) {
      console.error('Admin Viva panel allocation error:', error);
      return NextResponse.json({ error: 'Failed to generate Viva panels.' }, { status: 500 });
    }
  }

  if (isRecord(body) && body.action === 'schedule-session') {
    const parsed = parseVivaScheduleInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const result = await scheduleVivaSession(parsed.input, adminActor(currentUser));
      if (!result.success) {
        const status = result.reason === 'concurrent-change' ? 409 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ schedule: result.schedule }, { status: 201 });
    } catch (error) {
      console.error('Admin Viva session scheduling error:', error);
      return NextResponse.json({ error: 'Failed to schedule the Viva session.' }, { status: 500 });
    }
  }

  const parsed = parseVivaRoundInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await createVivaRound(parsed.input, adminActor(currentUser));
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ round: result.round }, { status: 201 });
  } catch (error) {
    console.error('Admin Viva round creation error:', error);
    return NextResponse.json({ error: 'Failed to save the Viva round.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid Viva round request.' }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.roundId !== 'string' || !mongoose.Types.ObjectId.isValid(body.roundId)) {
    return NextResponse.json({ error: 'Invalid Viva round request.' }, { status: 400 });
  }

  const parsed = parseVivaRoundInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await updateVivaRound(body.roundId, parsed.input, adminActor(currentUser));
    if (!result.success) {
      const status = result.reason === 'not-found' ? 404 : result.reason === 'frozen' ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ round: result.round });
  } catch (error) {
    console.error('Admin Viva round update error:', error);
    return NextResponse.json({ error: 'Failed to update the Viva round.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid Viva panel request.' }, { status: 400 });
  }

  if (isRecord(body) && body.action === 'reschedule-session') {
    const parsed = parseVivaScheduleUpdateInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const result = await rescheduleVivaSession(
        parsed.sessionId,
        parsed.version,
        parsed.input,
        adminActor(currentUser)
      );
      if (!result.success) {
        const status = result.reason === 'not-found' ? 404 : result.reason === 'concurrent-change' ? 409 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ schedule: result.schedule });
    } catch (error) {
      console.error('Admin Viva session rescheduling error:', error);
      return NextResponse.json({ error: 'Failed to reschedule the Viva session.' }, { status: 500 });
    }
  }

  if (isRecord(body) && body.action === 'cancel-session') {
    const parsed = parseVivaSessionCancellationInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const result = await cancelVivaSession(parsed.input, adminActor(currentUser));
      if (!result.success) {
        const status = result.reason === 'not-found' ? 404 : result.reason === 'concurrent-change' ? 409 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ schedule: result.schedule });
    } catch (error) {
      console.error('Admin Viva session cancellation error:', error);
      return NextResponse.json({ error: 'Failed to cancel the Viva session.' }, { status: 500 });
    }
  }

  if (isRecord(body) && body.action === 'publish-results') {
    const parsed = parseVivaPublicationInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const publication = await publishVivaResults(parsed.input, adminActor(currentUser));
      return NextResponse.json({ publication });
    } catch (error) {
      console.error('Admin Viva result publication error:', error);
      return NextResponse.json({ error: 'Failed to publish Viva results.' }, { status: 500 });
    }
  }

  const parsed = parseVivaPanelSaveInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await saveVivaPanels(parsed.input, adminActor(currentUser));
    if (!result.success) {
      const status = result.reason === 'not-found' ? 404 : result.reason === 'invalid' ? 400 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ panels: result.panels, panelRevision: result.panelRevision });
  } catch (error) {
    console.error('Admin Viva panel save error:', error);
    return NextResponse.json({ error: 'Failed to save Viva panels.' }, { status: 500 });
  }
}
