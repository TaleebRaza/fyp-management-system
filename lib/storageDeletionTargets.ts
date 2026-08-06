import { normalizeStorageKey } from './storageValidation';

type StorageSource = {
  key: unknown;
  bytes: unknown;
};

export function collectStorageDeletionTargets(sources: StorageSource[]) {
  const targets = new Map<string, number>();

  for (const source of sources) {
    const key = normalizeStorageKey(typeof source.key === 'string' ? source.key : null);
    if (!key) continue;

    const numericBytes = Number(source.bytes);
    const bytes = Number.isSafeInteger(numericBytes) && numericBytes > 0 ? numericBytes : 0;
    targets.set(key, Math.max(targets.get(key) ?? 0, bytes));
  }

  return Array.from(targets, ([key, bytes]) => ({ key, bytes }));
}
