import { randomInt } from 'node:crypto';
import type { ClientSession } from 'mongoose';

import Project from '../models/Project';

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createInviteCode(length = 6) {
  return Array.from(
    { length },
    () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]
  ).join('');
}

export async function createProjectWithUniqueInviteCode(
  projectData: Record<string, unknown>,
  session: ClientSession
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const project = new Project({ ...projectData, inviteCode: createInviteCode() });
      await project.save({ session });
      return project;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}
