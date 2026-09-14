import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
  return true;
}

loadEnvFile(path.join(process.cwd(), '.env.local')) ||
  loadEnvFile(path.join(process.cwd(), '.env'));

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI not found in .env.local or .env');

const apply = process.argv.includes('--apply');
if (apply && process.env.CONFIRM_ORPHAN_MEMBER_CLEANUP !== 'stage15-orphans') {
  throw new Error('Refusing to apply without CONFIRM_ORPHAN_MEMBER_CLEANUP=stage15-orphans');
}

const EXPECTED = [
  { projectId: '6a3ceea794d41c580cee5e38', missingMemberId: '6a3cd2cf5807cd7168a9a6fc' },
  { projectId: '6a50b493500f7c665aaf744a', missingMemberId: '6a50b493500f7c665aaf7449' },
];

await mongoose.connect(uri);
try {
  const projects = mongoose.connection.collection('projects');
  const users = mongoose.connection.collection('users');
  const plans = [];
  const conflicts = [];

  for (const item of EXPECTED) {
    const projectId = new mongoose.Types.ObjectId(item.projectId);
    const missingMemberId = new mongoose.Types.ObjectId(item.missingMemberId);
    const project = await projects.findOne({ _id: projectId });

    if (!project) {
      conflicts.push({ ...item, reason: 'project no longer exists' });
      continue;
    }

    const memberIds = Array.isArray(project.members) ? project.members : [];
    if (!memberIds.some((id) => String(id) === item.missingMemberId)) {
      plans.push({ ...item, action: 'already-clean' });
      continue;
    }

    const unexpectedUser = await users.findOne({ _id: missingMemberId });
    if (unexpectedUser) {
      conflicts.push({ ...item, reason: 'member user now exists; refusing to remove' });
      continue;
    }

    const existingUsers = await users.find(
      { _id: { $in: memberIds } },
      { projection: { _id: 1 } }
    ).toArray();
    const existingIds = new Set(existingUsers.map((user) => String(user._id)));
    const validRemaining = memberIds.filter(
      (id) => String(id) !== item.missingMemberId && existingIds.has(String(id))
    );

    if (validRemaining.length === 0) {
      conflicts.push({
        ...item,
        reason: 'removing the orphan would leave the project with no valid members',
        projectTitle: project.title || '',
      });
      continue;
    }

    plans.push({
      ...item,
      action: 'remove-orphan-member',
      validMembersAfter: validRemaining.map(String),
    });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    plans,
    conflicts,
  }, null, 2));

  if (conflicts.length > 0) {
    process.exitCode = 2;
  } else if (apply) {
    for (const plan of plans) {
      if (plan.action !== 'remove-orphan-member') continue;
      await projects.updateOne(
        { _id: new mongoose.Types.ObjectId(plan.projectId) },
        { $pull: { members: new mongoose.Types.ObjectId(plan.missingMemberId) } }
      );
    }
    console.log('Orphan member cleanup applied.');
  }
} finally {
  await mongoose.disconnect();
}
