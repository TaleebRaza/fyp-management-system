import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import { DEFAULT_REGISTRATION_CLOSED_MESSAGE } from '../../../../types/registrationPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';

export const dynamic = 'force-dynamic';

const MAX_FINE_AMOUNT = 1_000_000;

function normalizeText(value: unknown, maximumLength: number) {
  return String(value || '').trim().slice(0, maximumLength);
}

async function requireAdmin(req: NextRequest) {
  return requireCurrentUser(req, ['admin']);
}

export async function GET(req: NextRequest) {
  try {
    const token = await requireAdmin(req);
    if (!token) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    await connectToDatabase();
    const policy = await getOrCreateRegistrationPolicy();

    return NextResponse.json(serializeRegistrationPolicy(policy), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Admin registration policy read error:', error);
    return NextResponse.json(
      { error: 'Unable to load the registration policy.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = await requireAdmin(req);
    if (!token) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    const body = await req.json();
    if (typeof body?.isOpen !== 'boolean') {
      return NextResponse.json(
        { error: 'Registration status must be open or closed.' },
        { status: 400 }
      );
    }

    const isOpen = body.isOpen;
    const closedMessage =
      normalizeText(body.closedMessage, 500) || DEFAULT_REGISTRATION_CLOSED_MESSAGE;

    if (!isOpen && !closedMessage) {
      return NextResponse.json(
        { error: 'Add the message students should see while registration is closed.' },
        { status: 400 }
      );
    }

    const rawPunishment = body.punishment || {};
    const punishmentEnabled = rawPunishment.enabled === true;
    const category = rawPunishment.category === 'other' ? 'other' : 'fine';
    const title = normalizeText(rawPunishment.title, 120);
    const description = normalizeText(rawPunishment.description, 1000);
    const amount = Math.round(Number(rawPunishment.amount || 0));

    if (punishmentEnabled && !title) {
      return NextResponse.json(
        { error: 'Add a short punishment title.' },
        { status: 400 }
      );
    }

    if (punishmentEnabled && !description) {
      return NextResponse.json(
        { error: 'Explain the punishment that will apply to new registrations.' },
        { status: 400 }
      );
    }

    if (
      punishmentEnabled &&
      category === 'fine' &&
      (!Number.isFinite(amount) || amount < 1 || amount > MAX_FINE_AMOUNT)
    ) {
      return NextResponse.json(
        { error: `Fine amount must be between 1 and ${MAX_FINE_AMOUNT.toLocaleString()} PKR.` },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const previous = await RegistrationPolicy.findOne({
      policyKey: REGISTRATION_POLICY_KEY,
    })
      .select('isOpen')
      .lean();

    const now = new Date();
    const statusDates: Record<string, Date | null> = {};
    if (previous && previous.isOpen !== isOpen) {
      if (isOpen) {
        statusDates.reopenedAt = now;
      } else {
        statusDates.closedAt = now;
      }
    } else if (!previous && !isOpen) {
      statusDates.closedAt = now;
    }

    const updatedBy =
      typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)
        ? token.id
        : null;

    const updated = await RegistrationPolicy.findOneAndUpdate(
      { policyKey: REGISTRATION_POLICY_KEY },
      {
        $set: {
          isOpen,
          closedMessage,
          punishment: {
            enabled: punishmentEnabled,
            category,
            title,
            description,
            amount: category === 'fine' && Number.isFinite(amount) ? Math.max(0, amount) : 0,
          },
          updatedBy,
          ...statusDates,
        },
        $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
        $inc: { version: 1 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      message: isOpen
        ? punishmentEnabled
          ? 'Registration is open. The configured punishment will apply only to new registrations.'
          : 'Registration is open without an additional admin punishment.'
        : 'Registration is closed and the student form is locked.',
      policy: serializeRegistrationPolicy(updated),
    });
  } catch (error) {
    console.error('Admin registration policy update error:', error);
    return NextResponse.json(
      { error: 'Unable to update the registration policy.' },
      { status: 500 }
    );
  }
}
