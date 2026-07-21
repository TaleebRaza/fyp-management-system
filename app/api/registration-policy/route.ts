import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import {
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../lib/registrationPolicy';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const policy = await getOrCreateRegistrationPolicy();

    return NextResponse.json(serializeRegistrationPolicy(policy), {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Registration policy read error:', error);
    return NextResponse.json(
      { error: 'Unable to load the registration policy.' },
      { status: 500 }
    );
  }
}
