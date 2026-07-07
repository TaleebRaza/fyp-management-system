import RateLimit from '../models/RateLimit';

type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  maxRequests: number;
};

function normalizeRateLimitIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export async function consumeRateLimit(identifier: string, maxRequests: number): Promise<RateLimitResult> {
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);

  if (!normalizedIdentifier) {
    throw new Error('Rate limit identifier is required.');
  }

  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('Rate limit maxRequests must be a positive integer.');
  }

  const record = await RateLimit.findOneAndUpdate(
    { identifier: normalizedIdentifier },
    {
      $inc: { count: 1 },
      $setOnInsert: { createdAt: new Date() },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const count = typeof record.count === 'number' ? record.count : 0;

  return {
    allowed: count <= maxRequests,
    count,
    remaining: Math.max(maxRequests - count, 0),
    maxRequests,
  };
}

export async function refundRateLimit(identifier: string) {
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);

  if (!normalizedIdentifier) return;

  await RateLimit.updateOne(
    {
      identifier: normalizedIdentifier,
      count: { $gt: 0 },
    },
    {
      $inc: { count: -1 },
    }
  );
}