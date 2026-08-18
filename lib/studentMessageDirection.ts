const ADMIN_REPLY_PREFIX = 'admin:';
const ADMIN_ID_PATTERN = /^[a-f\d]{24}$/i;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;

export function getAdminReplySenderId(messageId: unknown) {
  if (typeof messageId !== 'string') return null;

  const [prefix, adminId, replyId, ...rest] = messageId.split(':');
  return prefix === ADMIN_REPLY_PREFIX.slice(0, -1)
    && ADMIN_ID_PATTERN.test(adminId)
    && MESSAGE_ID_PATTERN.test(replyId)
    && rest.length === 0
    ? adminId
    : null;
}

export function isAdminReply(messageId: unknown) {
  return getAdminReplySenderId(messageId) !== null;
}

export function createAdminReplyId(adminId: string, replyId: string) {
  if (!ADMIN_ID_PATTERN.test(adminId) || !MESSAGE_ID_PATTERN.test(replyId)) {
    throw new Error('Invalid admin reply ID.');
  }
  return `${ADMIN_REPLY_PREFIX}${adminId}:${replyId}`;
}
