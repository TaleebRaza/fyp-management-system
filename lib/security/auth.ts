import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../mongodb';
import Project from '../../models/Project';
import User from '../../models/User';
import { isSameOriginMutation } from './origin';
import { isVivaSessionAccessRestricted } from '../vivaAccessRestriction';
import { getPortalPause } from '../portalPause';

export type UserRole = 'admin' | 'supervisor' | 'student';

type CurrentUserBase = {
  id: string;
  role: UserRole;
  name: string;
  rollNo: string;
};

export type CurrentUser<ExtraFields extends object = Record<never, never>> =
  CurrentUserBase & ExtraFields;

const USER_ROLES: UserRole[] = ['admin', 'supervisor', 'student'];

export async function getCurrentUser<ExtraFields extends object = Record<never, never>>(
  req: NextRequest,
  extraProjection?: string
): Promise<CurrentUser<ExtraFields> | null> {
  if (!isSameOriginMutation(req)) return null;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || typeof token.id !== 'string' || !mongoose.Types.ObjectId.isValid(token.id)) {
    return null;
  }

  await connectToDatabase();
  const query = User.findOne({ _id: token.id, isActive: true })
    .select('_id role name rollNo sessionVersion');
  if (extraProjection) query.select(extraProjection);
  const user = await query.lean();

  if (!user || !USER_ROLES.includes(user.role as UserRole)) return null;

  const { _id, role, name, rollNo, sessionVersion, ...extraFields } =
    user as unknown as Record<string, unknown>;
  if (Number(token.sessionVersion ?? 0) !== Number(sessionVersion ?? 0)) return null;
  return {
    ...extraFields,
    id: String(_id),
    role: role as UserRole,
    name: String(name || '').trim(),
    rollNo: String(rollNo || '').trim(),
  } as CurrentUser<ExtraFields>;
}

export async function requireCurrentUser<ExtraFields extends object = Record<never, never>>(
  req: NextRequest,
  allowedRoles?: UserRole[],
  extraProjection?: string
): Promise<CurrentUser<ExtraFields> | null> {
  const currentUser = await getCurrentUser<ExtraFields>(req, extraProjection);
  if (!currentUser) return null;

  const [portal, vivaAccessRestricted] = await Promise.all([
    currentUser.role === 'admin' ? Promise.resolve(null) : getPortalPause(),
    isVivaSessionAccessRestricted(currentUser.id),
  ]);
  if (portal?.paused || vivaAccessRestricted) return null;

  return !allowedRoles || allowedRoles.includes(currentUser.role) ? currentUser : null;
}

export async function hasProjectAccess(currentUser: CurrentUser, projectId: string) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return false;

  const query = currentUser.role === 'admin'
    ? { _id: projectId }
    : {
        _id: projectId,
        $or: [{ supervisorId: currentUser.id }, { members: currentUser.id }],
      };

  return Boolean(await Project.exists(query));
}
