import assert from 'node:assert/strict';
import test from 'node:test';
import { BSON } from 'bson';
import { commandName, maximumPerSecond } from './support/free-tier-mongo-proxy.mjs';

test('free-tier proxy identifies real OP_MSG commands and counts rolling windows', () => {
  const body = BSON.serialize({ find: 'users', filter: {} });
  const packet = Buffer.alloc(21 + body.length);
  packet.writeInt32LE(packet.length, 0);
  packet.writeInt32LE(2013, 12);
  body.copy(packet, 21);
  assert.equal(commandName(packet), 'find');
  packet.writeInt32LE(2012, 12);
  assert.throws(() => commandName(packet), /Compressed/);
  assert.equal(maximumPerSecond([]), 0);
  assert.equal(maximumPerSecond([0, 999, 1000, 1001]), 3);
  assert.equal(maximumPerSecond(Array.from({ length: 300 }, (_, i) => i * 10)), 100);
});
