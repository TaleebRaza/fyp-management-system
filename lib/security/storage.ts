import Project from '../../models/Project';
import User from '../../models/User';
import { CurrentUser, hasProjectAccess } from './auth';
import { isMessageForStaff } from '../studentMessageDirection';
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

async function canAccessStudentMessage(currentUser: CurrentUser, studentMessageContent: string) {
  const student = await User.findOne({
    role: 'student',
    studentMessageType: 'audio',
    studentMessageContent,
  }).select('_id studentMessageId').lean();

  if (!student) return false;
  if (currentUser.role === 'admin' || currentUser.id === student._id.toString()) return true;
  if (
    currentUser.role !== 'supervisor'
    || !isMessageForStaff(student.studentMessageId, 'supervisor', currentUser.id)
  ) return false;

  return Boolean(await Project.exists({
    supervisorId: currentUser.id,
    members: student._id,
  }));
}

async function canAccessLegacyStoredObject(currentUser: CurrentUser, key: string) {
  const matcher = keyMatcher(key);
  const [project, broadcastOwner] = await Promise.all([
    Project.findOne({ $or: [{ pdfUrl: key }, { pdfUrl: matcher }] }).select('_id').lean(),
    User.findOne({
      role: 'supervisor',
      broadcastType: 'audio',
      $or: [{ broadcastContent: key }, { broadcastContent: matcher }],
    }).select('_id').lean(),
  ]);

  if (project) return hasProjectAccess(currentUser, project._id.toString());
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
    case 'broadcast':
      return canAccessBroadcast(currentUser, key);
    case 'student-message':
      return canAccessStudentMessage(currentUser, key);
    default:
      return canAccessLegacyStoredObject(currentUser, key);
  }
}
