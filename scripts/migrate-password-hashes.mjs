import { randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import mongoose from 'mongoose';

const scrypt = promisify(nodeScrypt);
const uri = process.env.MONGODB_URI;
const apply = process.argv.includes('--apply');

if (!uri) {
  console.error('MONGODB_URI is required. No password values were read.');
  process.exit(1);
}
if (apply && process.env.CONFIRM_PASSWORD_MIGRATION !== 'scrypt-v1') {
  console.error('Refusing to migrate. Set CONFIRM_PASSWORD_MIGRATION=scrypt-v1 and pass --apply.');
  process.exit(1);
}

function format(value) {
  if (/^\$scrypt\$v1\$/.test(value)) return 'scrypt';
  if (/^\$2[aby]\$\d{2}\$/.test(value) && value.length === 60) return 'bcrypt';
  if (!value.startsWith('$') && value.length >= 10 && value.length <= 128) return 'plaintext';
  return 'unknown';
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 32, {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `$scrypt$v1$32768$8$1$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

await mongoose.connect(uri);
try {
  const users = mongoose.connection.collection('users');
  const counts = { scrypt: 0, bcrypt: 0, plaintext: 0, unknown: 0 };
  const cursor = users.find({}, { projection: { password: 1 } });
  for await (const user of cursor) {
    const password = typeof user.password === 'string' ? user.password : '';
    const passwordFormat = format(password);
    counts[passwordFormat] += 1;
    if (apply && passwordFormat === 'plaintext') {
      await users.updateOne(
        { _id: user._id, password },
        { $set: { password: await hashPassword(password) }, $inc: { sessionVersion: 1 } }
      );
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'report', counts }, null, 2));
  if (!apply && (counts.plaintext > 0 || counts.unknown > 0)) process.exitCode = 2;
  if (apply && counts.unknown > 0) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
