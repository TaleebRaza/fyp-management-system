import nodemailer from 'nodemailer';
import { isValidEmailAddress, normalizeEmailAddress } from './security/input';

type SendMailOptions = {
  replyTo?: string;
  fromName?: string;
};

const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'FYP Portal Security';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;
const configuredPort = Number(process.env.BREVO_SMTP_PORT || 587);
const smtpPort = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
  ? configuredPort : 587;

export function isEmailConfigured() {
  return Boolean(process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY && process.env.EMAIL_FROM_ADDRESS);
}

// Reuse one transporter for Brevo transactional SMTP.
const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
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

  const cleanTo = normalizeEmailAddress(to);
  const cleanSubject = String(subject || '').trim();
  const plainText = String(textContent || '').trim() || stripHtml(htmlContent);
  const fromName = options.fromName || EMAIL_FROM_NAME;
  const fromAddress = normalizeEmailAddress(process.env.EMAIL_FROM_ADDRESS);
  const replyTo = normalizeEmailAddress(options.replyTo || EMAIL_REPLY_TO);

  if (
    !isValidEmailAddress(cleanTo)
    || !isValidEmailAddress(fromAddress)
    || (replyTo && !isValidEmailAddress(replyTo))
    || !cleanSubject
    || !plainText
  ) {
    console.warn('Email dispatch aborted because recipient, subject, or content is missing.');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: { name: fromName, address: fromAddress },
      to: cleanTo,
      subject: cleanSubject,
      text: plainText,
      html: htmlContent,
      ...(replyTo ? { replyTo } : {}),
      headers: {
        'X-Portal-Email-Type': 'transactional',
        'X-Portal-Source': 'fyp-portal',
      },
    });

    console.info('email_dispatched', {
      acceptedCount: info.accepted?.length || 0,
      rejectedCount: info.rejected?.length || 0,
    });
    return true;
  } catch (error) {
    const metadata = error as { code?: unknown; responseCode?: unknown; command?: unknown } | null;
    // Allowlist protocol metadata; raw errors/responses can contain credentials or addresses.
    console.error('email_dispatch_failed', {
      code: ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE', 'EMESSAGE', 'EDNS', 'ETLS']
        .find((code) => code === metadata?.code),
      responseCode: typeof metadata?.responseCode === 'number'
        && Number.isInteger(metadata.responseCode) && metadata.responseCode >= 100 && metadata.responseCode <= 599
        ? metadata.responseCode : undefined,
      command: ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'AUTH PLAIN', 'AUTH LOGIN', 'MAIL FROM', 'RCPT TO', 'DATA', 'QUIT']
        .find((command) => command === metadata?.command),
    });
    return false;
  }
};
