import { scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from '../tests/support/importTypeScript.mjs';

const PROFILES = new Set(['functional', 'performance', 'reset']);
const profile = process.argv[2];
if (!PROFILES.has(profile)) {
  console.error('Usage: npm run seed:local:functional | seed:local:performance | seed:local:reset');
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI
  || 'mongodb://127.0.0.1:27017/fyp_local?replicaSet=rs0';
const storageEndpoint = process.env.STORAGE_S3_ENDPOINT || 'http://127.0.0.1:9000';
const bucket = process.env.R2_BUCKET_NAME || 'fyp-local';
const storageUrl = new URL(storageEndpoint);
const mongoUrl = new URL(mongoUri);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

if (!loopbackHosts.has(mongoUrl.hostname) || mongoUrl.pathname !== '/fyp_local') {
  throw new Error('Refusing to seed: MONGODB_URI must target local database fyp_local.');
}
if (!loopbackHosts.has(storageUrl.hostname) || bucket !== 'fyp-local') {
  throw new Error('Refusing to seed: storage must use a loopback endpoint and bucket fyp-local.');
}

const s3 = new S3Client({
  region: process.env.STORAGE_S3_REGION || 'us-east-1',
  endpoint: storageEndpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'fyp-local',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'fyp-local-secret',
  },
  forcePathStyle: true,
});

const modelFiles = {
  EmailOutbox: 'models/EmailOutbox.ts',
  Headline: 'models/Headline.ts',
  PortalActivityLog: 'models/PortalActivityLog.ts',
  Project: 'models/Project.ts',
  RateLimit: 'models/RateLimit.ts',
  RegistrationPolicy: 'models/RegistrationPolicy.ts',
  RollNumberClaim: 'models/RollNumberClaim.ts',
  StorageDeletionOutbox: 'models/StorageDeletionOutbox.ts',
  SystemConfig: 'models/SystemConfig.ts',
  UploadReservation: 'models/UploadReservation.ts',
  User: 'models/User.ts',
  VivaAuditEvent: 'models/VivaAuditEvent.ts',
  VivaPanel: 'models/VivaPanel.ts',
  VivaParticipantLock: 'models/VivaParticipantLock.ts',
  VivaRound: 'models/VivaRound.ts',
  VivaSession: 'models/VivaSession.ts',
  VoiceNote: 'models/VoiceNote.ts',
};

const models = Object.fromEntries(await Promise.all(
  Object.entries(modelFiles).map(async ([name, file]) => [
    name,
    (await importTypeScriptModuleWithDependencies(file)).default,
  ])
));

const {
  Headline,
  Project,
  RegistrationPolicy,
  SystemConfig,
  User,
  VivaPanel,
  VivaParticipantLock,
  VivaRound,
  VivaSession,
} = models;

const FIXED_DATE = new Date('2026-10-01T00:00:00.000Z');
const SEEDED_PASSWORD = 'Local-only-2026!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const scrypt = promisify(nodeScrypt);

function objectId(group, number) {
  return new mongoose.Types.ObjectId(`${group}${number.toString(16).padStart(23, '0')}`);
}

function envCount(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a whole number from ${minimum} through ${maximum}.`);
  }
  return value;
}

async function localPasswordHash() {
  const salt = Buffer.from('fyp-local-seed-1');
  const key = await scrypt(SEEDED_PASSWORD, salt, 32, {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `$scrypt$v1$32768$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function emptyBucket() {
  let continuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    const objects = (page.Contents || []).flatMap(({ Key }) => Key ? [{ Key }] : []);
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function resetLocalState() {
  await Promise.all([mongoose.connection.dropDatabase(), emptyBucket()]);
  await Promise.all(Object.values(models).map((model) => model.createCollection()));
  await Promise.all(Object.values(models).map((model) => model.syncIndexes()));
  await SystemConfig.create({
    configKey: 'storage',
    usedBytes: 0,
    reservedBytes: 0,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  });
}

function person(user) {
  return {
    userId: String(user._id),
    name: user.name,
    rollNo: user.rollNo,
  };
}

function roundSnapshot(name = 'Canonical local Viva round') {
  return {
    name,
    targetPanelSize: 2,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    extraGradingDurationMinutes: null,
  };
}

function projectSnapshot(project, students, supervisor, includePdf = true) {
  return {
    projectId: String(project._id),
    title: project.title,
    description: project.description,
    domains: project.domains,
    tools: project.tools,
    pdfUrl: includePdf ? project.pdfUrl : '',
    pdfSize: includePdf ? project.pdfSize : 0,
    members: students.map(person),
    ...(supervisor ? { supervisor: person(supervisor) } : {}),
  };
}

function panelSnapshot(panel, examiners) {
  return {
    panelId: String(panel._id),
    panelAdmin: person(examiners[0]),
    examiners: examiners.map(person),
  };
}

function baseUser({ _id, name, email, rollNo, role, password }) {
  return {
    _id,
    name,
    email,
    rollNo,
    password,
    role,
    notificationsEnabled: true,
    extraSlots: 0,
    occupiedSlots: 0,
    isActive: true,
    sessionVersion: 0,
    monthlyLoginCount: 0,
    lastLoginMonth: '',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

function baseProject(index, members, supervisorId, status, pdfUrl = '') {
  return {
    _id: objectId('4', index + 1),
    supervisorId,
    members: members.map(({ _id }) => _id),
    inviteCode: `LOCAL${String(index + 1).padStart(6, '0')}`,
    title: `Deterministic project ${String(index + 1).padStart(4, '0')}`,
    description: `Synthetic ${status.toLowerCase()} project for local verification.`,
    titleFingerprint: `deterministic-project-${String(index + 1).padStart(4, '0')}`,
    domains: [['web-applications'], ['artificial-intelligence'], ['cybersecurity']][index % 3],
    tools: ['Next.js, MongoDB', 'Python, PyTorch', 'Node.js, OWASP'][index % 3],
    pdfUrl,
    pdfSize: pdfUrl ? PDF.length : 0,
    status,
    reviewRemarks: status === 'Rejected' ? 'Synthetic revision requested.' : '',
    version: index % 4,
    maxTeamSize: 2,
    stage: ['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES'][index % 3],
    createdAt: new Date(FIXED_DATE.getTime() + index * 1_000),
    updatedAt: new Date(FIXED_DATE.getTime() + index * 1_000),
  };
}

function setOccupiedSlots(supervisors, projects) {
  const counts = new Map();
  for (const { supervisorId } of projects) {
    if (supervisorId) counts.set(String(supervisorId), (counts.get(String(supervisorId)) || 0) + 1);
  }
  for (const supervisor of supervisors) supervisor.occupiedSlots = counts.get(String(supervisor._id)) || 0;
}

async function seedSharedDocuments() {
  await Promise.all([
    Headline.create({
      text: 'Deterministic local baseline',
      isActive: true,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    }),
    RegistrationPolicy.create({
      policyKey: 'student-registration',
      isOpen: true,
      projectSubmissionsOpen: true,
      projectSubmissionsAccepted: 0,
      version: 0,
      registrationsAccepted: 0,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    }),
  ]);
}

async function seedFunctional(password) {
  const admin = baseUser({
    _id: objectId('1', 1),
    name: 'Local Admin',
    email: 'admin@local.example.test',
    rollNo: 'A26-0001',
    role: 'admin',
    password,
  });
  const supervisors = Array.from({ length: 3 }, (_, index) => baseUser({
    _id: objectId('2', index + 1),
    name: `Local Supervisor ${index + 1}`,
    email: `supervisor${index + 1}@local.example.test`,
    rollNo: `E26-${String(index + 1).padStart(4, '0')}`,
    role: 'supervisor',
    password,
  }));
  supervisors[0].broadcastType = 'text';
  supervisors[0].broadcastContent = 'Deterministic supervisor broadcast.';
  supervisors[0].broadcastCreatedAt = FIXED_DATE;

  const students = Array.from({ length: 18 }, (_, index) => ({
    ...baseUser({
      _id: objectId('3', index + 1),
      name: `Local Student ${index + 1}`,
      email: `student${index + 1}@local.example.test`,
      rollNo: `F26-${String(index + 1).padStart(4, '0')}`,
      role: 'student',
      password,
    }),
    program: ['BSCS', 'BSAI', 'BSSE'][index % 3],
    batch: ['Fall 2023', 'Spring 2024'][index % 2],
    semester: '7th Semester',
    lateRegistrationDays: index % 5 === 0 ? 3 : 0,
    lateRegistrationFine: index % 5 === 0 ? 30 : 0,
    lateRegistrationFineStatus: index % 10 === 0 ? 'resolved' : 'pending',
  }));
  students[6].studentMessageId = 'functional-message-1';
  students[6].studentMessageType = 'text';
  students[6].studentMessageContent = 'Deterministic student message.';
  students[6].studentMessageCreatedAt = FIXED_DATE;

  const proposalKey = `proposals/${students[14]._id}/functional-baseline.pdf`;
  const statuses = [
    'Unassigned',
    'Pending',
    'Submitted For Review',
    'Document Approved',
    'Approved',
    'Rejected',
    'Pending',
    'Submitted For Review',
    'Approved',
  ];
  const projects = Array.from({ length: 9 }, (_, index) => baseProject(
    index,
    students.slice(index * 2, index * 2 + 2),
    index === 0 ? null : supervisors[index % supervisors.length]._id,
    statuses[index],
    index === 7 ? proposalKey : ''
  ));
  setOccupiedSlots(supervisors, projects);

  await User.insertMany([admin, ...supervisors, ...students], { limit: 25 });
  await Project.insertMany(projects, { limit: 25 });
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: proposalKey,
    Body: PDF,
    ContentType: 'application/pdf',
  }));
  await SystemConfig.updateOne(
    { configKey: 'storage' },
    { $set: { usedBytes: PDF.length, updatedAt: FIXED_DATE } },
    { timestamps: false }
  );
  await seedSharedDocuments();

  const round = {
    _id: objectId('5', 1),
    name: 'Canonical local Viva round',
    targetPanelSize: 2,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    extraGradingDurationMinutes: null,
    projectIds: projects.slice(1, 5).map(({ _id }) => _id),
    examinerIds: supervisors.map(({ _id }) => _id),
    panelRevision: 1,
    scheduleRevision: 1,
    heldProjectIds: [],
    confirmedAt: FIXED_DATE,
    frozenAt: FIXED_DATE,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
  const panel = {
    _id: objectId('6', 1),
    roundId: round._id,
    examinerIds: supervisors.slice(0, 2).map(({ _id }) => _id),
    panelAdminId: supervisors[0]._id,
    locationLabel: 'Local Viva Lab',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
  const snapshots = (project) => ({
    roundSnapshot: roundSnapshot(),
    projectSnapshot: projectSnapshot(
      project,
      project.members.map((memberId) => students.find(({ _id }) => _id.equals(memberId))),
      supervisors.find(({ _id }) => _id.equals(project.supervisorId))
    ),
    panelSnapshot: panelSnapshot(panel, supervisors.slice(0, 2)),
  });
  const sessions = [
    {
      _id: objectId('7', 1),
      roundId: round._id,
      panelId: panel._id,
      projectId: projects[1]._id,
      scheduledAt: new Date('2030-01-15T09:00:00.000Z'),
      locationLabel: panel.locationLabel,
      ...snapshots(projects[1]),
    },
    {
      _id: objectId('7', 2),
      roundId: round._id,
      panelId: panel._id,
      projectId: projects[2]._id,
      scheduledAt: new Date('2026-10-01T09:00:00.000Z'),
      locationLabel: panel.locationLabel,
      startedAt: new Date('2026-10-01T09:00:00.000Z'),
      vivaEndsAt: new Date('2030-01-15T10:00:00.000Z'),
      ...snapshots(projects[2]),
    },
    {
      _id: objectId('7', 3),
      roundId: round._id,
      panelId: panel._id,
      projectId: projects[3]._id,
      scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
      locationLabel: panel.locationLabel,
      startedAt: new Date('2026-09-01T09:00:00.000Z'),
      vivaEndsAt: new Date('2026-09-01T09:30:00.000Z'),
      completedAt: new Date('2026-09-01T09:25:00.000Z'),
      publishedAt: new Date('2026-09-01T09:26:00.000Z'),
      result: { grade: 'A', percentage: 90, selectedAt: new Date('2026-09-01T09:20:00.000Z') },
      ...snapshots(projects[3]),
    },
  ].map((session) => ({
    ...session,
    cancelledAt: null,
    version: 0,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  }));

  await VivaRound.create(round);
  await VivaPanel.create(panel);
  await VivaSession.insertMany(sessions);
  await VivaParticipantLock.insertMany([
    ...projects[2].members.map((userId) => ({
      userId,
      sessionId: sessions[1]._id,
      participantType: 'student',
      restrictPortal: true,
      createdAt: FIXED_DATE,
    })),
    {
      userId: supervisors[1]._id,
      sessionId: sessions[1]._id,
      participantType: 'examiner',
      restrictPortal: true,
      createdAt: FIXED_DATE,
    },
  ]);

  return {
    profile,
    credentials: {
      password: SEEDED_PASSWORD,
      admin: admin.rollNo,
      supervisor: supervisors[0].rollNo,
      student: students[6].rollNo,
      proposalStudent: students[14].rollNo,
      restrictedStudent: students[4].rollNo,
    },
    counts: { users: 22, projects: 9, vivaRounds: 1, vivaPanels: 1, vivaSessions: 3, objects: 1 },
  };
}

async function seedPerformance(password) {
  const studentCount = envCount('M2_STUDENT_COUNT', 5_000, 20, 9_999);
  const supervisorCount = envCount('M2_SUPERVISOR_COUNT', 500, 4, 9_999);
  const projectCount = envCount('M2_PROJECT_COUNT', 2_500, 10, Math.floor(studentCount / 2));
  const vivaSessionCount = envCount(
    'M2_VIVA_SESSION_COUNT',
    500,
    1,
    Math.min(projectCount - Math.ceil(projectCount / 10), supervisorCount)
  );
  const admin = baseUser({
    _id: objectId('1', 1),
    name: 'Performance Admin',
    email: 'admin@performance.example.test',
    rollNo: 'A26-0001',
    role: 'admin',
    password,
  });
  const supervisors = Array.from({ length: supervisorCount }, (_, index) => baseUser({
    _id: objectId('2', index + 1),
    name: `Performance Supervisor ${String(index + 1).padStart(4, '0')}`,
    email: `supervisor${index + 1}@performance.example.test`,
    rollNo: `E26-${String(index + 1).padStart(4, '0')}`,
    role: 'supervisor',
    password,
  }));
  const students = Array.from({ length: studentCount }, (_, index) => ({
    ...baseUser({
      _id: objectId('3', index + 1),
      name: `Performance Student ${String(index + 1).padStart(5, '0')}`,
      email: `student${index + 1}@performance.example.test`,
      rollNo: `F26-${String(index + 1).padStart(4, '0')}`,
      role: 'student',
      password,
    }),
    program: ['BSCS', 'BSAI', 'BSTN', 'BSSE', 'BSCYS', 'BSROB', 'BSDS'][index % 7],
    batch: ['Fall 2022', 'Spring 2023', 'Fall 2023', 'Spring 2024'][index % 4],
    semester: `${7 + (index % 2)}th Semester`,
    isActive: index % 50 !== 0,
    lateRegistrationDays: index % 8 === 0 ? 5 : 0,
    lateRegistrationFine: index % 8 === 0 ? 50 : 0,
    lateRegistrationFineStatus: index % 24 === 0 ? 'resolved' : 'pending',
  }));
  const statuses = ['Pending', 'Submitted For Review', 'Document Approved', 'Approved', 'Rejected'];
  const projects = Array.from({ length: projectCount }, (_, index) => {
    const status = index % 10 === 0 ? 'Unassigned' : statuses[index % statuses.length];
    const studentsForProject = students.slice(index * 2, index * 2 + 2);
    const pdfUrl = ['Submitted For Review', 'Document Approved'].includes(status)
      ? `proposals/${studentsForProject[0]._id}/performance-${index + 1}.pdf`
      : '';
    return baseProject(
      index,
      studentsForProject,
      index % 10 === 0 ? null : supervisors[index % supervisorCount]._id,
      status,
      pdfUrl
    );
  });
  setOccupiedSlots(supervisors, projects);

  await User.insertMany([admin, ...supervisors, ...students], { limit: 50 });
  await Project.insertMany(projects, { limit: 50 });
  const pdfProjects = projects.filter(({ pdfUrl }) => pdfUrl);
  for (let offset = 0; offset < pdfProjects.length; offset += 50) {
    await Promise.all(pdfProjects.slice(offset, offset + 50).map(({ pdfUrl }) => s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: pdfUrl,
      Body: PDF,
      ContentType: 'application/pdf',
    }))));
  }
  await SystemConfig.updateOne(
    { configKey: 'storage' },
    { $set: { usedBytes: PDF.length * pdfProjects.length, updatedAt: FIXED_DATE } },
    { timestamps: false }
  );
  await seedSharedDocuments();

  const vivaProjects = projects.filter(({ supervisorId }) => supervisorId).slice(0, vivaSessionCount);
  const studentsById = new Map(students.map((student) => [String(student._id), student]));
  const supervisorsById = new Map(supervisors.map((supervisor) => [String(supervisor._id), supervisor]));
  const panelCount = Math.min(Math.ceil(vivaSessionCount / 2), Math.floor(supervisorCount / 2));
  const vivaSupervisors = supervisors.slice(0, panelCount * 2);
  const round = {
    _id: objectId('5', 1),
    name: 'Canonical performance Viva round',
    targetPanelSize: 2,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    projectIds: vivaProjects.map(({ _id }) => _id),
    examinerIds: vivaSupervisors.map(({ _id }) => _id),
    panelRevision: 1,
    scheduleRevision: 1,
    heldProjectIds: [],
    confirmedAt: FIXED_DATE,
    frozenAt: FIXED_DATE,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
  const panels = Array.from({ length: panelCount }, (_, index) => {
    const examiners = supervisors.slice(index * 2, index * 2 + 2);
    return {
      _id: objectId('6', index + 1),
      roundId: round._id,
      examinerIds: examiners.map(({ _id }) => _id),
      panelAdminId: examiners[0]._id,
      locationLabel: `Performance Lab ${index + 1}`,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    };
  });
  const sessions = Array.from({ length: vivaSessionCount }, (_, index) => {
    const project = vivaProjects[index];
    const panel = panels[index % panels.length];
    const examiners = panel.examinerIds.map((examinerId) => supervisorsById.get(String(examinerId)));
    return {
      _id: objectId('7', index + 1),
      roundId: round._id,
      panelId: panel._id,
      projectId: project._id,
      scheduledAt: new Date(Date.UTC(2030, 0, 15, 8, index)),
      locationLabel: panel.locationLabel,
      cancelledAt: null,
      roundSnapshot: roundSnapshot(round.name),
      projectSnapshot: projectSnapshot(
        project,
        project.members.map((memberId) => studentsById.get(String(memberId))),
        supervisorsById.get(String(project.supervisorId)),
        false
      ),
      panelSnapshot: panelSnapshot(panel, examiners),
      version: 0,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    };
  });

  await VivaRound.create(round);
  await VivaPanel.insertMany(panels, { limit: 50 });
  await VivaSession.insertMany(sessions, { limit: 50 });

  return {
    profile,
    credentials: {
      password: SEEDED_PASSWORD,
      admin: admin.rollNo,
      supervisor: supervisors[1].rollNo,
      student: students[1].rollNo,
      proposalStudent: students[2].rollNo,
    },
    counts: {
      users: 1 + supervisorCount + studentCount,
      projects: projectCount,
      vivaRounds: 1,
      vivaPanels: panelCount,
      vivaSessions: vivaSessionCount,
      objects: pdfProjects.length,
    },
  };
}

await mongoose.connect(mongoUri, { autoCreate: false, autoIndex: false });
try {
  await resetLocalState();
  if (profile === 'reset') {
    console.log(JSON.stringify({ profile, counts: { systemConfigs: 1, objects: 0 } }, null, 2));
  } else {
    const password = await localPasswordHash();
    const result = profile === 'functional'
      ? await seedFunctional(password)
      : await seedPerformance(password);
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await Promise.allSettled([mongoose.disconnect(), s3.destroy()]);
}
