import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import {
  createVivaRound,
  getVivaRoundAdminData,
  parseVivaRoundInput,
  updateVivaRound,
} from '../../../../lib/vivaRoundAdmin';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { isRecord } from '../../../../lib/security/input';

export const dynamic = 'force-dynamic';

function adminActor(user: { id: string; name: string; rollNo: string }) {
  return { id: user.id, name: user.name, rollNo: user.rollNo };
}

async function readRoundInput(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    return parseVivaRoundInput(body);
  } catch {
    return parseVivaRoundInput(null);
  }
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

  const parsed = await readRoundInput(req);
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
