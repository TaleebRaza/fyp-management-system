import nodemailer from 'nodemailer';

type SendMailOptions = {
  replyTo?: string;
  fromName?: string;
};

const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'FYP Portal';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER;

export function isEmailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);
}

// Create a reusable transporter object using the default SMTP transport.
// Keep this Gmail-based so the portal still works on the current free setup.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

function stripHtml(htmlContent: string) {
  return htmlContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const sendNotificationEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  options: SendMailOptions = {}
) => {
  if (!isEmailConfigured()) {
    console.warn('Email credentials missing in environment. Email dispatch aborted.');
    return false;
  }

  const cleanTo = String(to || '').trim().toLowerCase();
  const cleanSubject = String(subject || '').trim();
  const plainText = String(textContent || '').trim() || stripHtml(htmlContent);
  const fromName = options.fromName || EMAIL_FROM_NAME;
  const replyTo = options.replyTo || EMAIL_REPLY_TO;

  if (!cleanTo || !cleanSubject || !plainText) {
    console.warn('Email dispatch aborted because recipient, subject, or content is missing.');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to: cleanTo,
      subject: cleanSubject,
      text: plainText,
      html: htmlContent,
      replyTo,
      headers: {
        'X-Portal-Email-Type': 'transactional',
        'X-Portal-Source': 'fyp-portal',
      },
    });

    void info;
    console.info('email_dispatched');
    return true;
  } catch {
    console.error('email_dispatch_failed');
    return false;
  }
};
