import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../mongodb';
import Project from '../../models/Project';
import User from '../../models/User';
import { isSameOriginMutation } from './origin';
import { getStudentFineLoginMode } from '../dynamicFineRestriction';

export type UserRole = 'admin' | 'supervisor' | 'student';

export type CurrentUser = {
  id: string;
  role: UserRole;
};

type CurrentUserOptions = {
  allowPaymentOnly?: boolean;
};

const USER_ROLES: UserRole[] = ['admin', 'supervisor', 'student'];

export async function requireCurrentUser(
  req: NextRequest,
  allowedRoles?: UserRole[],
  options?: CurrentUserOptions
): Promise<CurrentUser | null> {
  if (!isSameOriginMutation(req)) return null;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || typeof token.id !== 'string' || !mongoose.Types.ObjectId.isValid(token.id)) {
    return null;
  }

  await connectToDatabase();
  const user = await User.findOne({ _id: token.id, isActive: true })
    .select('_id role')
    .lean();

  if (!user || !USER_ROLES.includes(user.role as UserRole)) return null;

  if (user.role === 'student') {
    const loginMode = await getStudentFineLoginMode(String(user._id));
    if (loginMode === 'complete-lock') return null;
    if (loginMode === 'payment-only' && options?.allowPaymentOnly !== true) return null;
  }

  const currentUser = { id: user._id.toString(), role: user.role as UserRole };
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
