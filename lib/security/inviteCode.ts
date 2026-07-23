import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createInviteCode(length = 6) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}
