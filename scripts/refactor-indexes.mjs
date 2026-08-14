export const refactorIndexes = {
  projects: [
    { key: { supervisorId: 1 } },
    {
      key: { pdfUrl: 1 },
      options: { partialFilterExpression: { pdfUrl: { $gt: '' } } },
    },
  ],
  voicenotes: [
    { key: { blobUrl: 1 }, options: { unique: true } },
    { key: { projectId: 1, createdAt: 1 } },
    { key: { projectId: 1, isPlayed: 1, playedAt: 1 } },
    { key: { createdAt: 1, _id: 1 } },
  ],
  users: [
    {
      key: { migrationCode: 1 },
      options: {
        unique: true,
        partialFilterExpression: { role: 'supervisor', migrationCode: { $gt: '' } },
      },
    },
    {
      key: { broadcastCreatedAt: 1 },
      options: {
        partialFilterExpression: {
          role: 'supervisor',
          broadcastType: 'audio',
          broadcastContent: { $type: 'string' },
        },
      },
    },
    {
      key: { role: 1, studentMessageCreatedAt: -1 },
      options: {
        partialFilterExpression: {
          role: 'student',
          studentMessageCreatedAt: { $type: 'date' },
        },
      },
    },
  ],
  storagedeletionoutboxes: [
    { key: { key: 1 }, options: { unique: true } },
    { key: { state: 1, nextAttemptAt: 1, _id: 1 } },
    { key: { state: 1, lockedUntil: 1, _id: 1 } },
    { key: { state: 1, deadLetteredAt: 1, _id: 1 } },
  ],
  emailoutboxes: [
    { key: { dedupeKey: 1 }, options: { unique: true } },
    { key: { state: 1, nextAttemptAt: 1, _id: 1 } },
    { key: { state: 1, lockedUntil: 1, _id: 1 } },
    { key: { state: 1, deadLetteredAt: 1, _id: 1 } },
  ],
  uploadreservations: [
    { key: { key: 1 }, options: { unique: true } },
    { key: { ownerId: 1, idempotencyKey: 1 }, options: { unique: true } },
    { key: { state: 1, expiresAt: 1, _id: 1 } },
    {
      key: { ownerId: 1, kind: 1 },
      options: {
        unique: true,
        partialFilterExpression: { kind: 'student-message', state: 'pending' },
      },
    },
  ],
  systemconfigs: [
    { key: { configKey: 1 }, options: { unique: true } },
  ],
};
