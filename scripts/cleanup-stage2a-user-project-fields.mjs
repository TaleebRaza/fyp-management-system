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
  process.env.CONFIRM_USER_PROJECT_LEGACY_CLEANUP !==
    'stage2a-student-project-fields'
) {
  console.error(
    'Refusing to apply. Use --apply with ' +
      'CONFIRM_USER_PROJECT_LEGACY_CLEANUP=stage2a-student-project-fields.'
  );

  process.exit(1);
}

const LEGACY_FIELDS = [
  'projectId',
  'supervisorId',
  'status',
  'remarks',
  'projectTitle',
  'projectDesc',
  'pdfUrl',
  'domain',
  'domains',
  'tools',
];

const OBSOLETE_INDEX_KEYS = [
  {
    role: 1,
    supervisorId: 1,
  },

  {
    projectId: 1,
  },

  {
    supervisorId: 1,
  },

  {
    role: 1,
    program: 1,
    batch: 1,
    status: 1,
    createdAt: -1,
  },

  {
    role: 1,
    status: 1,
    createdAt: -1,
  },
];

function keySignature(key) {
  return JSON.stringify(
    Object.entries(key)
  );
}

const obsoleteSignatures = new Set(
  OBSOLETE_INDEX_KEYS.map((key) =>
    keySignature(key)
  )
);

await mongoose.connect(uri);

try {
  const users =
    mongoose.connection.collection('users');

  const anyLegacyFieldExists = {
    $or: LEGACY_FIELDS.map((field) => ({
      [field]: {
        $exists: true,
      },
    })),
  };

  /*
   * IMPORTANT:
   *
   * Stage 2A cleans STUDENTS ONLY.
   *
   * Supervisor/admin documents are deliberately
   * left untouched by this migration.
   */
  const studentCleanupFilter = {
    role: 'student',
    ...anyLegacyFieldExists,
  };

  const [
    studentLegacyCount,
    nonStudentLegacyCounts,
    indexes,
  ] = await Promise.all([
    users.countDocuments(
      studentCleanupFilter
    ),

    users
      .aggregate([
        {
          $match: {
            role: {
              $ne: 'student',
            },

            ...anyLegacyFieldExists,
          },
        },

        {
          $group: {
            _id: '$role',
            total: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            total: -1,
          },
        },
      ])
      .toArray(),

    users.indexes(),
  ]);

  const obsoleteIndexes = indexes
    .filter((index) =>
      obsoleteSignatures.has(
        keySignature(index.key)
      )
    )
    .map((index) => ({
      name: index.name,
      key: index.key,
    }));

  console.log(
    JSON.stringify(
      {
        mode:
          apply
            ? 'apply'
            : 'dry-run',

        scope: {
          role: 'student',

          fieldsToUnset:
            LEGACY_FIELDS,
        },

        studentDocumentsContainingLegacyFields:
          studentLegacyCount,

        nonStudentDocumentsLeftUntouched:
          nonStudentLegacyCounts,

        obsoleteIndexes,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(
      '\nDRY RUN ONLY — no database changes were made.'
    );
  } else {
    const unsetDocument =
      Object.fromEntries(
        LEGACY_FIELDS.map(
          (field) => [
            field,
            '',
          ]
        )
      );

    const updateResult =
      await users.updateMany(
        studentCleanupFilter,

        {
          $unset:
            unsetDocument,
        }
      );

    const droppedIndexes = [];

    for (
      const index of obsoleteIndexes
    ) {
      if (!index.name) continue;

      await users.dropIndex(
        index.name
      );

      droppedIndexes.push(
        index.name
      );
    }

    const [
      remainingStudentLegacyDocuments,
      remainingIndexes,
    ] = await Promise.all([
      users.countDocuments(
        studentCleanupFilter
      ),

      users.indexes(),
    ]);

    const remainingObsoleteIndexes =
      remainingIndexes
        .filter((index) =>
          obsoleteSignatures.has(
            keySignature(index.key)
          )
        )
        .map((index) => ({
          name: index.name,
          key: index.key,
        }));

    console.log(
      JSON.stringify(
        {
          cleanup: {
            matched:
              updateResult.matchedCount,

            modified:
              updateResult.modifiedCount,

            droppedIndexes,
          },

          verification: {
            remainingStudentLegacyDocuments,

            remainingObsoleteIndexes,
          },
        },
        null,
        2
      )
    );

    if (
      remainingStudentLegacyDocuments !== 0 ||
      remainingObsoleteIndexes.length !== 0
    ) {
      process.exitCode = 2;
    }
  }
} finally {
  await mongoose.disconnect();
}