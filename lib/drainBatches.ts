export async function drainBatches<T extends Record<string, number>>(
  run: () => Promise<T>,
  hasMore: (batch: T) => boolean,
  deadline: number
): Promise<T> {
  let total: T | undefined;
  do {
    const batch = await run();
    if (!total) total = { ...batch };
    else for (const key of Object.keys(batch) as (keyof T)[]) {
      total[key] = (/LagMs$|AgeMs$/.test(String(key))
        ? Math.max(total[key], batch[key])
        : total[key] + batch[key]) as T[keyof T];
    }
    if (!hasMore(batch)) break;
  } while (Date.now() < deadline);
  return total;
}
