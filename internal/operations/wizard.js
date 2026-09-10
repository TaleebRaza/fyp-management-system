const byId = (id) => document.getElementById(id);
const form = byId('setup-form');
const notice = byId('notice');
const review = byId('review');
const reviewDetails = byId('review-details');
let mode = 'install';
let logoUploaded = false;
let poller;

function value(id) { return byId(id).value.trim(); }
function checked(id) { return byId(id).checked; }
function number(id) { return Number(byId(id).value); }

function setNotice(message, kind = '') {
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Setup request failed.');
  return payload;
}

function toggleSections() {
  const databaseExternal = value('database-mode') === 'external';
  const storageExternal = value('storage-mode') === 'external';
  document.querySelectorAll('.external-database').forEach((node) => { node.hidden = !databaseExternal; });
  document.querySelectorAll('.external-storage').forEach((node) => { node.hidden = !storageExternal; });
  byId('mail-fields').hidden = !checked('mail-enabled');
  byId('backup-fields').hidden = !checked('backup-enabled');
}

function setMode(nextMode) {
  mode = nextMode;
  const configuring = mode === 'configure';
  document.querySelectorAll('[data-install]').forEach((section) => {
    section.hidden = configuring;
    section.querySelectorAll('input, select, button').forEach((control) => { control.disabled = configuring; });
  });
  document.querySelectorAll('[data-install-required]').forEach((control) => { control.required = !configuring; });
  byId('title').textContent = configuring ? 'Portal configuration' : 'Installation setup';
  byId('intro').textContent = configuring
    ? 'Update supported settings. Database and storage destinations are intentionally not editable here.'
    : 'Complete each section, save the configuration, review it, then start the installation.';
  byId('apply').textContent = configuring ? 'Apply configuration' : 'Start installation';
  toggleSections();
}

function mailConfiguration() {
  if (!checked('mail-enabled')) return {};
  return {
    host: value('mail-host'),
    port: number('mail-port'),
    tlsMode: value('mail-tls-mode'),
    username: value('mail-username'),
    password: byId('mail-password').value,
    from: value('mail-from'),
    fromName: value('mail-from-name'),
    replyTo: value('mail-reply-to'),
  };
}

function retentionConfiguration() {
  const category = (prefix) => ({ enabled: checked(`retention-${prefix}-enabled`), ageDays: number(`retention-${prefix}-days`) });
  return {
    schedule: { enabled: checked('retention-enabled'), timezone: value('retention-timezone'), time: value('retention-time') },
    playedVoiceNotes: category('played'),
    unplayedVoiceNotes: category('unplayed'),
    audioBroadcasts: category('broadcast'),
    unusedPdfUploads: category('pdf'),
  };
}

function configuration() {
  const shared = {
    mail: mailConfiguration(),
    branding: { universityName: value('university-name'), primaryColor: value('primary-color'), accentColor: value('accent-color') },
    retention: retentionConfiguration(),
    backup: checked('backup-enabled')
      ? { enabled: true, dailyAt: value('backup-time'), keep: number('backup-keep') }
      : { enabled: false, dailyAt: '', keep: 0 },
  };
  if (mode === 'configure') return shared;
  return {
    ...shared,
    domain: value('domain'),
    database: { mode: value('database-mode'), uri: value('database-uri') },
    storage: {
      mode: value('storage-mode'),
      endpoint: value('storage-endpoint'),
      browserEndpoint: value('storage-browser-endpoint'),
      region: value('storage-region'),
      accessKeyId: value('storage-access-key'),
      secretAccessKey: byId('storage-secret-key').value,
      bucketName: value('storage-bucket'),
      forcePathStyle: checked('storage-path-style'),
    },
    administrator: {
      name: value('admin-name'), email: value('admin-email'), rollNo: value('admin-roll-no'), password: byId('admin-password').value,
    },
  };
}

async function uploadLogo() {
  const file = byId('logo').files[0];
  if (!file) {
    if (mode === 'install' && !logoUploaded) throw new Error('A PNG logo is required for a new installation.');
    return;
  }
  const body = new FormData();
  body.append('logo', file);
  const response = await fetch('/api/logo', { method: 'POST', credentials: 'same-origin', body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Logo upload failed.');
  logoUploaded = true;
}

function reviewConfiguration(current) {
  const rows = [
    ['University', current.branding.universityName],
    ['Colors', `${current.branding.primaryColor} / ${current.branding.accentColor}`],
    ['SMTP', current.mail.host ? `${current.mail.host}:${current.mail.port}` : 'Not configured'],
    ['Retention', current.retention.schedule.enabled ? `${current.retention.schedule.time} ${current.retention.schedule.timezone}` : 'Disabled'],
    ['Backups', current.backup.enabled ? `${current.backup.dailyAt}, keep ${current.backup.keep}` : 'Manual only'],
  ];
  if (mode === 'install') {
    rows.unshift(['Domain', current.domain], ['Database', current.database.mode], ['Storage', current.storage.mode], ['Administrator', `${current.administrator.name} (${current.administrator.email})`]);
  }
  reviewDetails.replaceChildren(...rows.flatMap(([label, content]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = content;
    return [term, description];
  }));
  review.hidden = false;
}

async function save(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  try {
    setNotice('Validating configuration…');
    await uploadLogo();
    const current = configuration();
    await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
    reviewConfiguration(current);
    byId('apply').disabled = false;
    setNotice('Configuration saved. Review the non-secret summary below, then apply it.', 'success');
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function probe(event) {
  try {
    setNotice('Save the configuration before testing a connection.');
    await api('/api/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: event.currentTarget.dataset.probe }) });
    setNotice('Connection is reachable. Credentials are verified when the service starts.', 'success');
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function pollStatus() {
  try {
    const status = await api('/api/status');
    setNotice(status.message, status.state === 'failed' ? 'error' : status.state === 'complete' ? 'success' : '');
    if (status.state === 'complete' || status.state === 'failed') {
      clearInterval(poller);
      byId('apply').disabled = false;
    }
  } catch (error) {
    clearInterval(poller);
    setNotice(error.message, 'error');
  }
}

async function apply() {
  try {
    byId('apply').disabled = true;
    await api('/api/apply', { method: 'POST' });
    setNotice('Operation started. Keep this page open while progress is recorded.', 'success');
    poller = setInterval(pollStatus, 1200);
    await pollStatus();
  } catch (error) {
    byId('apply').disabled = false;
    setNotice(error.message, 'error');
  }
}

form.addEventListener('submit', save);
byId('apply').addEventListener('click', apply);
document.querySelectorAll('[data-probe]').forEach((button) => button.addEventListener('click', probe));
['database-mode', 'storage-mode', 'mail-enabled', 'backup-enabled'].forEach((id) => byId(id).addEventListener('change', toggleSections));

api('/api/config').then((configuration) => {
  setMode(configuration.mode);
  setNotice('Use Tab and Enter to move through the form. Save before testing or applying settings.');
}).catch((error) => setNotice(error.message, 'error'));
