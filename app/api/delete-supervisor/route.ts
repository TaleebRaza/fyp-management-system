import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project'; // NEW: Imported to fix the ghost-project bug

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { id } = await req.json();

    // 1. Establish an Atomic Transaction Session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 2. Delete the supervisor
      const deletedSupervisor = await User.findByIdAndDelete(id, { session });
      
      if (!deletedSupervisor) {
        await session.abortTransaction();
        session.endSession();
        return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
      }

      // 3. Safely unassign any STUDENTS that belonged to this supervisor
      await User.updateMany(
        { supervisorId: id }, 
        { $set: { 
            supervisorId: null, 
            status: 'Unassigned', 
            remarks: 'Your supervisor was removed from the system. Please select a new one.' 
          } 
        },
        { session }
      );

      // 4. CRITICAL FIX: Unassign the supervisor from any active PROJECTS
      // If we don't do this, projects will be tied to a deleted ID, crashing the portal.
      await Project.updateMany(
        { supervisorId: id },
        { $set: { supervisorId: null } },
        { session }
      );

      // 5. Commit Transaction
      await session.commitTransaction();
      session.endSession();

      return NextResponse.json({ message: 'Supervisor deleted successfully' }, { status: 200 });

    } catch (transactionError) {
      // Emergency Rollback
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
  } catch (error: any) {
    console.error('Delete Supervisor Error:', error.message);
    return NextResponse.json({ error: 'Failed to delete supervisor' }, { status: 500 });
  }
}