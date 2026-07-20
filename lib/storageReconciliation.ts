import { dedupeR2DeletionTargets, toR2DeletionTarget, type R2DeletionTarget } from './r2Cleanup';

export type StorageReference = {
  key: unknown;
  size: unknown;
};

export type StorageObject = {
  key: unknown;
  size: unknown;
};

export function reconcileStorage(
  usedBytes: unknown,
  references: StorageReference[],
  objects: StorageObject[]
) {
  const referenceTargets = dedupeR2DeletionTargets(
    references
      .map(reference => toR2DeletionTarget(reference.key, reference.size))
      .filter(Boolean) as R2DeletionTarget[]
  );
  const objectTargets = dedupeR2DeletionTargets(
    objects
      .map(object => toR2DeletionTarget(object.key, object.size))
      .filter(Boolean) as R2DeletionTarget[]
  );
  const objectsByKey = new Map(objectTargets.map(target => [target.key, target]));
  const referencesByKey = new Map(referenceTargets.map(target => [target.key, target]));
  const ledgerBytes = Math.max(Number(usedBytes || 0), 0);
  const referencedBytes = referenceTargets.reduce((sum, target) => sum + target.size, 0);
  const objectBytes = objectTargets.reduce((sum, target) => sum + target.size, 0);

  return {
    ledgerBytes,
    referencedBytes,
    objectBytes,
    ledgerVsReferences: ledgerBytes - referencedBytes,
    ledgerVsObjects: ledgerBytes - objectBytes,
    referenceCount: referenceTargets.length,
    objectCount: objectTargets.length,
    duplicateReferenceCount: Math.max(references.length - referenceTargets.length, 0),
    missingObjectKeys: referenceTargets
      .filter(target => !objectsByKey.has(target.key))
      .map(target => target.key),
    unreferencedObjectKeys: objectTargets
      .filter(target => !referencesByKey.has(target.key))
      .map(target => target.key),
    sizeMismatches: referenceTargets.flatMap(reference => {
      const object = objectsByKey.get(reference.key);
      return object && object.size !== reference.size
        ? [{ key: reference.key, referenceBytes: reference.size, objectBytes: object.size }]
        : [];
    }),
  };
}
