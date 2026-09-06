import nodemailer from 'nodemailer';
import { getBranding } from './branding';
import { isValidEmailAddress, normalizeEmailAddress } from './security/input';
import { getMailConfiguration, type MailConfiguration } from './runtimeConfig';
import { getBrandingEmailName } from '../types/branding';

type SendMailOptions = {
  replyTo?: string;
  fromName?: string;
  emailType?: 'test' | 'transactional';
};

export function isEmailConfigured() {
  return Boolean(getMailConfiguration());
}

function createTransporter(configuration: MailConfiguration) {
  if (configuration.transport === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configuration.username,
        pass: configuration.password,
      },
    });
  }

  const transport = {
    host: configuration.host,
    port: configuration.port,
    secure: configuration.tlsMode === 'tls',
    requireTLS: configuration.tlsMode === 'starttls',
    ignoreTLS: configuration.tlsMode === 'none',
  };
  return configuration.username && configuration.password
    ? nodemailer.createTransport({
        ...transport,
        auth: { user: configuration.username, pass: configuration.password },
      })
    : nodemailer.createTransport(transport);
}

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
  const configuration = getMailConfiguration();
  if (!configuration) {
    console.warn('email_not_configured');
    return false;
  }

  const cleanTo = normalizeEmailAddress(to);
  const cleanSubject = String(subject || '').trim();
  const plainText = String(textContent || '').trim() || stripHtml(htmlContent);
  const fromName = String(options.fromName || configuration.fromName).trim() || configuration.fromName;
  const replyTo = options.replyTo || configuration.replyTo;

  if (!isValidEmailAddress(cleanTo) || !cleanSubject || !plainText) {
    console.warn('email_dispatch_invalid');
    return false;
  }

  try {
    await createTransporter(configuration).sendMail({
      from: { name: fromName, address: configuration.fromAddress },
      to: cleanTo,
      subject: cleanSubject,
      text: plainText,
      html: htmlContent,
      replyTo,
      headers: {
        'X-Portal-Email-Type': options.emailType || 'transactional',
        'X-Portal-Source': 'fyp-portal',
      },
    });

    console.info('email_dispatched');
    return true;
  } catch {
    console.error('email_dispatch_failed');
    return false;
  }
};

export async function verifyEmailConnection() {
  const configuration = getMailConfiguration();
  if (!configuration) return false;

  try {
    await createTransporter(configuration).verify();
    return true;
  } catch {
    console.error('email_connection_verification_failed');
    return false;
  }
}

export async function sendTestEmail(to: string) {
  if (!isEmailConfigured()) return false;
  let portalName: string;
  try {
    portalName = getBrandingEmailName(await getBranding());
  } catch {
    console.error('branding_read_failed');
    return false;
  }
  return sendNotificationEmail(
    to,
    `${portalName} SMTP test`,
    `<p>This is a test email from the ${portalName} SMTP configuration.</p>`,
    `This is a test email from the ${portalName} SMTP configuration.`,
    { emailType: 'test', fromName: portalName }
  );
}
