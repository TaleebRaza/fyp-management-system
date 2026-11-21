import { AsyncLocalStorage } from 'node:async_hooks';

export const testTimingsEnabled = process.env.FYP_TEST_TIMINGS === '1';

type Metric = { count: number; ms: number };
type Timings = { mongo: Metric; storage: Metric; smtp: Metric };
const shared = globalThis as typeof globalThis & { fypTestTimings?: AsyncLocalStorage<Timings> };
export const testTimings = shared.fypTestTimings ??= new AsyncLocalStorage<Timings>();

export function recordTestTiming(kind: keyof Timings, duration: number) {
  const metric = testTimings.getStore()?.[kind];
  if (!metric) return;
  metric.count++;
  metric.ms += duration;
}
