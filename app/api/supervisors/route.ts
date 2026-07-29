import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import { getSupervisorExtraSlots, getSupervisorMaxSlots } from '../../../lib/supervisorSlots';

export async function GET() {
  try {
    await connectToDatabase();
    
    // This route is used before sign-in, so its response must stay public-safe.
    const supervisors = await User.find({ role: 'supervisor' })
      .select('_id name extraSlots occupiedSlots')
      .lean();
    
    // If no supervisors exist, return early to save processing time
    if (!supervisors.length) {
      return NextResponse.json([], { status: 200 });
    }

    // Capacity counters are backfilled explicitly before a supervisor can accept assignments.
    const supervisorsWithSlots = supervisors.map(sup => {
      const capacityReady = Number.isInteger(sup.occupiedSlots) && sup.occupiedSlots >= 0;
      const filledSlots = capacityReady ? sup.occupiedSlots : 0;
      const extraSlots = getSupervisorExtraSlots(sup);
      const maxSlots = getSupervisorMaxSlots(sup);

      return {
        _id: sup._id,
        name: sup.name,
        extraSlots,
        filledSlots,
        capacityReady,
        isFull: !capacityReady || filledSlots >= maxSlots,
        maxSlots
      };
    });

    return NextResponse.json(supervisorsWithSlots, { status: 200 });
    
  } catch (error) {
    console.error(
      'API Error [supervisor-fetch]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}
