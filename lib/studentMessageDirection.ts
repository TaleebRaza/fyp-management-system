export type StudentMessageRecipient = 'admin' | 'supervisor';
export type StaffRole = StudentMessageRecipient;

type StudentMessageDirection =
  | { kind: 'request'; recipient: StudentMessageRecipient; supervisorId?: string }
  | { kind: 'reply'; sender: StaffRole; senderId: string };

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const MESSAGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;

function isMessageToken(value: string) {
  return MESSAGE_TOKEN_PATTERN.test(value);
}

export function createStudentMessageId(
  recipient: StudentMessageRecipient,
  messageToken: string,
  supervisorId?: string
) {
  if (!isMessageToken(messageToken)) throw new Error('Invalid message ID.');

  if (recipient === 'admin') return `to:admin:${messageToken}`;
  if (!supervisorId || !OBJECT_ID_PATTERN.test(supervisorId)) {
    throw new Error('Invalid supervisor recipient.');
  }
  return `to:supervisor:${supervisorId}:${messageToken}`;
}

export function createStaffReplyId(
  sender: StaffRole,
  senderId: string,
  messageToken: string
) {
  if (!OBJECT_ID_PATTERN.test(senderId) || !isMessageToken(messageToken)) {
    throw new Error('Invalid staff reply ID.');
  }
  return `from:${sender}:${senderId}:${messageToken}`;
}

export function getStudentMessageDirection(messageId: unknown): StudentMessageDirection | null {
  if (typeof messageId !== 'string') return null;

  const parts = messageId.split(':');
  if (parts[0] === 'to' && parts[1] === 'admin' && parts.length === 3 && isMessageToken(parts[2])) {
    return { kind: 'request', recipient: 'admin' };
  }
  if (
    parts[0] === 'to'
    && parts[1] === 'supervisor'
    && parts.length === 4
    && OBJECT_ID_PATTERN.test(parts[2])
    && isMessageToken(parts[3])
  ) {
    return { kind: 'request', recipient: 'supervisor', supervisorId: parts[2] };
  }
  if (
    parts[0] === 'from'
    && (parts[1] === 'admin' || parts[1] === 'supervisor')
    && parts.length === 4
    && OBJECT_ID_PATTERN.test(parts[2])
    && isMessageToken(parts[3])
  ) {
    return { kind: 'reply', sender: parts[1], senderId: parts[2] };
  }

  // Records written before recipient routing were admin requests or replies.
  if (parts.length === 1 && isMessageToken(parts[0])) {
    return { kind: 'request', recipient: 'admin' };
  }
  if (
    parts[0] === 'admin'
    && parts.length === 3
    && OBJECT_ID_PATTERN.test(parts[1])
    && isMessageToken(parts[2])
  ) {
    return { kind: 'reply', sender: 'admin', senderId: parts[1] };
  }

  return null;
}

export function isStaffReply(messageId: unknown) {
  return getStudentMessageDirection(messageId)?.kind === 'reply';
}

export function getStaffReplySenderId(messageId: unknown) {
  const direction = getStudentMessageDirection(messageId);
  return direction?.kind === 'reply' ? direction.senderId : null;
}

export function isMessageForStaff(
  messageId: unknown,
  staffRole: StaffRole,
  staffId?: string
) {
  const direction = getStudentMessageDirection(messageId);
  if (direction?.kind !== 'request' || direction.recipient !== staffRole) return false;
  return staffRole === 'admin' || direction.supervisorId === staffId;
}
