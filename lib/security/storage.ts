import Project from '../../models/Project';
import User from '../../models/User';
import VoiceNote from '../../models/VoiceNote';
import { CurrentUser, hasProjectAccess } from './auth';
import { getStorageObjectKind } from '../storageValidation';

function keyMatcher(key: string) {
  return new RegExp(`(?:^|/)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function projectAccessFilter(currentUser: CurrentUser) {
  return currentUser.role === 'admin'
    ? {}
    : { $or: [{ supervisorId: currentUser.id }, { members: currentUser.id }] };
}

async function canAccessProject(currentUser: CurrentUser, pdfUrl: string | RegExp) {
  return Boolean(await Project.exists({ pdfUrl, ...projectAccessFilter(currentUser) }));
}

async function canAccessVoice(currentUser: CurrentUser, blobUrl: string | RegExp) {
  const voiceNote = await VoiceNote.findOne({ blobUrl }).select('projectId').lean();
  return Boolean(voiceNote && await hasProjectAccess(currentUser, voiceNote.projectId.toString()));
}

async function canAccessBroadcast(currentUser: CurrentUser, broadcastContent: string | RegExp) {
  const broadcastOwner = await User.findOne({
    role: 'supervisor',
    broadcastType: 'audio',
    broadcastContent,
  }).select('_id').lean();

  if (!broadcastOwner) return false;
  if (currentUser.role === 'admin' || currentUser.id === broadcastOwner._id.toString()) return true;

  return currentUser.role === 'student' && Boolean(await User.exists({
    _id: currentUser.id,
    supervisorId: broadcastOwner._id,
  }));
}

async function canAccessLegacyStoredObject(currentUser: CurrentUser, key: string) {
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

export async function canAccessStoredObject(currentUser: CurrentUser, key: string) {
  switch (getStorageObjectKind(key)) {
    case 'proposal':
      return canAccessProject(currentUser, key);
    case 'voice':
      return canAccessVoice(currentUser, key);
    case 'broadcast':
      return canAccessBroadcast(currentUser, key);
    default:
      return canAccessLegacyStoredObject(currentUser, key);
  }
}
