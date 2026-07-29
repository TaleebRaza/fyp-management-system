import RateLimit from '../models/RateLimit';
import { createHash } from 'node:crypto';

type HeaderSource = Pick<Headers, 'get'>;

type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  maxRequests: number;
};

function normalizeRateLimitIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export function hashRateLimitIdentifier(identifier: string) {
  return createHash('sha256').update(normalizeRateLimitIdentifier(identifier)).digest('hex');
}

export function getTrustedClientIp(headers: HeaderSource) {
  return headers.get('x-vercel-forwarded-for')
    || headers.get('x-real-ip')
    || 'unknown';
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

export async function consumeRateLimitDimensions(
  scope: string,
  accountIdentifier: string,
  headers: HeaderSource,
  maxRequests: number
) {
  const accountKey = `${scope}:account:${hashRateLimitIdentifier(accountIdentifier)}`;
  const ipKey = `${scope}:ip:${hashRateLimitIdentifier(getTrustedClientIp(headers))}`;
  const [account, ip] = await Promise.all([
    consumeRateLimit(accountKey, maxRequests),
    consumeRateLimit(ipKey, maxRequests),
  ]);

  return {
    allowed: account.allowed && ip.allowed,
    account,
    ip,
  };
}
