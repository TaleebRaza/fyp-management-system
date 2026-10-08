import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const { calculateLateRegistrationFine } = await importTypeScriptModuleWithDependencies('lib/lateRegistrationFine.ts');
const { buildRegistrationPunishmentSnapshot, serializeRegistrationPolicy } = await importTypeScriptModuleWithDependencies('lib/registrationPolicy.ts');

test('registration fine switch defaults on and stops both monetary fine sources', () => {
  assert.equal(serializeRegistrationPolicy({}).lateFineAccrual.enabled, true);
  const policy = serializeRegistrationPolicy({
    lateFineAccrual: { enabled: false, paused: true, frozenAmount: 500 },
    punishment: { enabled: true, category: 'fine', amount: 300 },
  });
  assert.deepEqual(calculateLateRegistrationFine(new Date(), policy.lateFineAccrual), { daysLate: 0, fineAmount: 0 });
  assert.equal(buildRegistrationPunishmentSnapshot(policy).active, false);
  policy.punishment.category = 'other';
  assert.equal(buildRegistrationPunishmentSnapshot(policy).active, true);
  policy.lateFineAccrual.enabled = true;
  assert.equal(calculateLateRegistrationFine(new Date(), policy.lateFineAccrual).fineAmount, 500);
});

test('bulk fine resets preserve unrelated data and paid history unless erased', {
  skip: !process.env.FINE_HELPERS_TEST_MONGODB_URI && 'Set FINE_HELPERS_TEST_MONGODB_URI to local database fyp_fine_helpers_test.',
}, async () => {
  const uri = process.env.FINE_HELPERS_TEST_MONGODB_URI;
  const url = new URL(uri);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/fyp_fine_helpers_test');
  const { default: mongoose } = await import('mongoose');
  const { default: User } = await importTypeScriptModuleWithDependencies('models/User.ts');
  const { clearStudentFines } = await importTypeScriptModuleWithDependencies('lib/clearStudentFines.ts');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    const records = ['pending', 'resolved', 'waived'].map((status, i) => ({
      name: `Student ${i}`, rollNo: `fine-test-${i}`, password: 'unchanged', role: 'student',
      isActive: i !== 0, lateRegistrationFine: 500, lateRegistrationFineStatus: status,
      lateRegistrationFineResolvedAt: status === 'resolved' ? new Date() : null,
      registrationPunishment: { active: true, category: i === 2 ? 'other' : 'fine', amount: 300, status },
      remarks: 'preserve',
    }));
    await User.collection.insertMany([...records, { ...records[0], rollNo: 'fine-admin', role: 'admin' }]);
    const before = await User.collection.find({}).toArray();
    await clearStudentFines(false);
    const waived = await User.collection.find({}).toArray();
    assert.equal(waived[0].lateRegistrationFineStatus, 'waived');
    assert.equal(waived[0].registrationPunishment.status, 'waived');
    assert.deepEqual(waived.slice(1), before.slice(1));
    await clearStudentFines(true);
    const after = await User.collection.find({}).toArray();
    for (let i = 0; i < 3; i++) {
      const expected = { ...before[i] };
      for (const field of ['lateRegistrationDays', 'lateRegistrationFine', 'lateRegistrationFineStatus', 'lateRegistrationFineResolvedAt']) delete expected[field];
      if (expected.registrationPunishment.category === 'fine') delete expected.registrationPunishment;
      assert.deepEqual(after[i], expected);
    }
    assert.deepEqual(after[3], before[3]);
    await User.collection.insertMany(Array.from({ length: 1500 }, (_, i) => ({
      name: `Load student ${i}`, rollNo: `fine-load-${i}`, role: 'student', password: 'unchanged',
    })));
    const times = [];
    for (let i = 0; i < 30; i++) {
      await User.collection.updateMany({ role: 'student' }, { $set: { lateRegistrationFine: 500, lateRegistrationFineStatus: 'pending' } });
      const start = performance.now();
      await clearStudentFines(true);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(`Fine helper, 1,503 local students: p50=${times[15].toFixed(1)}ms p95=${times[28].toFixed(1)}ms (database operation only)`);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
