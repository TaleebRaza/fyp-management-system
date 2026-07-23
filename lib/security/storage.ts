import Project from '../../models/Project';
import User from '../../models/User';
import VoiceNote from '../../models/VoiceNote';
import { CurrentUser, hasProjectAccess } from './auth';
export { normalizeStorageKey } from './storageKey';

function keyMatcher(key: string) {
  return new RegExp(`(?:^|/)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export async function canAccessStoredObject(currentUser: CurrentUser, key: string) {
  const matcher = keyMatcher(key);
  const [project, voiceNote, broadcastOwner] = await Promise.all([
    Project.findOne({ $or: [{ pdfUrl: key }, { pdfUrl: matcher }] }).select('_id').lean(),
    VoiceNote.findOne({ $or: [{ blobUrl: key }, { blobUrl: matcher }] }).select('projectId').lean(),
    User.findOne({
      role: 'supervisor',
      broadcastType: 'audio',
      $or: [{ broadcastContent: key }, { broadcastContent: matcher }],
    }).select('_id').lean(),
  ]);

  if (project) return hasProjectAccess(currentUser, project._id.toString());
  if (voiceNote) return hasProjectAccess(currentUser, voiceNote.projectId.toString());
  if (!broadcastOwner) return false;
  if (currentUser.role === 'admin' || currentUser.id === broadcastOwner._id.toString()) return true;

  return currentUser.role === 'student' && Boolean(await User.exists({
    _id: currentUser.id,
    supervisorId: broadcastOwner._id,
  }));
}
