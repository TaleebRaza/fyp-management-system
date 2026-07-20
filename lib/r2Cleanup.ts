export type R2DeletionTarget = {
  key: string;
  size: number;
};

export function normalizeR2ObjectKey(value: unknown) {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';

  try {
    const parsedUrl = new URL(trimmedValue);
    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch {
    return trimmedValue.replace(/^\/+/, '');
  }
}

export function toR2DeletionTarget(value: unknown, size: unknown): R2DeletionTarget | null {
  const key = normalizeR2ObjectKey(value);
  if (!key) return null;

  return { key, size: Math.max(Number(size || 0), 0) };
}

export function dedupeR2DeletionTargets(targets: R2DeletionTarget[]) {
  const deduped = new Map<string, R2DeletionTarget>();

  for (const target of targets) {
    const existing = deduped.get(target.key);
    deduped.set(target.key, { key: target.key, size: Math.max(existing?.size || 0, target.size) });
  }

  return [...deduped.values()];
}
