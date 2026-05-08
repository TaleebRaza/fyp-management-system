import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project'; 
import { APP_SETTINGS } from '../../../config/appSettings';

export async function GET() {
  try {
    await connectToDatabase();
    
    // 1. Fetch all users with the role of supervisor (Query 1)
    const supervisors = await User.find({ role: 'supervisor' }).lean();
    
    // If no supervisors exist, return early to save processing time
    if (!supervisors.length) {
      return NextResponse.json([], { status: 200 });
    }

    // Extract supervisor IDs so we only count data for these specific users
    const supervisorIds = supervisors.map(sup => sup._id);
    const countsMap = new Map(); // Using a Map for O(1) lightning-fast lookups

    // 2. Perform ONE bulk aggregation instead of N individual count queries (Query 2)
    if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
      const studentCounts = await User.aggregate([
        { $match: { role: 'student', supervisorId: { $in: supervisorIds } } },
        { $group: { _id: '$supervisorId', count: { $sum: 1 } } }
      ]);
      
      // Store the bulk results in our map
      studentCounts.forEach(item => countsMap.set(item._id.toString(), item.count));
      
    } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
      const projectCounts = await Project.aggregate([
        { $match: { supervisorId: { $in: supervisorIds } } },
        { $group: { _id: '$supervisorId', count: { $sum: 1 } } }
      ]);
      
      // Store the bulk results in our map
      projectCounts.forEach(item => countsMap.set(item._id.toString(), item.count));
    }

    // 3. Attach the capacity metadata in memory (Zero database calls inside this loop)
    const supervisorsWithSlots = supervisors.map(sup => {
      // Pull the pre-calculated count from our map, default to 0 if not found
      const filledSlots = countsMap.get(sup._id.toString()) || 0;
      
      return {
        ...sup,
        filledSlots,
        isFull: filledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR,
        maxSlots: APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR
      };
    });

    return NextResponse.json(supervisorsWithSlots, { status: 200 });
    
  } catch (error: any) {
    console.error('API Error [supervisor-fetch]:', error.message);
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}