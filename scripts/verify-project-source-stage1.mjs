import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

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

loadEnvFile(path.join(cwd, '.env.local')) ||
  loadEnvFile(path.join(cwd, '.env'));

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

const DIRECT_OBJECT_NAMES = [
  'student',
  'user',
  'member',
  'firstMember',
  'triggeringStudent',
  'studentInTransaction',
  'teamMember',
  'teamMembers',
  'studentRecord',
];

const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'coverage',
  'dist',
  'build',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (
      /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }

  return out;
}

function lineNumberAt(text, index) {
  return text
    .slice(0, index)
    .split('\n').length;
}

function compact(value) {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function scanCode() {
  const roots = [
    'app/api',
    'lib',
  ];

  const files = roots.flatMap((root) =>
    walk(path.join(cwd, root))
  );

  const findings = [];

  const objectAlt =
    DIRECT_OBJECT_NAMES.join('|');

  const fieldAlt =
    LEGACY_FIELDS.join('|');

  const directRegex = new RegExp(
    `\\b(?:${objectAlt})\\s*\\.\\s*(?:${fieldAlt})\\b`,
    'g'
  );

  for (const file of files) {
    const rel =
      path.relative(cwd, file);

    const text =
      fs.readFileSync(file, 'utf8');

    /*
     * Find direct accesses such as:
     *
     * student.projectId
     * firstMember.projectDesc
     * triggeringStudent.status
     *
     * These require manual review.
     */
    for (const match of text.matchAll(directRegex)) {
      findings.push({
        kind: 'direct-property',
        file: rel,
        line: lineNumberAt(
          text,
          match.index
        ),
        snippet: match[0],
      });
    }

    /*
     * Find User queries that mention legacy
     * project-related fields.
     *
     * Some will be allowed shadow writes.
     * Others may reveal remaining legacy reads.
     */
    const userQueryRegex =
      /User\.(?:find|findOne|findById|findByIdAndUpdate|findOneAndUpdate|updateMany|updateOne|aggregate)\s*\([\s\S]{0,1200}?\)(?:[\s\S]{0,500}?\.select\([\s\S]{0,600}?\))?/g;

    for (
      const match of text.matchAll(
        userQueryRegex
      )
    ) {
      const block = match[0];

      const present =
        LEGACY_FIELDS.filter(
          (field) =>
            new RegExp(
              `\\b${field}\\b`
            ).test(block)
        );

      if (present.length === 0) {
        continue;
      }

      findings.push({
        kind: 'user-query',
        file: rel,
        line: lineNumberAt(
          text,
          match.index
        ),
        fields: present,
        snippet:
          compact(block).slice(
            0,
            360
          ),
      });
    }
  }

  const seen = new Set();

  return findings.filter(
    (finding) => {
      const key = [
        finding.kind,
        finding.file,
        finding.line,
        finding.snippet,
      ].join('|');

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

function normalizeArray(value) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.map(String)
        ),
      ].sort()
    : [];
}

function sameArray(a, b) {
  return (
    JSON.stringify(
      normalizeArray(a)
    ) ===
    JSON.stringify(
      normalizeArray(b)
    )
  );
}

function normScalar(value) {
  return value === undefined ||
    value === null
    ? ''
    : String(value);
}

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

async function auditDatabase() {
  const uri =
    process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'MONGODB_URI was not found in .env.local or .env'
    );
  }

  await mongoose.connect(uri);

  try {
    const projects =
      mongoose.connection.collection(
        'projects'
      );

    const users =
      mongoose.connection.collection(
        'users'
      );

    const projectDocs =
      await projects
        .find(
          {},
          {
            projection: {
              _id: 1,
              members: 1,
              supervisorId: 1,

              title: 1,
              description: 1,
              tools: 1,
              reviewRemarks: 1,

              pdfUrl: 1,

              domain: 1,
              domains: 1,

              status: 1,
              stage: 1,
            },
          }
        )
        .toArray();

    const userDocs =
      await users
        .find(
          {
            role: 'student',
          },
          {
            projection: {
              _id: 1,

              projectId: 1,
              supervisorId: 1,

              projectTitle: 1,
              projectDesc: 1,

              tools: 1,
              remarks: 1,

              pdfUrl: 1,
              domains: 1,
            },
          }
        )
        .toArray();

    const usersById =
      new Map(
        userDocs.map(
          (user) => [
            String(user._id),
            user,
          ]
        )
      );

    const projectMembership =
      new Map();

    const mismatches = {
      projectId: [],
      supervisorId: [],

      title: [],
      description: [],
      tools: [],
      reviewRemarks: [],

      pdfUrl: [],
      domains: [],

      missingMemberUser: [],
      multiProjectMember: [],
    };

    let missingCanonicalFields = 0;

    for (
      const project of projectDocs
    ) {
      if (
        !Object.hasOwn(
          project,
          'description'
        ) ||
        !Object.hasOwn(
          project,
          'tools'
        ) ||
        !Object.hasOwn(
          project,
          'reviewRemarks'
        )
      ) {
        missingCanonicalFields++;
      }

      for (
        const memberIdRaw of
          project.members || []
      ) {
        const memberId =
          String(memberIdRaw);

        if (
          !projectMembership.has(
            memberId
          )
        ) {
          projectMembership.set(
            memberId,
            []
          );
        }

        projectMembership
          .get(memberId)
          .push(
            String(project._id)
          );

        const user =
          usersById.get(memberId);

        if (!user) {
          mismatches
            .missingMemberUser
            .push({
              projectId:
                String(project._id),

              memberId,
            });

          continue;
        }

        const checks = [
          [
            'projectId',

            normScalar(
              user.projectId
            ),

            String(project._id),
          ],

          [
            'supervisorId',

            normScalar(
              user.supervisorId
            ),

            normScalar(
              project.supervisorId
            ),
          ],

          [
            'title',

            normScalar(
              user.projectTitle
            ),

            normScalar(
              project.title
            ),
          ],

          [
            'description',

            normScalar(
              user.projectDesc
            ),

            normScalar(
              project.description
            ),
          ],

          [
            'tools',

            normScalar(
              user.tools
            ),

            normScalar(
              project.tools
            ),
          ],

          [
            'reviewRemarks',

            normScalar(
              user.remarks
            ),

            normScalar(
              project.reviewRemarks
            ),
          ],

          [
            'pdfUrl',

            normScalar(
              user.pdfUrl
            ),

            normScalar(
              project.pdfUrl
            ),
          ],
        ];

        for (
          const [
            kind,
            userValue,
            projectValue,
          ] of checks
        ) {
          if (
            userValue !==
            projectValue
          ) {
            mismatches[
              kind
            ].push({
              projectId:
                String(
                  project._id
                ),

              memberId,

              userValue,

              projectValue,
            });
          }
        }

        if (
          !sameArray(
            user.domains,
            project.domains
          )
        ) {
          mismatches
            .domains
            .push({
              projectId:
                String(
                  project._id
                ),

              memberId,

              userValue:
                user.domains || [],

              projectValue:
                project.domains || [],
            });
        }
      }
    }

    for (
      const [
        memberId,
        projectIds,
      ] of
        projectMembership.entries()
    ) {
      if (
        projectIds.length > 1
      ) {
        mismatches
          .multiProjectMember
          .push({
            memberId,
            projectIds,
          });
      }
    }

    const repairedStatuses =
      await projects
        .find(
          {
            _id: {
              $in:
                STATUS_REPAIR_IDS.map(
                  (id) =>
                    new mongoose
                      .Types
                      .ObjectId(id)
                ),
            },
          },
          {
            projection: {
              _id: 1,
              status: 1,
              stage: 1,
              pdfUrl: 1,
            },
          }
        )
        .toArray();

    const badStatusRepairs =
      STATUS_REPAIR_IDS.flatMap(
        (id) => {
          const project =
            repairedStatuses.find(
              (item) =>
                String(
                  item._id
                ) === id
            );

          if (!project) {
            return [
              {
                projectId: id,
                problem:
                  'missing project',
              },
            ];
          }

          if (
            project.status !==
            'Submitted For Review'
          ) {
            return [
              {
                projectId: id,
                status:
                  project.status,
                stage:
                  project.stage,
              },
            ];
          }

          return [];
        }
      );

    const summary = {
      projects:
        projectDocs.length,

      students:
        userDocs.length,

      missingCanonicalFields,

      badStatusRepairs:
        badStatusRepairs.length,

      mismatches:
        Object.fromEntries(
          Object.entries(
            mismatches
          ).map(
            ([key, value]) => [
              key,
              value.length,
            ]
          )
        ),
    };

    const blockers = {
      missingCanonicalFields,

      badStatusRepairs,

      projectId:
        mismatches.projectId,

      supervisorId:
        mismatches.supervisorId,

      title:
        mismatches.title,

      description:
        mismatches.description,

      tools:
        mismatches.tools,

      reviewRemarks:
        mismatches.reviewRemarks,

      pdfUrl:
        mismatches.pdfUrl,

      missingMemberUser:
        mismatches
          .missingMemberUser,

      multiProjectMember:
        mismatches
          .multiProjectMember,
    };

    return {
      summary,
      blockers,

      domainMismatches:
        mismatches.domains.slice(
          0,
          20
        ),
    };
  } finally {
    await mongoose.disconnect();
  }
}

const codeFindings =
  scanCode();

const dbAudit =
  await auditDatabase();

console.log(
  '\n========== STAGE 1 CODE AUDIT =========='
);

console.log(
  `Suspicious legacy User project references found: ${codeFindings.length}`
);

for (
  const finding of codeFindings
) {
  console.log(
    `\n[${finding.kind}] ${finding.file}:${finding.line}`
  );

  if (finding.fields) {
    console.log(
      `fields: ${finding.fields.join(', ')}`
    );
  }

  console.log(
    finding.snippet
  );
}

console.log(
  '\n\n========== STAGE 1 DATABASE AUDIT =========='
);

console.log(
  JSON.stringify(
    dbAudit.summary,
    null,
    2
  )
);

console.log(
  '\n========== DATABASE BLOCKER DETAILS =========='
);

const nonEmptyBlockers =
  Object.fromEntries(
    Object.entries(
      dbAudit.blockers
    ).filter(
      ([, value]) =>
        Array.isArray(value)
          ? value.length > 0
          : value > 0
    )
  );

console.log(
  JSON.stringify(
    nonEmptyBlockers,
    null,
    2
  )
);

console.log(
  '\n========== DOMAIN SHADOW MISMATCHES (informational) =========='
);

console.log(
  JSON.stringify(
    dbAudit.domainMismatches,
    null,
    2
  )
);

console.log(
  '\nREAD ONLY — NO DATABASE OR SOURCE FILES WERE MODIFIED.'
);

console.log(
  '\nFor Stage 2: database blockers must be empty. Code findings require manual classification; shadow writes are allowed, legacy reads/decisions are not.'
);