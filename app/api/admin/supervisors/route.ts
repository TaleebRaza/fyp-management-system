import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { APP_SETTINGS } from '../../../../config/appSettings';
import { getSupervisorExtraSlots, getSupervisorMaxSlots } from '../../../../lib/supervisorSlots';
import { requireCurrentUser } from '../../../../lib/security/auth';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const supervisors = await User.find({ role: 'supervisor' })
      .select('_id name email rollNo migrationCode notificationsEnabled extraSlots')
      .lean();
    const supervisorIds = supervisors.map((supervisor) => supervisor._id);
    const counts = new Map<string, number>();

    if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
      const rows = await User.aggregate([
        { $match: { role: 'student', supervisorId: { $in: supervisorIds } } },
        { $group: { _id: '$supervisorId', count: { $sum: 1 } } },
      ]);
      rows.forEach((row) => counts.set(row._id.toString(), row.count));
    } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
      const rows = await Project.aggregate([
        { $match: { supervisorId: { $in: supervisorIds } } },
        { $group: { _id: '$supervisorId', count: { $sum: 1 } } },
      ]);
      rows.forEach((row) => counts.set(row._id.toString(), row.count));
    }

    return NextResponse.json(supervisors.map((supervisor) => {
      const filledSlots = counts.get(supervisor._id.toString()) || 0;
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
        isFull: filledSlots >= maxSlots,
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
