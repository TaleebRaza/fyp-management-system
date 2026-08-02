import { ClientSession } from 'mongoose';

import Project from '../models/Project';
import { createInviteCode } from './security/inviteCode';

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
