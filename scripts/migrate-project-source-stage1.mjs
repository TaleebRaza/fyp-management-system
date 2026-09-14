import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
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

const cwd = process.cwd();

const loadedEnv =
  loadEnvFile(path.join(cwd, '.env.local')) ||
  loadEnvFile(path.join(cwd, '.env'));

if (!loadedEnv) {
  console.error(
    'Could not find .env.local or .env in the repository root.'
  );
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
const apply = process.argv.includes('--apply');
const confirmation =
  process.env.CONFIRM_PROJECT_SOURCE_MIGRATION;

const STATUS_REPAIR_IDS = [
  '6a5218bc9137d61623c0c24a',
  '6a50c67531b155526dc6932c',
  '6a50881c251cf140253b88b4',
  '6a4fe63b3760fd3203b71457',
  '6a4fa0e3f55d2bf042706aba',
  '6a4f92f8638cb5879de0a129',
  '6a4f709a9446b23e6cdb0e9a',
  '6a4f449422558a345720f8e4',
  '6a4e41c26979c2dbfe5107bf',
];

if (!uri) {
  console.error(
    'MONGODB_URI was not found in .env.local or .env. No database changes were made.'
  );
  process.exit(1);
}

if (
  apply &&
  confirmation !== 'stage1-project-source'
) {
  console.error(
    'Refusing to apply. Run the dry run first, then use CONFIRM_PROJECT_SOURCE_MIGRATION=stage1-project-source with --apply.'
  );
  process.exit(1);
}

const meaningful = (value) =>
  typeof value === 'string' &&
  value.trim() !== '';

function uniqueMeaningfulStrings(values) {
  return [
    ...new Set(
      values
        .filter(meaningful)
        .map((value) => value.trim())
    ),
  ];
}

function resolvedLegacyValue(memberDocs, field) {
  const values = uniqueMeaningfulStrings(
    memberDocs.map((member) => member[field])
  );

  if (values.length > 1) {
    return {
      conflict: true,
      values,
    };
  }

  return {
    conflict: false,
    value: values[0] || '',
  };
}

await mongoose.connect(uri);

try {
  const projects =
    mongoose.connection.collection('projects');

  const users =
    mongoose.connection.collection('users');

  const allProjects =
    await projects.find({}).toArray();

  const plannedUpdates = [];
  const conflicts = [];

  for (const project of allProjects) {
    const memberIds =
      Array.isArray(project.members)
        ? project.members
        : [];

    const memberDocs =
      memberIds.length > 0
        ? await users
            .find(
              {
                _id: {
                  $in: memberIds,
                },
                role: 'student',
              },
              {
                projection: {
                  projectDesc: 1,
                  tools: 1,
                  remarks: 1,
                },
              }
            )
            .toArray()
        : [];

    const description =
      resolvedLegacyValue(
        memberDocs,
        'projectDesc'
      );

    const tools =
      resolvedLegacyValue(
        memberDocs,
        'tools'
      );

    const reviewRemarks =
      resolvedLegacyValue(
        memberDocs,
        'remarks'
      );

    for (const [field, result] of Object.entries({
      description,
      tools,
      reviewRemarks,
    })) {
      if (result.conflict) {
        conflicts.push({
          projectId: String(project._id),
          field,
          values: result.values,
        });
      }
    }

    if (
      description.conflict ||
      tools.conflict ||
      reviewRemarks.conflict
    ) {
      continue;
    }

    for (const [
      field,
      canonicalValue,
      legacyValue,
    ] of [
      [
        'description',
        project.description,
        description.value,
      ],
      [
        'tools',
        project.tools,
        tools.value,
      ],
      [
        'reviewRemarks',
        project.reviewRemarks,
        reviewRemarks.value,
      ],
    ]) {
      if (
        meaningful(canonicalValue) &&
        meaningful(legacyValue) &&
        canonicalValue.trim() !==
          legacyValue.trim()
      ) {
        conflicts.push({
          projectId: String(project._id),
          field,
          canonicalValue,
          legacyValue,
        });
      }
    }

    plannedUpdates.push({
      updateOne: {
        filter: {
          _id: project._id,
        },

        update: {
          $set: {
            description:
              meaningful(project.description)
                ? project.description
                : description.value,

            tools:
              meaningful(project.tools)
                ? project.tools
                : tools.value,

            reviewRemarks:
              meaningful(project.reviewRemarks)
                ? project.reviewRemarks
                : reviewRemarks.value,
          },
        },
      },
    });
  }

  const repairObjectIds =
    STATUS_REPAIR_IDS.map(
      (id) =>
        new mongoose.Types.ObjectId(id)
    );

  const repairProjects =
    await projects
      .find({
        _id: {
          $in: repairObjectIds,
        },
      })
      .toArray();

  const repairPreflight = [];

  for (const projectId of STATUS_REPAIR_IDS) {
    const project =
      repairProjects.find(
        (item) =>
          String(item._id) === projectId
      );

    if (!project) {
      conflicts.push({
        projectId,
        field: 'status',
        reason:
          'Verified repair project no longer exists.',
      });

      continue;
    }

    const memberDocs =
      await users
        .find(
          {
            _id: {
              $in:
                project.members || [],
            },

            role: 'student',
          },
          {
            projection: {
              status: 1,
            },
          }
        )
        .toArray();

    const memberStatuses =
      uniqueMeaningfulStrings(
        memberDocs.map(
          (member) => member.status
        )
      );

    const alreadyRepaired =
      project.status ===
      'Submitted For Review';

    const validPendingShape =
      project.stage === 'PROPOSAL' &&
      project.status === 'Pending' &&
      meaningful(project.pdfUrl) &&
      memberStatuses.length === 1 &&
      memberStatuses[0] ===
        'Submitted For Review';

    if (
      !alreadyRepaired &&
      !validPendingShape
    ) {
      conflicts.push({
        projectId,
        field: 'status',
        reason:
          'Verified status-repair preconditions changed.',
        projectStatus:
          project.status,
        stage:
          project.stage,
        hasPdf:
          meaningful(project.pdfUrl),
        memberStatuses,
      });

      continue;
    }

    repairPreflight.push({
      projectId,
      alreadyRepaired,
      currentStatus:
        project.status,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode:
          apply
            ? 'apply'
            : 'dry-run',

        projectsScanned:
          allProjects.length,

        canonicalFieldUpdatesPlanned:
          plannedUpdates.length,

        verifiedStatusRepairs:
          repairPreflight,

        conflicts,
      },
      null,
      2
    )
  );

  if (conflicts.length > 0) {
    console.error(
      'Refusing to continue because preflight conflicts were found.'
    );

    process.exitCode = 2;
  } else if (apply) {
    if (plannedUpdates.length > 0) {
      const result =
        await projects.bulkWrite(
          plannedUpdates,
          {
            ordered: true,
          }
        );

      console.log(
        JSON.stringify(
          {
            canonicalBackfill: {
              matched:
                result.matchedCount,

              modified:
                result.modifiedCount,
            },
          },
          null,
          2
        )
      );
    }

    const statusResult =
      await projects.updateMany(
        {
          _id: {
            $in: repairObjectIds,
          },

          stage: 'PROPOSAL',

          status: 'Pending',

          pdfUrl: {
            $type: 'string',
            $ne: '',
          },
        },
        {
          $set: {
            status:
              'Submitted For Review',
          },
        }
      );

    const indexes = [
      await projects.createIndex(
        {
          members: 1,
        },
        {
          name: 'members_1',
        }
      ),

      await projects.createIndex(
        {
          supervisorId: 1,
        },
        {
          name: 'supervisorId_1',
        }
      ),
    ];

    const remainingBadRepairs =
      await projects.countDocuments({
        _id: {
          $in: repairObjectIds,
        },

        status: {
          $ne:
            'Submitted For Review',
        },
      });

    const missingCanonicalFields =
      await projects.countDocuments({
        $or: [
          {
            description: {
              $exists: false,
            },
          },
          {
            tools: {
              $exists: false,
            },
          },
          {
            reviewRemarks: {
              $exists: false,
            },
          },
        ],
      });

    console.log(
      JSON.stringify(
        {
          statusRepair: {
            matched:
              statusResult.matchedCount,

            modified:
              statusResult.modifiedCount,

            remainingBadRepairs,
          },

          indexes,

          verification: {
            missingCanonicalFields,
          },
        },
        null,
        2
      )
    );

    if (
      remainingBadRepairs > 0 ||
      missingCanonicalFields > 0
    ) {
      process.exitCode = 3;
    }
  }
} finally {
  await mongoose.disconnect();
}