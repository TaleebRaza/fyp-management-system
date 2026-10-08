import User from '../models/User';

// Two server-side updates in one request; no student records are loaded.
export function clearStudentFines(eraseHistory: boolean) {
  const outstanding = { $nin: ['resolved', 'waived'] };
  return User.bulkWrite([
    { updateMany: {
      filter: { role: 'student', ...(eraseHistory
        ? { $or: ['lateRegistrationFine', 'lateRegistrationDays', 'lateRegistrationFineStatus', 'lateRegistrationFineResolvedAt'].map((field) => ({ [field]: { $exists: true } })) }
        : { lateRegistrationFine: { $gt: 0 }, lateRegistrationFineStatus: outstanding }) },
      update: eraseHistory
        ? { $unset: { lateRegistrationDays: '', lateRegistrationFine: '', lateRegistrationFineStatus: '', lateRegistrationFineResolvedAt: '' } }
        : { $set: { lateRegistrationFineStatus: 'waived', lateRegistrationFineResolvedAt: null } },
      timestamps: false,
    } },
    { updateMany: {
      filter: { role: 'student', 'registrationPunishment.category': 'fine', ...(eraseHistory
        ? {} : { 'registrationPunishment.active': true, 'registrationPunishment.amount': { $gt: 0 }, 'registrationPunishment.status': outstanding }) },
      update: eraseHistory
        ? { $unset: { registrationPunishment: '' } }
        : { $set: { 'registrationPunishment.status': 'waived', 'registrationPunishment.resolvedAt': null } },
      timestamps: false,
    } },
  ]);
}
