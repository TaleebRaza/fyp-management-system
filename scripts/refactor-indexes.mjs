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
  ],
  storagedeletionoutboxes: [
    { key: { state: 1, nextAttemptAt: 1, _id: 1 } },
    { key: { state: 1, lockedUntil: 1, _id: 1 } },
    { key: { state: 1, deadLetteredAt: 1, _id: 1 } },
  ],
  emailoutboxes: [
    { key: { state: 1, nextAttemptAt: 1, _id: 1 } },
    { key: { state: 1, lockedUntil: 1, _id: 1 } },
    { key: { state: 1, deadLetteredAt: 1, _id: 1 } },
  ],
};
