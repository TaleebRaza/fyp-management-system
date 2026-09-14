import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
    );

    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.search(/\s+#/);

      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

loadEnvFile(path.join(process.cwd(), '.env.local')) ||
  loadEnvFile(path.join(process.cwd(), '.env'));

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error(
    'MONGODB_URI was not found in .env.local or .env.'
  );

  process.exit(1);
}

const apply = process.argv.includes('--apply');

if (
  apply &&
  process.env.CONFIRM_PROJECT_DOMAIN_CLEANUP !==
    'stage2b-project-domain'
) {
  console.error(
    'Refusing to apply. Use --apply with ' +
      'CONFIRM_PROJECT_DOMAIN_CLEANUP=stage2b-project-domain.'
  );

  process.exit(1);
}

function meaningful(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

await mongoose.connect(uri);

try {
  const projects =
    mongoose.connection.collection('projects');

  const projectsWithDomain =
    await projects
      .find(
        {
          domain: {
            $exists: true,
          },
        },
        {
          projection: {
            _id: 1,
            title: 1,
            domain: 1,
            domains: 1,
          },
        }
      )
      .toArray();

  const conflicts = [];

  for (const project of projectsWithDomain) {
    const hasLegacyDomain =
      meaningful(project.domain);

    const canonicalDomains =
      Array.isArray(project.domains)
        ? project.domains.filter(
            (value) =>
              typeof value === 'string' &&
              value.trim().length > 0
          )
        : [];

    /*
     * If the old display field contains actual data
     * while canonical domains is empty, removing
     * Project.domain could lose information.
     */
    if (
      hasLegacyDomain &&
      canonicalDomains.length === 0
    ) {
      conflicts.push({
        projectId:
          String(project._id),

        title:
          project.title || '',

        legacyDomain:
          project.domain,

        canonicalDomains:
          project.domains,
      });
    }
  }

  const indexes =
    await projects.indexes();

  const obsoleteDomainIndexes =
    indexes
      .filter((index) =>
        Object.keys(
          index.key || {}
        ).includes('domain')
      )
      .map((index) => ({
        name:
          index.name,

        key:
          index.key,
      }));

  console.log(
    JSON.stringify(
      {
        mode:
          apply
            ? 'apply'
            : 'dry-run',

        projectsWithLegacyDomain:
          projectsWithDomain.length,

        conflicts,

        obsoleteDomainIndexes,
      },
      null,
      2
    )
  );

  if (conflicts.length > 0) {
    console.error(
      '\nRefusing to remove Project.domain because some projects have meaningful legacy domain data but no canonical domains.'
    );

    process.exitCode = 2;
  } else if (!apply) {
    console.log(
      '\nDRY RUN ONLY — no database changes were made.'
    );
  } else {
    const result =
      await projects.updateMany(
        {
          domain: {
            $exists: true,
          },
        },
        {
          $unset: {
            domain: '',
          },
        }
      );

    const droppedIndexes = [];

    for (
      const index of
        obsoleteDomainIndexes
    ) {
      if (!index.name) continue;

      await projects.dropIndex(
        index.name
      );

      droppedIndexes.push(
        index.name
      );
    }

    const remainingLegacyDomains =
      await projects.countDocuments({
        domain: {
          $exists: true,
        },
      });

    const remainingIndexes =
      await projects.indexes();

    const remainingDomainIndexes =
      remainingIndexes
        .filter((index) =>
          Object.keys(
            index.key || {}
          ).includes('domain')
        )
        .map((index) => ({
          name:
            index.name,

          key:
            index.key,
        }));

    console.log(
      JSON.stringify(
        {
          cleanup: {
            matched:
              result.matchedCount,

            modified:
              result.modifiedCount,

            droppedIndexes,
          },

          verification: {
            remainingLegacyDomains,

            remainingDomainIndexes,
          },
        },
        null,
        2
      )
    );

    if (
      remainingLegacyDomains !== 0 ||
      remainingDomainIndexes.length !== 0
    ) {
      process.exitCode = 3;
    }
  }
} finally {
  await mongoose.disconnect();
}