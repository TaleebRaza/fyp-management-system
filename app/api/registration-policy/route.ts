import { NextRequest, NextResponse } from 'next/server';
import { getPublicRegistrationPolicy } from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    return publicJson(req, await getPublicRegistrationPolicy());
  } catch (error) {
    console.error('Registration policy read error:', error);
    return NextResponse.json(
      { error: 'Unable to load the registration policy.' },
      { status: 500 }
    );
  }
}
