import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { getSupervisorExtraSlots, getSupervisorMaxSlots } from '../../../../lib/supervisorSlots';
import { requireCurrentUser } from '../../../../lib/security/auth';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const supervisors = await User.find({ role: 'supervisor' })
      .select('_id name email rollNo +migrationCode notificationsEnabled extraSlots occupiedSlots')
      .lean();

    return NextResponse.json(supervisors.map((supervisor) => {
      const capacityReady = Number.isInteger(supervisor.occupiedSlots) && supervisor.occupiedSlots >= 0;
      const filledSlots = capacityReady ? supervisor.occupiedSlots : 0;
      const maxSlots = getSupervisorMaxSlots(supervisor);

      return {
        _id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
        rollNo: supervisor.rollNo,
        migrationCode: supervisor.migrationCode,
        notificationsEnabled: supervisor.notificationsEnabled,
        extraSlots: getSupervisorExtraSlots(supervisor),
        filledSlots,
        capacityReady,
        isFull: !capacityReady || filledSlots >= maxSlots,
        maxSlots,
      };
    }));
  } catch (error) {
    console.error(
      'API Error [admin-supervisor-fetch]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}
