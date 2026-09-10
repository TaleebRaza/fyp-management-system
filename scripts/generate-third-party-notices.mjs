import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageMetadata = async (packageDirectory) => {
  try {
    return JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
};

const licenseName = (license) => {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && typeof license.type === 'string') return license.type;
  return 'UNKNOWN';
};

const repositoryUrl = (repository) => {
  if (typeof repository === 'string') return repository;
  if (repository && typeof repository === 'object' && typeof repository.url === 'string') return repository.url;
  return '';
};

const collectPackages = async (nodeModulesDirectory, packages) => {
  let entries;
  try {
    entries = await readdir(nodeModulesDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const packageDirectory = path.join(nodeModulesDirectory, entry.name);
    if (entry.name.startsWith('@')) {
      await collectPackages(packageDirectory, packages);
      continue;
    }
    const metadata = await packageMetadata(packageDirectory);
    if (metadata?.name && metadata.version) {
      packages.set(`${metadata.name}@${metadata.version}`, {
        name: metadata.name,
        version: metadata.version,
        license: licenseName(metadata.license ?? metadata.licenses),
        repository: repositoryUrl(metadata.repository),
      });
    }
    await collectPackages(path.join(packageDirectory, 'node_modules'), packages);
  }
};

export async function generateThirdPartyNotices(outputPath, rootDirectory = process.cwd()) {
  const packages = new Map();
  await collectPackages(path.join(rootDirectory, 'node_modules'), packages);
  if (packages.size === 0) {
    throw new Error('node_modules is required to generate third-party notices');
  }
  const rows = [...packages.values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version))
    .map((entry) => `| ${entry.name} | ${entry.version} | ${entry.license} | ${entry.repository || '-'} |`);
  const contents = [
    '# Third-party notices',
    '',
    'This installer deploys an application image that contains the Node packages listed below. Review each package license before redistributing the release.',
    '',
    '| Package | Version | License | Repository |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Container images',
    '',
    '- Node.js 22.15.0 (application base image)',
    '- Caddy 2.11.4',
    '- MongoDB 8.0.16',
    '- SeaweedFS 4.42',
    '',
  ].join('\n');
  await writeFile(outputPath, contents, { mode: 0o644 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3) {
    console.error('Usage: node scripts/generate-third-party-notices.mjs OUTPUT');
    process.exit(2);
  }
  generateThirdPartyNotices(output).catch((error) => {
    console.error(`third-party notices: ${error.message}`);
    process.exit(1);
  });
}
