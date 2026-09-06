import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';

import EmailOutbox from '../models/EmailOutbox';
import { getBranding } from './branding';
import { isEmailConfigured, sendNotificationEmail } from './mailer';
import { isValidEmailAddress, normalizeEmailAddress } from './security/input';
import { getBrandingEmailName } from '../types/branding';

const MAX_EMAIL_ATTEMPTS = 8;
const MAX_BATCH_SIZE = 100;
const WORKER_LEASE_MS = 5 * 60 * 1000;

type EmailTarget = {
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function retryDelay(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts, 8)));
}

function validateEmailTarget(target: EmailTarget) {
  if (
    !target.dedupeKey || target.dedupeKey.length > 200
    || !isValidEmailAddress(target.to)
    || !target.subject.trim() || target.subject.length > 200
    || !target.html.trim() || target.html.length > 100_000
    || (target.text && target.text.length > 20_000)
  ) {
    throw new Error('Invalid email outbox target.');
  }
}

export async function enqueueNotificationEmail(target: EmailTarget, session: ClientSession) {
  validateEmailTarget(target);

  await EmailOutbox.findOneAndUpdate(
    { dedupeKey: target.dedupeKey },
    {
      $setOnInsert: {
        to: normalizeEmailAddress(target.to),
        subject: target.subject.trim(),
        html: target.html,
        text: target.text?.trim() || '',
        state: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedUntil: null,
        lockToken: null,
        lastErrorCode: '',
        sentAt: null,
        deadLetteredAt: null,
      },
    },
    { upsert: true, session }
  );
}

export async function processEmailOutbox(limit = 25) {
  const batchSize = Math.min(Math.max(Math.trunc(limit), 1), MAX_BATCH_SIZE);
  let fromName: string | undefined;
  let claimed = 0;
  let sent = 0;
  let retried = 0;
  let deadLettered = 0;
  let maxJobLagMs = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const now = new Date();
    const lockToken = randomUUID();
    const target = await EmailOutbox.findOneAndUpdate(
      {
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: now } },
          { state: 'processing', lockedUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          state: 'processing',
          lockedUntil: new Date(now.getTime() + WORKER_LEASE_MS),
          lockToken,
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, _id: 1 } }
    ).lean();
    if (!target) break;

    claimed += 1;
    maxJobLagMs = Math.max(maxJobLagMs, Math.max(now.getTime() - target.nextAttemptAt.getTime(), 0));

    try {
      if (!isEmailConfigured()) throw new Error('email_not_configured');
      if (!fromName) {
        fromName = getBrandingEmailName(await getBranding());
      }

      const delivered = await sendNotificationEmail(target.to, target.subject, target.html, target.text, { fromName });
      if (!delivered) throw new Error('email_delivery_failed');

      await EmailOutbox.updateOne(
        { _id: target._id, state: 'processing', lockToken },
        {
          $set: {
            state: 'sent',
            sentAt: new Date(),
            lockedUntil: null,
            lockToken: null,
            lastErrorCode: '',
            deadLetteredAt: null,
          },
        }
      );
      sent += 1;
    } catch {
      const isDeadLetter = target.attempts >= MAX_EMAIL_ATTEMPTS;
      await EmailOutbox.updateOne(
        { _id: target._id, state: 'processing', lockToken },
        {
          $set: {
            state: isDeadLetter ? 'dead-letter' : 'pending',
            nextAttemptAt: new Date(Date.now() + retryDelay(target.attempts)),
            lockedUntil: null,
            lockToken: null,
            lastErrorCode: 'email_delivery_failed',
            deadLetteredAt: isDeadLetter ? new Date() : null,
          },
        }
      );
      if (isDeadLetter) {
        deadLettered += 1;
      } else {
        retried += 1;
      }
    }
  }

  const oldestDeadLetter = await EmailOutbox.findOne({ state: 'dead-letter' })
    .select('deadLetteredAt updatedAt')
    .sort({ deadLetteredAt: 1, _id: 1 })
    .lean();
  const oldestDeadLetterAt = oldestDeadLetter?.deadLetteredAt || oldestDeadLetter?.updatedAt;

  return {
    claimed,
    sent,
    retried,
    deadLettered,
    maxJobLagMs,
    oldestDeadLetterAgeMs: oldestDeadLetterAt
      ? Math.max(Date.now() - oldestDeadLetterAt.getTime(), 0)
      : 0,
  };
}
