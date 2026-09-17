import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../lib/security/auth';
import { isVivaSessionAccessRestricted } from '../../../../lib/vivaAccessRestriction';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized Viva access request.' }, { status: 401 });
  }

  try {
    return NextResponse.json({
      restricted: await isVivaSessionAccessRestricted(currentUser.id),
    });
  } catch (error) {
    console.error('Viva access check error:', error);
    return NextResponse.json({ error: 'Failed to verify Viva access.' }, { status: 500 });
  }
}
