import RateLimit from '../models/RateLimit';
import { createHash } from 'node:crypto';

type HeaderSource = Pick<Headers, 'get'>;

type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  maxRequests: number;
};

type LoginRateLimitStatus = {
  accountExceeded: boolean;
  ipExceeded: boolean;
};

function normalizeRateLimitIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export function hashRateLimitIdentifier(identifier: string) {
  return createHash('sha256').update(normalizeRateLimitIdentifier(identifier)).digest('hex');
}

export function getTrustedClientIp(headers: HeaderSource) {
  const vercelAddress = headers.get('x-vercel-forwarded-for')?.split(',', 1)[0]?.trim();
  if (vercelAddress) return vercelAddress;
  if (process.env.NODE_ENV !== 'production') {
    return headers.get('x-real-ip')?.trim() || 'local';
  }
  return null;
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
      returnDocument: 'after',
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

export async function getLoginRateLimitStatus(
  accountIdentifier: string,
  accountLimit: number,
  ipIdentifier: string | null,
  ipLimit: number
): Promise<LoginRateLimitStatus> {
  const accountKey = normalizeRateLimitIdentifier(accountIdentifier);
  const ipKey = ipIdentifier ? normalizeRateLimitIdentifier(ipIdentifier) : null;
  if (!accountKey) throw new Error('Rate limit identifier is required.');
  if (![accountLimit, ipLimit].every((limit) => Number.isInteger(limit) && limit > 0)) {
    throw new Error('Rate limit maxRequests must be a positive integer.');
  }

  const records = await RateLimit.find({
    identifier: { $in: ipKey ? [accountKey, ipKey] : [accountKey] },
  }).select('identifier count').lean<Array<{ identifier: string; count: number }>>();
  const counts = new Map(records.map((record) => [record.identifier, record.count]));

  return {
    accountExceeded: (counts.get(accountKey) || 0) >= accountLimit,
    ipExceeded: ipKey ? (counts.get(ipKey) || 0) >= ipLimit : false,
  };
}

export async function isRateLimitExceeded(identifier: string, maxRequests: number) {
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);
  if (!normalizedIdentifier) throw new Error('Rate limit identifier is required.');
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('Rate limit maxRequests must be a positive integer.');
  }
  return Boolean(await RateLimit.exists({
    identifier: normalizedIdentifier,
    count: { $gte: maxRequests },
  }));
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

export async function clearRateLimit(identifier: string) {
  const normalizedIdentifier = normalizeRateLimitIdentifier(identifier);
  if (!normalizedIdentifier) return;
  await RateLimit.deleteOne({ identifier: normalizedIdentifier });
}

export async function consumeRateLimitDimensions(
  scope: string,
  accountIdentifier: string,
  headers: HeaderSource,
  maxRequests: number
) {
  const accountKey = `${scope}:account:${hashRateLimitIdentifier(accountIdentifier)}`;
  const clientIp = getTrustedClientIp(headers);
  const [account, ip] = await Promise.all([
    consumeRateLimit(accountKey, maxRequests),
    clientIp
      ? consumeRateLimit(`${scope}:ip:${hashRateLimitIdentifier(clientIp)}`, maxRequests)
      : Promise.resolve(null),
  ]);

  return {
    allowed: account.allowed && (ip?.allowed ?? true),
    account,
    ip,
  };
}
