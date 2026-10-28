import { Types, type ClientSession } from 'mongoose';
import { enqueueNotificationEmail } from './emailOutbox';
import { isValidEmailAddress } from './security/input';

export async function createSupervisorJoinNotification(
  student: { name: string; rollNo: string; program?: string; batch?: string },
  supervisor: { email?: string; notificationsEnabled?: boolean },
  session: ClientSession
) {
  const notification = {
    _id: new Types.ObjectId(),
    message: `${student.name} (${student.rollNo}) joined your supervision. Program: ${student.program || 'Not set'}. Batch: ${student.batch || 'Not set'}.`,
    createdAt: new Date(),
  };

  if (supervisor.email && isValidEmailAddress(supervisor.email) && supervisor.notificationsEnabled !== false) {
    // shortcut: email waits for the existing cleanup schedule; add a faster worker if needed.
    await enqueueNotificationEmail({
      dedupeKey: `supervisor-join:${notification._id}`,
      to: supervisor.email,
      subject: 'New student assigned',
      text: 'A student joined your supervision. Open your FYP portal to view the assigned team.',
      html: '<p>A student joined your supervision. Open your FYP portal to view the assigned team.</p>',
    }, session);
  }

  return notification;
}
