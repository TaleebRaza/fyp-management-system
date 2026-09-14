const operation = process.argv[2];

if (operation !== 'essential' && operation !== 'retention') {
  console.error('Usage: node scripts/run-background-operation.mjs <essential|retention>');
  process.exit(2);
}

const cronSecret = process.env.CRON_SECRET?.trim();
if (!cronSecret) {
  console.error('CRON_SECRET is required for background operations.');
  process.exit(1);
}

try {
  const response = await fetch(`http://127.0.0.1:3000/api/cron/${operation}`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Background ${operation} operation failed with HTTP ${response.status}.`);
    process.exit(1);
  }
  process.stdout.write(`${body}\n`);
} catch {
  console.error(`Background ${operation} operation could not reach the portal.`);
  process.exit(1);
}
