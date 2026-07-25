# Data and Storage Contracts

Generated from repository source at commit `443dc1572fa90a66a4f40ca3f9f3dbeb7fbe86d6` on 2026-07-25T15:58:30.945Z.

## Safety rule

This document records existing contracts. It does not change schemas, records, collections, indexes, environment-variable names, R2 buckets, object keys, public URLs, or browser-storage keys.

## Mongoose model inventory

Field detection lists top-level schema keys that can be identified statically. The model source remains canonical, especially for nested objects, arrays, defaults, indexes, hooks, and legacy compatibility fields.

| Model source | Detected top-level fields |
|---|---|
| `models/Headline.ts` | isActive, text |
| `models/Project.ts` | domain, domains, inviteCode, maxTeamSize, members, pdfSize, pdfUrl, status, supervisorId, title, titleFingerprint |
| `models/RateLimit.ts` | — |
| `models/RegistrationPolicy.ts` | amount, category, description, enabled, title |
| `models/SystemConfig.ts` | configKey, usedBytes |
| `models/User.ts` | batch, broadcastContent, broadcastCreatedAt, broadcastSize, broadcastType, domain, domains, email, isActive, lastLoginMonth, lastPasswordChange, lastProgramBatchChangeAt, lateRegistrationDays, lateRegistrationFine, lateRegistrationFineResolvedAt, migrationCode, monthlyLoginCount, name, notificationsEnabled, password, pdfUrl, program, projectDesc, projectId, projectTitle, remarks, resetCode, resetCodeExpiry, role, rollNo, semester, status, supervisorId, tools |
| `models/VoiceNote.ts` | blobUrl, fileSize, isPlayed, playedAt, projectId, senderId |

## Environment-variable inventory

| Variable | Source files |
|---|---|
| `CI` | next.config.ts |
| `CRON_SECRET` | app/api/cron/voice-cleanup/route.ts |
| `EMAIL_APP_PASSWORD` | lib/mailer.ts |
| `EMAIL_FROM_NAME` | lib/mailer.ts |
| `EMAIL_REPLY_TO` | lib/mailer.ts |
| `EMAIL_USER` | lib/mailer.ts |
| `MONGODB_URI` | lib/mongodb.ts |
| `NEXT_RUNTIME` | instrumentation.ts |
| `NEXTAUTH_SECRET` | app/api/auth/[...nextauth]/route.ts, lib/security/auth.ts |
| `R2_ACCESS_KEY_ID` | lib/s3-client.ts |
| `R2_ACCOUNT_ID` | lib/s3-client.ts |
| `R2_BUCKET_NAME` | lib/s3-client.ts |
| `R2_SECRET_ACCESS_KEY` | lib/s3-client.ts |
| `RESEND_API_KEY` | lib/mailer-resend-backup.ts |

## R2-compatible storage evidence

The following source lines contain storage clients, key fields, object-key variables, or R2 environment references. Preserve their effective values and ownership rules during refactoring.

- app/api/cron/voice-cleanup/route.ts:48 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
- app/api/cron/voice-cleanup/route.ts:78 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
- app/api/dashboard/student/route.ts:341 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }))
- app/api/dashboard/student/route.ts:35 — key: string;
- app/api/dashboard/student/route.ts:589 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }))
- app/api/dashboard/student/route.ts:64 — function getR2ObjectKey(value: string) {
- app/api/dashboard/student/route.ts:77 — const key = getR2ObjectKey(fileUrl || '');
- app/api/dashboard/student/route.ts:837 — const uploadedKey = getR2ObjectKey(String(body.pdfUrl));
- app/api/dashboard/student/route.ts:844 — new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: uploadedKey })
- app/api/dashboard/student/route.ts:848 — await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: uploadedKey }));
- app/api/dashboard/student/route.ts:867 — await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
- app/api/dashboard/student/route.ts:871 — console.log(`🧹 PDF Orphan Prevention: Wiped old proposal blob -> ${keyToDelete}`);
- app/api/dashboard/student/route.ts:93 — key: target.key,
- app/api/dashboard/supervisor/broadcast/route.ts:40 — await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
- app/api/dashboard/supervisor/broadcast/route.ts:98 — await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
- app/api/dashboard/supervisor/route.ts:226 — await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }));
- app/api/dashboard/supervisor/route.ts:228 — console.log(`Timeline advance cleanup: deleted previous stage PDF -> ${target.key}`);
- app/api/dashboard/supervisor/route.ts:24 — key: string;
- app/api/dashboard/supervisor/route.ts:28 — function getR2ObjectKey(value: string) {
- app/api/dashboard/supervisor/route.ts:41 — const key = getR2ObjectKey(fileUrl || '');
- app/api/read-pdf/route.ts:25 — Key: key,
- app/api/upload/route.ts:79 — Key: key,
- app/api/voice/route.ts:44 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: note.blobUrl }))
- app/api/voice/route.ts:83 — !isOwnedVoiceKey(blobUrl, currentUser.id, String(projectId))) {
- app/api/voice/route.ts:9 — import { isOwnedVoiceKey } from '../../../lib/security/voice';
- app/api/voice/route.ts:92 — const object = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: blobUrl }));
- app/api/voice/upload/route.ts:46 — // A voice-note key is bound to both its sender and its project. The no-project
- app/api/voice/upload/route.ts:55 — Key: key,
- components/admin/RegistrationControlPanel.tsx:99 — key: K,
- components/dashboards/StudentDashboard.tsx:133 — const getSafePdfKey = (url?: string) => {
- components/dashboards/StudentDashboard.tsx:139 — const key = getSafePdfKey(url);
- components/dashboards/StudentDashboard.tsx:140 — return key ? `/api/read-pdf?url=${encodeURIComponent(key)}` : '';
- components/dashboards/StudentDashboard.tsx:1491 — href={`/api/read-pdf?url=${encodeURIComponent(getSafePdfKey(pdfUrl))}`}
- components/dashboards/SupervisorDashboard.tsx:1087 — selectedPdfKey ? (
- components/dashboards/SupervisorDashboard.tsx:1089 — href={`/api/read-pdf?url=${encodeURIComponent(selectedPdfKey)}`}
- components/dashboards/SupervisorDashboard.tsx:127 — const getSafePdfKey = (url?: string) => {
- components/dashboards/SupervisorDashboard.tsx:597 — const pdfKey = getSafePdfKey(project.pdfUrl);
- components/dashboards/SupervisorDashboard.tsx:686 — {pdfKey ? 'PDF attached' : 'No PDF attached'}
- components/dashboards/SupervisorDashboard.tsx:943 — const selectedPdfKey = getSafePdfKey(selectedProject?.pdfUrl);
- lib/academicReset.ts:102 — key: target.key,
- lib/academicReset.ts:231 — s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }))
- lib/academicReset.ts:26 — key: string;
- lib/academicReset.ts:73 — function getR2ObjectKey(value: string) {
- lib/academicReset.ts:86 — const key = getR2ObjectKey(fileUrl || '');
- lib/s3-client.ts:10 — endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
- lib/s3-client.ts:12 — accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
- lib/s3-client.ts:13 — secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
- lib/s3-client.ts:18 — export const BUCKET_NAME = process.env.R2_BUCKET_NAME || "fyp-portal";
- lib/s3-client.ts:4 — if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {

## Browser-storage keys

| Key | Source |
|---|---|
| `fyp_theme` | `app/page.tsx` |

## Project-stage values

- `FINAL_DELIVERABLES`
- `PROPOSAL`
- `THESIS_DRAFT`

## Installed dependency contract

No dependency was added for Milestones 0–2. Existing packages are reused; Node's standard test runner provides the initial test command.

| Package | Version range |
|---|---|
| `@aws-sdk/client-s3` | `^3.1079.0` |
| `@aws-sdk/s3-request-presigner` | `^3.1079.0` |
| `@sentry/nextjs` | `^10.50.0` |
| `@tailwindcss/postcss` | `^4` |
| `@types/node` | `^20` |
| `@types/nodemailer` | `^8.0.0` |
| `@types/react` | `^19` |
| `@types/react-dom` | `^19` |
| `bcryptjs` | `^3.0.3` |
| `eslint` | `^9` |
| `eslint-config-next` | `16.1.6` |
| `exceljs` | `^4.4.0` |
| `framer-motion` | `^12.35.2` |
| `lucide-react` | `^0.577.0` |
| `mongoose` | `^9.2.4` |
| `next` | `16.1.6` |
| `next-auth` | `^4.24.13` |
| `nodemailer` | `^7.0.13` |
| `react` | `19.2.3` |
| `react-dom` | `19.2.3` |
| `tailwindcss` | `^4` |
| `typescript` | `^5` |

## Data and storage invariants

- Existing MongoDB collection and field names remain unchanged.
- Existing optional, required, default, enum, legacy, and nested field behavior remains unchanged.
- Existing R2 bucket configuration and key-generation rules remain unchanged.
- Existing PDFs, voice notes, and public/signed URLs are not moved, renamed, copied, or deleted by cleanup work.
- Tests must mock database, storage, email, and monitoring boundaries and must never use production credentials.
