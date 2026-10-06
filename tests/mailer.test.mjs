import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const source = await readFile(new URL('../lib/mailer.ts', import.meta.url), 'utf8');
const validation = await importTypeScriptModule('lib/security/input.ts');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const defaults = {
  BREVO_SMTP_USER: 'smtp-user-secret', BREVO_SMTP_KEY: 'smtp-key-secret',
  EMAIL_FROM_ADDRESS: 'security@example.com',
};

function load(env = {}, result = { accepted: ['recipient@example.com'], rejected: [] }) {
  const calls = [], logs = [], transports = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, process: { env: { ...defaults, ...env } },
    console: Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (...args) => logs.push([level, ...args])])),
    require: (name) => {
      if (name === './security/input') return validation;
      assert.equal(name, 'nodemailer');
      return { createTransport: (config) => {
        transports.push(config);
        return { sendMail: async (mail) => {
          calls.push(mail);
          if (result instanceof Error || result === null) throw result;
          return result;
        } };
      } };
    },
  });
  return { ...exports, calls, logs, transports };
}

test('Brevo transport uses SMTP credentials and correct TLS settings with safe defaults', () => {
  assert.doesNotMatch(source, /EMAIL_USER|EMAIL_APP_PASSWORD/);
  for (const [port, expected] of [[undefined, 587], ['465', 465], ['2525', 2525], ['bad', 587], ['0', 587], ['65536', 587]]) {
    const mailer = load({ BREVO_SMTP_PORT: port });
    const config = mailer.transports[0];
    assert.equal(config.service, undefined);
    assert.equal(config.host, 'smtp-relay.brevo.com');
    assert.equal(config.port, expected);
    assert.equal(config.secure, expected === 465);
    assert.equal(config.requireTLS, expected === 587);
    assert.equal(config.auth.user, defaults.BREVO_SMTP_USER);
    assert.equal(config.auth.pass, defaults.BREVO_SMTP_KEY);
  }
  assert.equal(load({ BREVO_SMTP_HOST: 'custom.example.com' }).transports[0].host, 'custom.example.com');
});

test('configuration requires Brevo credentials and sender even when legacy credentials exist', async () => {
  assert.equal(load().isEmailConfigured(), true);
  for (const key of Object.keys(defaults)) {
    const mailer = load({ [key]: '', EMAIL_USER: 'legacy@example.com', EMAIL_APP_PASSWORD: 'legacy-secret' });
    assert.equal(mailer.isEmailConfigured(), false);
    assert.equal(await mailer.sendNotificationEmail('recipient@example.com', 'Subject', '<p>Body</p>'), false);
    assert.equal(mailer.calls.length, 0);
  }
});

test('public API sends text and HTML, supports optional overrides, and reuses the transporter', async () => {
  const mailer = load({ EMAIL_USER: 'legacy@example.com' });
  assert.equal(await mailer.sendNotificationEmail(' Recipient@Example.com ', ' Subject ', '<p>Body &amp; more</p>'), true);
  const mail = mailer.calls[0];
  assert.equal(mail.from.address, defaults.EMAIL_FROM_ADDRESS);
  assert.equal(mail.from.name, 'FYP Portal Security');
  assert.equal(mail.to, 'recipient@example.com');
  assert.equal(mail.text, 'Body & more');
  assert.equal(mail.html, '<p>Body &amp; more</p>');
  assert.equal(mail.replyTo, undefined);
  assert.equal(await mailer.sendNotificationEmail('recipient@example.com', 'Subject', '<p>Body</p>', 'Plain', {
    fromName: 'Custom', replyTo: 'Reply@Example.com',
  }), true);
  assert.equal(mailer.calls[1].text, 'Plain');
  assert.equal(mailer.calls[1].from.name, 'Custom');
  assert.equal(mailer.calls[1].replyTo, 'reply@example.com');
  assert.equal(mailer.transports.length, 1);
  const configured = load({ EMAIL_FROM_NAME: 'Configured', EMAIL_REPLY_TO: 'reply@example.com' });
  await configured.sendNotificationEmail('recipient@example.com', 'Subject', '<p>Body</p>');
  assert.equal(configured.calls[0].from.name, 'Configured');
  assert.equal(configured.calls[0].replyTo, 'reply@example.com');
});

test('invalid recipient, sender, reply-to, subject, and empty body are rejected', async () => {
  for (const [env, args] of [
    [{}, ['invalid', 'Subject', '<p>Body</p>']],
    [{ EMAIL_FROM_ADDRESS: 'invalid' }, ['recipient@example.com', 'Subject', '<p>Body</p>']],
    [{ EMAIL_REPLY_TO: 'invalid' }, ['recipient@example.com', 'Subject', '<p>Body</p>']],
    [{}, ['recipient@example.com', 'Subject', '<p>Body</p>', 'Plain', { replyTo: 'invalid' }]],
    [{}, ['recipient@example.com', ' ', '<p>Body</p>']],
    [{}, ['recipient@example.com', 'Subject', '<p> </p>', ' ']],
  ]) {
    const mailer = load(env);
    assert.equal(await mailer.sendNotificationEmail(...args), false);
    assert.equal(mailer.calls.length, 0);
  }
});

test('diagnostics report counts and safe SMTP metadata without sensitive values', async () => {
  const sensitive = [...Object.values(defaults), 'recipient@example.com', 'private-subject', 'OTP-123456', 'reset-token-secret'];
  const success = load({}, { accepted: ['recipient@example.com'], rejected: ['other@example.com'],
    messageId: 'reset-token-secret', response: sensitive.join(' ') });
  await success.sendNotificationEmail('recipient@example.com', 'private-subject', '<p>OTP-123456</p>');
  assert.equal(success.logs[0][1], 'email_dispatched');
  assert.equal(success.logs[0][2].acceptedCount, 1);
  assert.equal(success.logs[0][2].rejectedCount, 1);
  const failure = load({}, Object.assign(new Error(sensitive.join(' ')), {
    code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN', response: sensitive.join(' '),
  }));
  assert.equal(await failure.sendNotificationEmail('recipient@example.com', 'private-subject', '<p>OTP-123456</p>'), false);
  assert.equal(failure.logs[0][1], 'email_dispatch_failed');
  assert.equal(failure.logs[0][2].code, 'EAUTH');
  assert.equal(failure.logs[0][2].responseCode, 535);
  assert.equal(failure.logs[0][2].command, 'AUTH PLAIN');
  const hostile = load({}, Object.assign(new Error('secret'), {
    code: defaults.BREVO_SMTP_KEY, responseCode: sensitive.join(' '), command: 'AUTH ' + defaults.BREVO_SMTP_USER,
  }));
  assert.equal(await hostile.sendNotificationEmail('recipient@example.com', 'Subject', '<p>Body</p>'), false);
  for (const entry of [success, failure, hostile]) {
    const logged = JSON.stringify(entry.logs);
    for (const value of sensitive) assert.equal(logged.includes(value), false);
  }
  assert.equal(await load({}, null).sendNotificationEmail('recipient@example.com', 'Subject', '<p>Body</p>'), false);
});
