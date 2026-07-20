import { describe, expect, it } from 'vitest';

import {
  dedupeR2DeletionTargets,
  normalizeR2ObjectKey,
  toR2DeletionTarget,
} from '../lib/r2Cleanup';
import { reconcileStorage } from '../lib/storageReconciliation';

describe('R2 cleanup targets', () => {
  it('normalizes stored URLs and bare keys without changing their key path', () => {
    expect(normalizeR2ObjectKey(' https://bucket.example/proposals/My%20File.pdf ')).toBe(
      'proposals/My File.pdf'
    );
    expect(normalizeR2ObjectKey('/voicenotes/note.webm')).toBe('voicenotes/note.webm');
    expect(normalizeR2ObjectKey('')).toBe('');
  });

  it('drops empty targets, clamps invalid sizes, and refunds a duplicate key once', () => {
    expect(toR2DeletionTarget('', 10)).toBeNull();
    expect(toR2DeletionTarget('proposal.pdf', -10)).toEqual({ key: 'proposal.pdf', size: 0 });
    expect(
      dedupeR2DeletionTargets([
        { key: 'proposal.pdf', size: 20 },
        { key: 'proposal.pdf', size: 100 },
        { key: 'voice.webm', size: 10 },
      ])
    ).toEqual([
      { key: 'proposal.pdf', size: 100 },
      { key: 'voice.webm', size: 10 },
    ]);
  });
});

describe('storage reconciliation', () => {
  it('reports ledger drift, missing references, unreferenced objects, and size mismatches without mutating data', () => {
    expect(
      reconcileStorage(
        150,
        [
          { key: 'https://bucket.example/proposal.pdf', size: 100 },
          { key: 'proposal.pdf', size: 100 },
          { key: 'voice.webm', size: 20 },
          { key: 'missing.webm', size: 10 },
        ],
        [
          { key: 'proposal.pdf', size: 120 },
          { key: 'orphan.webm', size: 30 },
          { key: 'voice.webm', size: 20 },
        ]
      )
    ).toEqual({
      ledgerBytes: 150,
      referencedBytes: 130,
      objectBytes: 170,
      ledgerVsReferences: 20,
      ledgerVsObjects: -20,
      referenceCount: 3,
      objectCount: 3,
      duplicateReferenceCount: 1,
      missingObjectKeys: ['missing.webm'],
      unreferencedObjectKeys: ['orphan.webm'],
      sizeMismatches: [{ key: 'proposal.pdf', referenceBytes: 100, objectBytes: 120 }],
    });
  });
});
