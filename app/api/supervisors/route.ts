import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project'; // Imported for future 'PROJECT' mode support
import { APP_SETTINGS } from '../../../config/appSettings';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Fetch all users with the role of supervisor
    const supervisors = await User.find({ role: 'supervisor' }).lean();
    
    // Iterate through each supervisor to calculate their current capacity
    const supervisorsWithSlots = await Promise.all(supervisors.map(async (sup) => {
      let filledSlots = 0;

      if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
        // Count the exact number of students assigned to this supervisor's ID
        filledSlots = await User.countDocuments({ 
          role: 'student', 
          supervisorId: sup._id 
        });
      } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
        // Flexibility for the future: Count unique projects assigned to this supervisor
        filledSlots = await Project.countDocuments({
          supervisorId: sup._id
        });
      }

      // Attach the capacity metadata to the supervisor object
      return {
        ...sup,
        filledSlots,
        isFull: filledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR,
        maxSlots: APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR
      };
    }));

    return NextResponse.json(supervisorsWithSlots, { status: 200 });
  } catch (error) {
    console.error('Supervisor Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}