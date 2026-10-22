import mongoose from 'mongoose';
import connectToDatabase from './mongodb';
import Project from '../models/Project';
import VivaRound from '../models/VivaRound';
import VivaSession from '../models/VivaSession';
import VivaAuditEvent from '../models/VivaAuditEvent';
import VivaParticipantLock from '../models/VivaParticipantLock';
import { assertStorageLedgerReady, enqueueStorageDeletion, StorageProtocolError, withStorageTransaction } from './storageProtocol';
import { normalizeStorageKey } from './storageValidation';
import { collectStorageDeletionTargets } from './storageDeletionTargets';
import { findSharedStorageKeys } from './storageReferenceSafety';

export async function resetVivaProjects(roundId: string) {
  if (!mongoose.Types.ObjectId.isValid(roundId)) throw new StorageProtocolError('Choose a valid Viva round.', 400);
  await connectToDatabase();
  return withStorageTransaction(async (session) => {
    const round = await VivaRound.findById(roundId).session(session);
    if (!round) throw new StorageProtocolError('Viva round not found.', 404);
    const projects = await Project.find({ _id: { $in: round.projectIds } }).session(session);
    const projectIds = projects.map((project) => project._id);
    const sessions = await VivaSession.find({ projectId: { $in: projectIds } }).session(session);
    if (sessions.some((record) => record.startedAt && !record.completedAt && !record.cancelledAt)) {
      throw new StorageProtocolError('Complete or cancel active Viva sessions before resetting these projects.', 409);
    }
    const sessionIds = sessions.map((record) => record._id);
    const files = [
      ...projects.map((project) => ({ key: project.pdfUrl, bytes: project.pdfSize })),
      ...sessions.map((record) => ({ key: record.projectSnapshot?.pdfUrl, bytes: record.projectSnapshot?.pdfSize })),
    ];
    if (files.some(({ key }) => key && !normalizeStorageKey(key))) {
      throw new StorageProtocolError('Stored document keys are invalid. Run the storage integrity audit before resetting.', 409);
    }
    await VivaParticipantLock.deleteMany({ sessionId: { $in: sessionIds } }, { session });
    await VivaAuditEvent.deleteMany({ sessionId: { $in: sessionIds } }, { session });
    await VivaSession.deleteMany({ _id: { $in: sessionIds } }, { session });
    const targets = collectStorageDeletionTargets(files);
    if (targets.length) {
      await assertStorageLedgerReady(session);
      const sharedKeys = await findSharedStorageKeys({ keys: targets.map(({ key }) => key), excludedProjectIds: projectIds, session });
      for (const target of targets) {
        if (!sharedKeys.has(target.key)) await enqueueStorageDeletion({ ...target, reason: 'admin-viva-project-reset' }, session);
      }
    }
    await Project.updateMany({ _id: { $in: projectIds } }, {
      $set: { stage: 'PROPOSAL', status: 'Pending', reviewRemarks: '', pdfUrl: '', pdfSize: 0 },
      $unset: { ratings: 1 },
      $inc: { version: 1 },
    }, { session });
    // Removing eligibility prevents confirmed rounds from scheduling the reset teams again.
    await VivaRound.updateMany({ projectIds: { $in: projectIds } }, {
      $pull: { projectIds: { $in: projectIds }, heldProjectIds: { $in: projectIds } },
      $inc: { scheduleRevision: 1 },
    }, { session });
    return { resetProjects: projects.length };
  });
}
