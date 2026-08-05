import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '../../../../models/User';
import {
  MAX_EXTRA_SUPERVISOR_SLOTS,
  getSupervisorMaxSlots,
  normalizeExtraSupervisorSlots,
} from '../../../../lib/supervisorSlots';
import { requireCurrentUser } from '../../../../lib/security/auth';
import {
  invalidatePublicContent,
  PUBLIC_SUPERVISORS_TAG,
} from '../../../../lib/publicContentCache';
import { recordPortalActivity } from '../../../../lib/portalActivityLog';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['admin']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { supervisorId, extraSlots } = await req.json();

    if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
      return NextResponse.json({ error: 'Invalid supervisor selected.' }, { status: 400 });
    }

    const numericExtraSlots = Number(extraSlots);

    if (!Number.isInteger(numericExtraSlots)) {
      return NextResponse.json({ error: 'Extra slots must be a whole number.' }, { status: 400 });
    }

    if (numericExtraSlots < 0 || numericExtraSlots > MAX_EXTRA_SUPERVISOR_SLOTS) {
      return NextResponse.json(
        { error: `Extra slots must be between 0 and ${MAX_EXTRA_SUPERVISOR_SLOTS}.` },
        { status: 400 }
      );
    }

    const safeExtraSlots = normalizeExtraSupervisorSlots(numericExtraSlots);

    const supervisor = await User.findOneAndUpdate(
      { _id: supervisorId, role: 'supervisor' },
      { $set: { extraSlots: safeExtraSlots } },
      { new: true }
    )
      .select('_id name rollNo extraSlots')
      .lean();

    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }
    invalidatePublicContent(PUBLIC_SUPERVISORS_TAG);

    await recordPortalActivity({
      action: 'admin-supervisor-updated',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json(
      {
        message: `${supervisor.name} now has ${safeExtraSlots} extra slot${safeExtraSlots === 1 ? '' : 's'}.`,
        supervisor: {
          ...supervisor,
          extraSlots: safeExtraSlots,
          maxSlots: getSupervisorMaxSlots(supervisor),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update Supervisor Slots Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to update supervisor slots.' }, { status: 500 });
  }
}
