import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { requireCurrentUser } from '../../../lib/security/auth';
import { normalizeStorageKey } from '../../../lib/storageValidation';
import { findSharedStorageKeys } from '../../../lib/storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  StorageProtocolError,
} from '../../../lib/storageProtocol';
import {
  invalidatePublicContent,
  PUBLIC_SUPERVISORS_TAG,
} from '../../../lib/publicContentCache';
import { recordPortalActivity } from '../../../lib/portalActivityLog';

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid supervisor ID.' }, { status: 400 });
    }

    // 1. Establish an Atomic Transaction Session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 2. Delete the supervisor
      const deletedSupervisor = await User.findOneAndDelete({ _id: id, role: 'supervisor' }, { session });

      if (!deletedSupervisor) {
        await session.abortTransaction();
        session.endSession();
        return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
      }

      if (deletedSupervisor.broadcastType === 'audio') {
        const key = normalizeStorageKey(deletedSupervisor.broadcastContent);
        if (!key) {
          throw new StorageProtocolError(
            'The supervisor has an invalid stored audio key. Run the storage integrity audit before deletion.',
            409
          );
        }
        await assertStorageLedgerReady(session);
        const sharedKeys = await findSharedStorageKeys({
          keys: [key],
          excludedSupervisorIds: [deletedSupervisor._id],
          session,
        });
        if (!sharedKeys.has(key)) {
          const numericBytes = Number(deletedSupervisor.broadcastSize);
          const bytes = Number.isSafeInteger(numericBytes) && numericBytes > 0 ? numericBytes : 0;
          await enqueueStorageDeletion({ key, bytes, reason: 'supervisor-deleted' }, session);
        }
      }

      // 3. Unassign the supervisor from canonical Project records.
      await Project.updateMany(
        { supervisorId: id },
        { $set: { supervisorId: null } },
        { session }
      );

      // 5. Commit Transaction
      await session.commitTransaction();
      session.endSession();
      invalidatePublicContent(PUBLIC_SUPERVISORS_TAG);

      await recordPortalActivity({
        action: 'admin-supervisor-deleted',
        actorId: currentUser.id,
        actorRole: currentUser.role,
      });

      return NextResponse.json({ message: 'Supervisor deleted successfully' }, { status: 200 });

    } catch (transactionError) {
      // Emergency Rollback
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
  } catch (error) {
    console.error('delete_supervisor_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to delete supervisor' }, { status: 500 });
  }
}
