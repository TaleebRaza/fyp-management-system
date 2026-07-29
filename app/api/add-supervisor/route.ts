import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

import { normalizeRollNo } from '../../../lib/rollNo';
import { requireCurrentUser } from '../../../lib/security/auth';
import { isRecord, normalizeText } from '../../../lib/security/input';
import { validatePassword } from '../../../lib/security/password';
import { isValidEmailAddress, normalizeEmailAddress } from '../../../lib/studentIdentity';
import {
  invalidatePublicContent,
  PUBLIC_SUPERVISORS_TAG,
} from '../../../lib/publicContentCache';
import User from '../../../models/User';

export async function POST(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid supervisor request.' }, { status: 400 });

    const name = normalizeText(body.name, 100);
    const email = normalizeEmailAddress(body.email);
    const rollNo = normalizeRollNo(body.rollNo);
    const password = typeof body.password === 'string' ? body.password : '';
    const migrationCode = normalizeText(body.migrationCode, 32).toUpperCase();

    if (!name || !email || !rollNo || !password || !migrationCode) {
      return NextResponse.json({ error: 'Name, email, roll number, password, and migration code are required.' }, { status: 400 });
    }
    if (rollNo.length > 40 || !isValidEmailAddress(email) || !/^[A-Z0-9-]+$/.test(migrationCode)) {
      return NextResponse.json({ error: 'Enter valid supervisor details.' }, { status: 400 });
    }
    if (!validatePassword(password)) {
      return NextResponse.json({ error: 'Password must be 10 to 128 characters.' }, { status: 400 });
    }

    await new User({
      name,
      email,
      rollNo,
      password: await bcrypt.hash(password, 10),
      role: 'supervisor',
      migrationCode,
      notificationsEnabled: true,
      occupiedSlots: 0,
    }).save();
    invalidatePublicContent(PUBLIC_SUPERVISORS_TAG);

    return NextResponse.json({ message: 'Supervisor added successfully.' }, { status: 201 });
  } catch (error) {
    if ((error as { code?: unknown }).code === 11000) {
      return NextResponse.json({ error: 'This roll number, email, or migration code already exists.' }, { status: 400 });
    }

    console.error('add_supervisor_failed');
    return NextResponse.json({ error: 'Failed to add supervisor.' }, { status: 500 });
  }
}
