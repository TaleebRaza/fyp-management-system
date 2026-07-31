import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('registration validates roll numbers and atomically claims each normalized value', async () => {
  const routeSource = await readFile(
    new URL('../app/api/register/route.ts', import.meta.url),
    'utf8'
  );
  const claimSource = await readFile(
    new URL('../models/RollNumberClaim.ts', import.meta.url),
    'utf8'
  );

  assert.match(routeSource, /isValidRollNo\(normalizedRollNo\)/);
  assert.match(routeSource, /buildRollNoRegex\(normalizedRollNo\)/);
  assert.match(routeSource, /RollNumberClaim\.create\(/);
  assert.match(routeSource, /newStudent\._id/);
  assert.match(claimSource, /_id: \{ type: String, required: true \}/);
  assert.match(claimSource, /collection: 'roll_number_claims'/);
});
