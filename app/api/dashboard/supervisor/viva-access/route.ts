import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/security/auth';
import { isVivaPanelMemberAccessRestricted } from '../../../../../lib/vivaAccessRestriction';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'supervisor') {
    return NextResponse.json({ error: 'Unauthorized Viva access request.' }, { status: 401 });
  }

  try {
    return NextResponse.json({
      restricted: await isVivaPanelMemberAccessRestricted(currentUser.id),
    });
  } catch (error) {
    console.error('Supervisor Viva access check error:', error);
    return NextResponse.json({ error: 'Failed to verify Viva access.' }, { status: 500 });
  }
}
