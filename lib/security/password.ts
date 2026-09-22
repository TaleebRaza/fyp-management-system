import bcrypt from 'bcryptjs';
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_PREFIX = '$scrypt$v1$';
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_BYTES = 32;

function deriveKey(password: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value) && value.length === 60;
}

export function isScryptHash(value: string) {
  return value.startsWith(SCRYPT_PREFIX);
}

export function validatePassword(value: string) {
  return value.length >= 10 && value.length <= 128;
}

export async function hashPassword(password: string) {
  if (!validatePassword(password)) throw new Error('Password does not meet the length policy.');

  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, SCRYPT_KEY_BYTES);

  return [
    '$scrypt',
    'v1',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

async function verifyScryptPassword(password: string, storedPassword: string) {
  const [, algorithm, version, cost, blockSize, parallelization, saltValue, keyValue] = storedPassword.split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltValue || !keyValue) return false;

  const parameters = [cost, blockSize, parallelization].map(Number);
  if (
    parameters.some((value) => !Number.isSafeInteger(value) || value < 1)
    || parameters[0] !== SCRYPT_COST
    || parameters[1] !== SCRYPT_BLOCK_SIZE
    || parameters[2] !== SCRYPT_PARALLELIZATION
  ) return false;

  const salt = Buffer.from(saltValue, 'base64url');
  const expectedKey = Buffer.from(keyValue, 'base64url');
  if (salt.length !== 16 || expectedKey.length !== SCRYPT_KEY_BYTES) return false;

  const actualKey = await deriveKey(password, salt, expectedKey.length);
  return timingSafeEqual(actualKey, expectedKey);
}

export async function verifyPassword(password: string, storedPassword: string) {
  if (isScryptHash(storedPassword)) {
    return { matches: await verifyScryptPassword(password, storedPassword), needsRehash: false };
  }
  if (isBcryptHash(storedPassword)) {
    if (bcrypt.truncates(password)) return { matches: false, needsRehash: false };
    const matches = await bcrypt.compare(password, storedPassword);
    return { matches, needsRehash: matches };
  }

  return { matches: false, needsRehash: false };
}
