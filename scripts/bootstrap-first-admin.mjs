import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const ROLL_NO_PATTERN = /^[FS]\d{2}-\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;

class BootstrapValidationError extends Error {}

function requiredText(value, maximum, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) throw new BootstrapValidationError(`${name} is invalid.`);
  return text;
}

function parseInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BootstrapValidationError('Bootstrap input is invalid.');
  }
  const administrator = value.administrator;
  if (!administrator || typeof administrator !== 'object' || Array.isArray(administrator)) {
    throw new BootstrapValidationError('Administrator details are invalid.');
  }
  const email = requiredText(administrator.email, 254, 'Administrator email').toLowerCase();
  const rollNo = requiredText(administrator.rollNo, 40, 'Administrator roll number').toUpperCase();
  const password = typeof administrator.password === 'string' ? administrator.password : '';
  const primaryColor = requiredText(value.primaryColor, 7, 'Primary color').toLowerCase();
  const accentColor = requiredText(value.accentColor, 7, 'Accent color').toLowerCase();
  if (!EMAIL_PATTERN.test(email) || !ROLL_NO_PATTERN.test(rollNo) || password.length < 10 || password.length > 128 || !COLOR_PATTERN.test(primaryColor) || !COLOR_PATTERN.test(accentColor)) {
    throw new BootstrapValidationError('Bootstrap details are invalid.');
  }
  return {
    universityName: requiredText(value.universityName, 120, 'University name'),
    primaryColor,
    accentColor,
    administrator: {
      name: requiredText(administrator.name, 100, 'Administrator name'),
      email,
      rollNo,
      password,
    },
  };
}

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16 * 1024) throw new BootstrapValidationError('Bootstrap input is too large.');
  }
  try {
    return parseInput(JSON.parse(input));
  } catch (error) {
    if (error instanceof BootstrapValidationError) throw error;
    throw new BootstrapValidationError('Bootstrap input is invalid.');
  }
}

async function bootstrap(input) {
  const database = mongoose.connection.db;
  if (!database) throw new Error('Database connection is unavailable.');
  const users = database.collection('users');
  const configs = database.collection('systemconfigs');

  await Promise.all([
    configs.createIndex({ configKey: 1 }, { unique: true }),
    users.createIndex({ rollNo: 1 }, { unique: true }),
    users.createIndex({ email: 1 }, { unique: true, sparse: true }),
  ]);

  const passwordHash = await bcrypt.hash(input.administrator.password, 10);
  const session = await mongoose.startSession();
  let status = 'already_bootstrapped';

  try {
    await session.withTransaction(async () => {
      const bootstrapRecord = await configs.findOne({ configKey: 'bootstrap' }, { session });
      if (bootstrapRecord) {
        const administrator = await users.findOne(
          { _id: bootstrapRecord.bootstrapAdministratorId, role: 'admin' },
          { session }
        );
        if (!administrator) throw new Error('Existing bootstrap record is invalid.');
        return;
      }

      if (await users.findOne({ role: 'admin' }, { session })) {
        throw new Error('An administrator already exists; refusing a new bootstrap.');
      }
      if (await users.findOne({ $or: [{ rollNo: input.administrator.rollNo }, { email: input.administrator.email }] }, { session })) {
        throw new Error('Administrator roll number or email is already in use.');
      }

      const now = new Date();
      const administrator = {
        _id: new mongoose.Types.ObjectId(),
        name: input.administrator.name,
        email: input.administrator.email,
        rollNo: input.administrator.rollNo,
        password: passwordHash,
        role: 'admin',
        semester: '7th Semester',
        notificationsEnabled: true,
        extraSlots: 0,
        occupiedSlots: 0,
        isActive: true,
        monthlyLoginCount: 0,
        lastLoginMonth: '',
        createdAt: now,
        updatedAt: now,
      };

      await configs.updateOne(
        { configKey: 'branding' },
        {
          $setOnInsert: {
            configKey: 'branding',
            universityName: input.universityName,
            primaryColor: input.primaryColor,
            accentColor: input.accentColor,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, session }
      );
      await users.insertOne(administrator, { session });
      await configs.insertOne({
        configKey: 'bootstrap',
        bootstrapAdministratorId: administrator._id,
        bootstrapCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      }, { session });
      status = 'created';
    });
  } finally {
    await session.endSession();
  }
  return status;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new BootstrapValidationError('MONGODB_URI is required.');
  const input = await readInput();
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  const status = await bootstrap(input);
  process.stdout.write(`${JSON.stringify({ bootstrap: status })}\n`);
}

try {
  await main();
} catch (error) {
  if (error instanceof BootstrapValidationError) {
    console.error(error.message);
  } else {
    console.error('bootstrap_failed');
  }
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
