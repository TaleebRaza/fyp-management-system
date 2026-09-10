import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { generateThirdPartyNotices } from './generate-third-party-notices.mjs';

const execute = promisify(execFile);
const releaseVersionPattern = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const imageDigestPattern = /^ghcr\.io\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
};

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

const executableFile = async (file) => {
  const details = await lstat(file);
  if (!details.isFile() || details.isSymbolicLink() || (details.mode & 0o111) === 0) {
    throw new Error(`${file} must be an executable regular file`);
  }
};

const releaseFiles = async (directory, prefix = '') => {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = join(directory, entry.name);
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await releaseFiles(file, name));
    } else if (entry.isFile()) {
      files.push(name);
    } else {
      throw new Error(`release contains unsupported file ${name}`);
    }
  }
  return files;
};

const sourceDateEpoch = () => {
  const value = process.env.SOURCE_DATE_EPOCH;
  if (!value || !/^\d+$/.test(value)) throw new Error('SOURCE_DATE_EPOCH must be a Unix timestamp');
  return value;
};

async function main() {
  const version = argument('--version');
  const image = argument('--image');
  const sourceCommit = argument('--commit');
  const install = resolve(argument('--install'));
  const fypctl = resolve(argument('--fypctl'));
  if (!releaseVersionPattern.test(version) || !imageDigestPattern.test(image) || !commitPattern.test(sourceCommit)) {
    throw new Error('release version, image digest, or source commit is invalid');
  }
  await executableFile(install);
  await executableFile(fypctl);

  const root = process.cwd();
  const deploy = resolve(root, 'deploy');
  const deployReadme = join(deploy, 'README.md');
  if (!(await stat(join(deploy, 'compose.yaml'))).isFile() || !(await stat(deployReadme)).isFile()) {
    throw new Error('release source is missing deployment files');
  }

  const output = resolve(root, 'dist');
  const releaseName = `fyp-portal-${version}-linux-amd64`;
  const stagingRoot = join(output, '.stage');
  const staging = join(stagingRoot, releaseName);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o755 });
  await Promise.all([
    cp(install, join(staging, 'install')),
    cp(fypctl, join(staging, 'fypctl')),
    cp(deploy, join(staging, 'deploy'), { recursive: true, verbatimSymlinks: true }),
    cp(deployReadme, join(staging, 'INSTALL.md')),
  ]);
  await Promise.all([chmod(join(staging, 'install'), 0o755), chmod(join(staging, 'fypctl'), 0o755)]);
  await generateThirdPartyNotices(join(staging, 'THIRD_PARTY_NOTICES.md'), root);

  const manifest = {
    formatVersion: 1,
    releaseVersion: version,
    image,
    platform: 'linux/amd64',
    configurationVersion: 1,
    compatibleFrom: [],
    migration: 'none',
    rollbackCompatible: true,
    sourceCommit,
  };
  await writeFile(join(staging, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });

  const files = await releaseFiles(staging);
  const checksums = await Promise.all(files.map(async (file) => `${await sha256(join(staging, file))}  ${file}`));
  await writeFile(join(staging, 'SHA256SUMS'), `${checksums.join('\n')}\n`, { mode: 0o644 });

  const archive = join(output, `${releaseName}.tar.gz`);
  await execute('tar', [
    '--sort=name',
    `--mtime=@${sourceDateEpoch()}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf', archive,
    '-C', stagingRoot,
    releaseName,
  ]);
  await writeFile(`${archive}.sha256`, `${await sha256(archive)}  ${basename(archive)}\n`, { mode: 0o644 });
  await writeFile(join(output, `release-manifest-${version}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  console.log(relative(root, archive));
}

main().catch((error) => {
  console.error(`release packaging: ${error.message}`);
  process.exit(1);
});
