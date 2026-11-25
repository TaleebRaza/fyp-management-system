export class WorkBusyError extends Error {
  readonly statusCode = 503;
  constructor() {
    super('The portal is busy. Please try again shortly.');
  }
}

// Hand the active slot directly to the oldest waiter so new arrivals cannot jump the queue.
export function createWorkAdmission(width: number, maxWaiting = 16, waitMs = 5000) {
  let active = 0;
  const waiting = new Set<() => void>();
  function release() {
    const next = waiting.values().next().value;
    if (next) {
      waiting.delete(next);
      next();
    } else {
      active--;
    }
  }

  return async function acquire() {
    if (active < width) {
      active++;
    } else {
      if (waiting.size >= maxWaiting) throw new WorkBusyError();
      await new Promise<void>((resolve, reject) => {
        const admit = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          waiting.delete(admit);
          reject(new WorkBusyError());
        }, waitMs);
        waiting.add(admit);
      });
    }
    return release;
  };
}

// shortcut: limits apply within one process, revisit if mixed-load measurements show cross-instance contention.
const processState = globalThis as typeof globalThis & {
  portalWorkAdmission?: {
    password: ReturnType<typeof createWorkAdmission>;
    proposal: ReturnType<typeof createWorkAdmission>;
    reset: ReturnType<typeof createWorkAdmission>;
  };
};
export const workAdmission = processState.portalWorkAdmission ??= {
  password: createWorkAdmission(1),
  proposal: createWorkAdmission(4),
  reset: createWorkAdmission(1),
};

export function isCheckoutTimeout(error: unknown) {
  return error instanceof Error && error.name === 'MongoWaitQueueTimeoutError';
}
