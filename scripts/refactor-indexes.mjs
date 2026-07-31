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
  ],
  systemconfigs: [
    { key: { configKey: 1 }, options: { unique: true } },
  ],
  finetypes: [
    { key: { code: 1 }, options: { unique: true } },
    { key: { category: 1, active: 1 } },
  ],
  finepolicies: [
    { key: { fineTypeId: 1, version: 1 }, options: { unique: true } },
    { key: { trigger: 1, status: 1, submissionStage: 1, effectiveFrom: -1 } },
  ],
  studentfines: [
    { key: { deduplicationKey: 1 }, options: { unique: true } },
    { key: { studentId: 1, status: 1, updatedAt: -1 } },
    { key: { projectId: 1, status: 1 } },
    { key: { fineTypeId: 1, policyVersion: 1, projectStage: 1 } },
  ],
  finerestrictionrules: [
    { key: { active: 1, scope: 1, fineTypeId: 1, studentId: 1, projectId: 1 } },
  ],
  fineaudits: [
    { key: { entityType: 1, entityId: 1, createdAt: -1 } },
    { key: { actorId: 1, createdAt: -1 } },
  ],
  finepayments: [
    { key: { studentId: 1, idempotencyKey: 1 }, options: { unique: true } },
    { key: { status: 1, createdAt: -1 } },
    { key: { fineIds: 1, createdAt: -1 } },
  ],
};
