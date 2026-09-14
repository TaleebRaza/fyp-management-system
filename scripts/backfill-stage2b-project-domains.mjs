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
  process.env.CONFIRM_PROJECT_DOMAIN_BACKFILL !==
    'stage2b-domain-backfill'
) {
  console.error(
    'Refusing to apply. Use --apply with ' +
      'CONFIRM_PROJECT_DOMAIN_BACKFILL=stage2b-domain-backfill.'
  );

  process.exit(1);
}

/*
 * These mappings use only domain IDs supported by
 * config/projectDomains.ts.
 *
 * "other-interdisciplinary" is used only where the old
 * free-text domain contains meaningful concepts that do
 * not have their own canonical category.
 */
const BACKFILL = [
  {
    projectId: '6a4e045dc6e347b0843ecbf0',
    legacyDomain: 'Cybersecurity',
    domains: [
      'cybersecurity',
      'networks-telecommunications',
    ],
  },
  {
    projectId: '6a4e10fcc6e347b0843ecbfe',
    legacyDomain: 'Artificial Intelligence',
    domains: [
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a4e21d9358ce3540b2ea6fc',
    legacyDomain: 'Artificial Intelligence (AI)',
    domains: [
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a4e2719358ce3540b2ea706',
    legacyDomain: 'Computer Vision / Machine Learning',
    domains: [
      'computer-vision',
      'machine-learning',
    ],
  },
  {
    projectId: '6a4e2b2a84f633d5ae0a6cdf',
    legacyDomain:
      'Artificial Intelligence, Smart Waste Management, Environmental Sustainability',
    domains: [
      'artificial-intelligence',
      'other-interdisciplinary',
    ],
  },
  {
    projectId: '6a4e41c26979c2dbfe5107bf',
    legacyDomain: 'AI',
    domains: [
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a4e44b06979c2dbfe5107c3',
    legacyDomain:
      'Artificial Intelligence (Natural Language Processing, Large Language Models, Computer Vision, Accessibility Technology',
    domains: [
      'artificial-intelligence',
      'natural-language-processing',
      'computer-vision',
      'other-interdisciplinary',
    ],
  },
  {
    projectId: '6a4e5ada3ddfb8659c4482e6',
    legacyDomain: 'AI/ML',
    domains: [
      'artificial-intelligence',
      'machine-learning',
    ],
  },
  {
    projectId: '6a4e7361913bb8cd66c68ca8',
    legacyDomain: 'Artificial Intelligence',
    domains: [
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a4e795ffeabbebdbb56aac3',
    legacyDomain:
      'Artificial Intelligence | Generative AI | Bioinformatics | Precision Medicine | Healthcare AI | Drug Discovery | Multi-Omics',
    domains: [
      'artificial-intelligence',
      'health-informatics',
      'other-interdisciplinary',
    ],
  },
  {
    projectId: '6a4f449422558a345720f8e4',
    legacyDomain: 'Computer Networks and Cyber Security',
    domains: [
      'networks-telecommunications',
      'cybersecurity',
    ],
  },
  {
    projectId: '6a4f49ab5097a4df6dd8f122',
    legacyDomain:
      'Artificial Intelligence (AI), 6G Wireless Communications',
    domains: [
      'artificial-intelligence',
      'networks-telecommunications',
    ],
  },
  {
    projectId: '6a4f709a9446b23e6cdb0e9a',
    legacyDomain:
      'Artificial Intelligence (AI) & Deep Learning',
    domains: [
      'artificial-intelligence',
      'deep-learning',
    ],
  },
  {
    projectId: '6a4f92f8638cb5879de0a129',
    legacyDomain:
      'AI,Web Development, Education Technolgy',
    domains: [
      'artificial-intelligence',
      'web-applications',
      'education-technology',
    ],
  },
  {
    projectId: '6a4f952f36dec6ded8c43992',
    legacyDomain:
      'Telecommunication and networking',
    domains: [
      'networks-telecommunications',
    ],
  },
  {
    projectId: '6a4fa0e3f55d2bf042706aba',
    legacyDomain:
      'Cyber security and artificial intelligence',
    domains: [
      'cybersecurity',
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a4fe63b3760fd3203b71457',
    legacyDomain:
      'Artificial Intelligence & Mobile Application Development',
    domains: [
      'artificial-intelligence',
      'mobile-applications',
    ],
  },
  {
    projectId: '6a507e21fc8f60bcc1f3cdc0',
    legacyDomain:
      '1.Artficial Intelligence  2. Web Applications 3.Database system 4.Distributed Systems 5.Cloud Computing 6.Geographic Information Systems 7.Education Technology',
    domains: [
      'artificial-intelligence',
      'web-applications',
      'database-systems',
      'distributed-systems',
      'cloud-computing',
      'geographic-information-systems',
      'education-technology',
    ],
  },
  {
    projectId: '6a50881c251cf140253b88b4',
    legacyDomain:
      'Cyber security and Artificial intelligence',
    domains: [
      'cybersecurity',
      'artificial-intelligence',
    ],
  },
  {
    projectId: '6a5218bc9137d61623c0c24a',
    legacyDomain:
      'Artificial Intelligence (AI) and Web-Based Assistive Technology',
    domains: [
      'artificial-intelligence',
      'web-applications',
      'other-interdisciplinary',
    ],
  },
  {
    projectId: '6a5485d4cd9272c1ea7f04af',
    legacyDomain: 'Mobile app',
    domains: [
      'mobile-applications',
    ],
  },
];

const VALID_DOMAIN_IDS = new Set([
  'artificial-intelligence',
  'machine-learning',
  'deep-learning',
  'natural-language-processing',
  'computer-vision',
  'data-science-analytics',
  'big-data',

  'web-applications',
  'mobile-applications',
  'game-development',
  'augmented-reality',
  'virtual-reality',
  'human-computer-interaction',

  'cloud-computing',
  'distributed-systems',
  'database-systems',
  'internet-of-things',
  'embedded-systems',
  'robotics',
  'networks-telecommunications',

  'cybersecurity',
  'blockchain',
  'geographic-information-systems',
  'health-informatics',
  'education-technology',
  'financial-technology',
  'e-commerce',
  'other-interdisciplinary',
]);

for (const entry of BACKFILL) {
  for (const domainId of entry.domains) {
    if (!VALID_DOMAIN_IDS.has(domainId)) {
      throw new Error(
        `Invalid canonical domain ID in migration: ${domainId}`
      );
    }
  }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function sameDomains(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();

  return JSON.stringify(a) === JSON.stringify(b);
}

await mongoose.connect(uri);

try {
  const projects =
    mongoose.connection.collection('projects');

  const plans = [];
  const alreadyBackfilled = [];
  const conflicts = [];

  for (const entry of BACKFILL) {
    const projectId =
      new mongoose.Types.ObjectId(
        entry.projectId
      );

    const project =
      await projects.findOne({
        _id: projectId,
      });

    if (!project) {
      conflicts.push({
        projectId:
          entry.projectId,

        reason:
          'Project no longer exists.',
      });

      continue;
    }

    const actualLegacy =
      normalizeText(
        project.domain
      );

    const expectedLegacy =
      normalizeText(
        entry.legacyDomain
      );

    /*
     * Guard against updating a record whose old domain
     * has changed since the dry-run audit.
     */
    if (
      actualLegacy !==
      expectedLegacy
    ) {
      conflicts.push({
        projectId:
          entry.projectId,

        reason:
          'Legacy domain changed since audit.',

        expectedLegacyDomain:
          entry.legacyDomain,

        actualLegacyDomain:
          project.domain,
      });

      continue;
    }

    const currentDomains =
      Array.isArray(project.domains)
        ? project.domains
            .map((value) =>
              String(value).trim()
            )
            .filter(Boolean)
        : [];

    if (currentDomains.length > 0) {
      if (
        sameDomains(
          currentDomains,
          entry.domains
        )
      ) {
        alreadyBackfilled.push({
          projectId:
            entry.projectId,

          domains:
            currentDomains,
        });
      } else {
        conflicts.push({
          projectId:
            entry.projectId,

          reason:
            'Canonical domains are no longer empty and differ from the planned backfill.',

          currentDomains,

          plannedDomains:
            entry.domains,
        });
      }

      continue;
    }

    plans.push({
      projectId:
        entry.projectId,

      legacyDomain:
        project.domain,

      domains:
        entry.domains,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode:
          apply
            ? 'apply'
            : 'dry-run',

        projectsAudited:
          BACKFILL.length,

        plans,

        alreadyBackfilled,

        conflicts,
      },
      null,
      2
    )
  );

  if (conflicts.length > 0) {
    console.error(
      '\nRefusing to continue because backfill conflicts were found.'
    );

    process.exitCode = 2;
  } else if (!apply) {
    console.log(
      '\nDRY RUN ONLY — no database changes were made.'
    );
  } else {
    let modified = 0;

    for (const plan of plans) {
      const result =
        await projects.updateOne(
          {
            _id:
              new mongoose.Types.ObjectId(
                plan.projectId
              ),

            $or: [
              {
                domains: {
                  $exists: false,
                },
              },

              {
                domains: [],
              },
            ],
          },

          {
            $set: {
              domains:
                plan.domains,
            },
          }
        );

      modified +=
        result.modifiedCount;
    }

    const verificationConflicts = [];

    for (const entry of BACKFILL) {
      const project =
        await projects.findOne(
          {
            _id:
              new mongoose.Types.ObjectId(
                entry.projectId
              ),
          },

          {
            projection: {
              domains: 1,
            },
          }
        );

      const domains =
        Array.isArray(
          project?.domains
        )
          ? project.domains
          : [];

      if (
        !sameDomains(
          domains,
          entry.domains
        )
      ) {
        verificationConflicts.push({
          projectId:
            entry.projectId,

          expected:
            entry.domains,

          actual:
            domains,
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          cleanup: {
            modified,
          },

          verification: {
            verifiedProjects:
              BACKFILL.length -
              verificationConflicts.length,

            verificationConflicts,
          },
        },
        null,
        2
      )
    );

    if (
      verificationConflicts.length > 0
    ) {
      process.exitCode = 3;
    }
  }
} finally {
  await mongoose.disconnect();
}