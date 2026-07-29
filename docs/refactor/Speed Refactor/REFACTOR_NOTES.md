# Refactor Notes

**Audit date:** 2026-07-29  
**Repository state audited:** `main` at `3600b09` (`Merge branch 'Code-Cleanup'`)  
**Scope:** MongoDB/Mongoose, Cloudflare R2/S3, local/browser storage, the callers that amplify those operations, data integrity, security, and response latency.  
**Status:** Audit and plan complete; implementation, database measurement, and production migration have not started.

Note: Anything below here will never mess with database and storage. The database and storage are currently in use. We can not risk current data corruption.

## 1. Executive summary

The portal cannot honestly guarantee end-to-end responses in microseconds. A microsecond is `0.001 ms`; crossing a process boundary, opening or borrowing a network connection, executing a MongoDB command, reaching R2, or sending SMTP mail normally costs milliseconds before meaningful application work begins. Cold serverless starts can cost much more. The correct goal is:

- microseconds for pure in-process helpers and warm memory-cache lookups;
- low single-digit milliseconds for simple indexed MongoDB execution when the database is warm and nearby;
- tens to low hundreds of milliseconds for complete warm API requests;
- bounded, asynchronous handling for R2 deletion, email, cleanup, and report generation;
- measured p50/p95/p99 service-level objectives rather than an impossible absolute guarantee.

The highest-priority problems are not small query optimizations. They are security and data-integrity failures that also make latency unpredictable:

1. `POST /api/add-supervisor` relies on middleware and has no route-level admin authorization.
2. Password recovery is based on guessable academic facts and returns a reset bearer token to the requester; this is not strong account recovery.
3. Supervisor capacity uses count-then-write checks. A MongoDB transaction does not lock a query predicate, so concurrent requests can still overbook a supervisor.
4. PDF submission updates R2, the storage ledger, `Project`, and `User` records without one recoverable workflow. It can delete the old object before the database accepts the replacement.
5. Academic reset and voice-message reads perform irreversible R2 deletion inside MongoDB transactions. R2 cannot roll back if MongoDB aborts.
6. Direct-to-R2 uploads are not reserved atomically, do not enforce the claimed byte count at issuance, and leave abandoned objects with no cleanup record.
7. Audio broadcast publication trusts client-provided type, key, and byte count, allowing a supervisor to corrupt the global storage ledger.
8. Project join retries reuse a `User` document loaded outside the retried transaction. A retry can use mutated stale state and leave a student in multiple project membership arrays.
9. Project state is duplicated across `User` and `Project` without a single canonical writer, so status, supervisor, title, domains, PDF key, and membership can drift.
10. Heavy reads are over-querying: admin reports launch fourteen direct database operations in parallel, a normal student page load can cause ten database operations across four endpoints, and secure object reads query three collections before checking access.

No new cache service or performance dependency should be added first. The smallest reliable path is to fix authorization and invariants, remove provably redundant calls, use exact projections and existing indexes/native MongoDB features, then add caching only where measurements show it is useful.

## 2. Latency contract

### 2.1 Initial measurable budgets

These are starting budgets to validate in a production-like environment, not claims that the current system meets them.

| Work | Initial target | Measurement |
|---|---:|---|
| Pure normalization, mapping, policy helpers | p95 under 100 microseconds per call | Node benchmark after warm-up |
| Warm in-process cached lookup | p95 under 250 microseconds | Node benchmark |
| Simple indexed MongoDB command | p95 under 10 ms database execution time | `explain('executionStats')` and MongoDB command spans |
| Public cached API (`headline`, policy, supervisor list) | p95 under 30 ms warm, zero MongoDB calls on a cache hit | HTTP load test plus DB command count |
| Authenticated single-purpose API | p95 under 100 ms warm | end-to-end server timing |
| Student/supervisor dashboard API | p95 under 200 ms warm | end-to-end server timing |
| Transactional mutation excluding background work | p95 under 300 ms warm | end-to-end server timing |
| R2 HEAD/DELETE operation | observe first; initial p95 budget 250 ms | AWS SDK spans by operation |
| Direct file upload | size/network SLO, not a fixed microsecond target | browser Resource Timing by size |
| Admin report | p95 under 500 ms for agreed maximum dataset | endpoint timing plus aggregation explain |

Every SLO must also define p99, error rate, dataset size, warm/cold status, deployment region, MongoDB region/tier, R2 location, and concurrency. “Fast on one developer laptop” is not an acceptance test.

### 2.2 What must not be sacrificed for latency

- Keep active-user database revalidation for protected routes; do not trust a JWT role forever just to save one read.
- Do not cache private personalized responses in a shared cache.
- Do not remove file verification, authorization, rate limits, transactions, or denied-path tests.
- Do not fire-and-forget critical work from a serverless request. Use a durable outbox/job record.
- Do not equate fewer database calls with faster execution without comparing query plans and p95 latency.

## 3. Complete external-I/O inventory

### 3.1 Calls implicit in many routes

The route tables below list calls made by the route or named helper. Add these common costs when calculating a request:

| Helper/operation | Current database behavior |
|---|---|
| `requireCurrentUser()` | Connects if needed, then `User.findOne({_id, isActive:true}).select('_id role').lean()` once per protected request. |
| `hasProjectAccess()` | `Project.exists()` once. |
| `canAccessStoredObject()` | Starts `Project.findOne`, `VoiceNote.findOne`, and `User.findOne` in parallel; then may call `hasProjectAccess()` or `User.exists()`. |
| `getOrCreateRegistrationPolicy()` | Uses `RegistrationPolicy.findOneAndUpdate(..., upsert:true)` even on read paths. |
| `getTeamFineRestriction()` | `User.find()` for outstanding fines in the student's team/current account. |
| `consumeRateLimit()` / refund | One atomic `RateLimit.findOneAndUpdate()` per consume and one `RateLimit.updateOne()` per refund. |
| `connectToDatabase()` | No database command when the module cache is warm, but a cold invocation performs connection/server selection and authentication. |
| Mongoose `populate()` | Executes an additional query even though only one query builder is visible in source. |
| MongoDB transaction | Commit/abort adds driver/server work beyond the model calls listed below. |

### 3.2 MongoDB calls by API route

Calls are conditional where the route has multiple actions. `document.save` means a Mongoose document write. The implicit authorization read above is not repeated in every row.

| Route | Direct database operations |
|---|---|
| `app/api/add-supervisor/route.ts` | `User` document save. |
| `app/api/admin/fines/route.ts` | `User.find`; policy read/upsert; up to one policy `findOneAndUpdate`; clear action uses `User.findOne` then `User.findOneAndUpdate`. |
| `app/api/admin/project-reviews/route.ts` | GET delegates to review queue helper; POST delegates to `reviewProject`. |
| `app/api/admin/promote-batch/route.ts` | `User.updateMany`. |
| `app/api/admin/registration-policy/route.ts` | GET policy read/upsert; PUT `RegistrationPolicy.findOne` then `findOneAndUpdate`. |
| `app/api/admin/reports/route.ts` | `User.find` for supervisors; six `User.aggregate` calls; two unbounded fine `User.find` calls; three `Project.aggregate` calls; `User.countDocuments`; `Project.countDocuments` — fourteen direct operations. |
| `app/api/admin/students/route.ts` | `User.distinct('batch')`; paginated path `User.find` plus `countDocuments`; legacy no-parameter path returns an unbounded `User.find`. |
| `app/api/admin/supervisors/route.ts` | `User.find` plus one conditional `User.aggregate` or `Project.aggregate`. |
| `app/api/admin/toggle-student/route.ts` | `User.findByIdAndUpdate`. |
| `app/api/admin/update-batch/route.ts` | Delegates to `resetStudentAcademicInfo` below. |
| `app/api/admin/update-email/route.ts` | `User.findOne` duplicate check then `findByIdAndUpdate`. |
| `app/api/admin/update-program/route.ts` | Delegates to `resetStudentAcademicInfo` below. |
| `app/api/admin/update-supervisor-slots/route.ts` | `User.findOneAndUpdate`. |
| `app/api/auth/[...nextauth]/route.ts` | Rate-limit consume; exact `User.findOne` and conditional legacy-regex `findOne`; one login-counter `findByIdAndUpdate`; legacy password migration also saves the document. |
| `app/api/auth/forgot-password/route.ts` | Delegates to password-reset service below. |
| `app/api/auth/reset-password/route.ts` | Delegates to password-reset service below. |
| `app/api/cron/voice-cleanup/route.ts` | Unbounded `VoiceNote.find`, `VoiceNote.deleteMany`, unbounded `User.find`, `User.bulkWrite`, and `SystemConfig.findOneAndUpdate`. |
| `app/api/dashboard/student/route.ts` GET | `User.findOne`; optional policy read/upsert; supervisor `User.findById`; `Project.findById` plus populated-member `User` query; team-fine `User.find`. |
| `app/api/dashboard/student/route.ts` academic reset | Opens a session; `User.findById`; `Project.findById`; conditional `VoiceNote.find` and `deleteMany`; project delete/update; two storage-ledger writes; creates/saves a project; saves student. This duplicates `lib/academicReset.ts`. |
| `app/api/dashboard/student/route.ts` supervisor change | Opens a session; student and target-supervisor reads; capacity count; old-project read; conditional voice read/delete; project delete/update; two ledger writes; project save; student save. |
| `app/api/dashboard/student/route.ts` supervisor assignment | Opens a session; student and supervisor reads; capacity count; project update; team `User.updateMany` or student update. |
| `app/api/dashboard/student/route.ts` submission | Student read; team-fine read; duplicate-project read; target-project read; optional ledger update; parallel project/team writes; redundant student re-fetch; supervisor read. |
| `app/api/dashboard/supervisor/broadcast/route.ts` | POST and DELETE each read and save the supervisor, then conditionally update `SystemConfig`. |
| `app/api/dashboard/supervisor/route.ts` GET | Unprojected `User.find` for students; supervisor `findById`; `Project.find` for project IDs. |
| `app/api/dashboard/supervisor/route.ts` migration | Session; target supervisor, student, capacity, and project reads; project saves/updates; student save. |
| `app/api/dashboard/supervisor/route.ts` removal/expand | Removal reads a student then updates project and users outside a transaction; expansion uses `Project.findOneAndUpdate`. |
| `app/api/delete-supervisor/route.ts` | Session; `User.findByIdAndDelete`; `User.updateMany`; `Project.updateMany`. |
| `app/api/export-pdf/route.ts` | Unprojected `User.find`. |
| `app/api/headline/route.ts` | GET `Headline.findOne().sort()`; POST `Headline.deleteMany` then optional `Headline.create`. |
| `app/api/project/join/route.ts` | Student read; rate-limit consume; session with target project, first member, optional supervisor and capacity reads; conditional project/member writes; student save; successful attempt refunds rate limit. |
| `app/api/project/leave/route.ts` | Session with student and project reads, conditional project update, new project save, student save. |
| `app/api/register/route.ts` | Policy read/upsert; duplicate `User.findOne`; redundant `User.exists`; optional supervisor read and capacity count; session policy claim; student save twice and project save once. |
| `app/api/registration-policy/route.ts` | Policy read implemented as an upserting `findOneAndUpdate`. |
| `app/api/supervisors/route.ts` | Public `User.find` plus one conditional `User.aggregate` or `Project.aggregate`. |
| `app/api/supervisors/toggle-notifications/route.ts` | `User.findByIdAndUpdate`. |
| `app/api/templates/route.ts` | For students, `User.findById` then `Project.findById`. |
| `app/api/upload/route.ts` | Student `User.findOne`; team-fine `User.find`; `SystemConfig.findOne`. |
| `app/api/voice/route.ts` GET | Project access read; session; expired-note `VoiceNote.find`; conditional note delete and ledger update; final `VoiceNote.find` plus populated-sender `User` query. |
| `app/api/voice/route.ts` POST | Project access read; `VoiceNote` save; `SystemConfig.findOneAndUpdate`. |
| `app/api/voice/route.ts` PATCH | `VoiceNote.findById`; project access read; `VoiceNote.findByIdAndUpdate`. |
| `app/api/voice/upload/route.ts` | `SystemConfig.findOne`; optional project access read. |
| `app/api/read-pdf/route.ts` | Delegates all database work to `canAccessStoredObject`. |

### 3.3 MongoDB calls in shared libraries

| Library | Database operations |
|---|---|
| `lib/academicReset.ts` | Session; user/project/voice reads; voice/project deletes or project update; two ledger writes; project save; student save. |
| `lib/auth/passwordResetService.ts` | Exact and conditional regex user lookup; project-members read; teammate user read; reset-code user update; completion user update; rate-limit consume. |
| `lib/projectReview.ts` | Student, team, project, and supervisor reads; user/project updates; optional same-file `Project.exists`; ledger decrement plus clamp. |
| `lib/projectReviewQueue.ts` | Up to three `User.distinct` filter lookups; `Project.find` and `countDocuments`; related `User.find`. |
| `lib/rateLimit.ts` | One atomic consume update; optional refund update. |
| `lib/registrationPolicy.ts` | Upserting policy read and plain policy read. |
| `lib/security/auth.ts` | Active-user lookup and project-access existence lookup. |
| `lib/security/storage.ts` | Three parallel object-owner lookups plus a possible project/user access lookup. |
| `lib/teamFineRestriction.ts` | Outstanding-fine `User.find`. |

### 3.4 R2/S3 and filesystem calls

`getSignedUrl()` is local signature computation with the configured static credentials; it does not contact R2. The browser request that follows the signed URL is the external object-store call.

| Path | Storage behavior |
|---|---|
| `app/api/upload/route.ts` | Locally signs one `PutObjectCommand`; browser later performs one R2 PUT. |
| `app/api/voice/upload/route.ts` | Locally signs one `PutObjectCommand`; voice/broadcast clients later perform one R2 PUT. |
| `app/api/read-pdf/route.ts` | Locally signs one `GetObjectCommand`; redirected browser later performs the R2 GET. |
| `app/api/dashboard/student/route.ts` | One optional R2 HEAD for a new PDF and up to four distinct R2 DELETE call sites across reset/change/submission branches. |
| `app/api/dashboard/supervisor/broadcast/route.ts` | One R2 DELETE in overwrite and one in clear. It does not HEAD/verify new audio. |
| `app/api/voice/route.ts` | One R2 HEAD during finalization and N R2 DELETE calls during read-time cleanup. |
| `app/api/cron/voice-cleanup/route.ts` | N voice-note deletes and N broadcast deletes, currently launched with unbounded `Promise.all`. |
| `lib/academicReset.ts` | N R2 DELETE calls, currently inside the MongoDB transaction. |
| `lib/projectReview.ts` | One R2 DELETE on stage advance. |
| `app/api/templates/route.ts` | `fs.readFile` once per template on every request: one file for proposal, nine for thesis draft, five for final deliverables. |
| `components/student/api/studentDashboardApi.ts` | Browser R2 PUT for PDFs. |
| `components/ui/VoiceChat.tsx` | Browser R2 PUT for voice notes. |
| `components/broadcast/hooks/useBroadcastSubmit.ts` | Browser R2 PUT for broadcasts. |

### 3.5 Browser storage

| Path | Storage behavior and concern |
|---|---|
| `app/page.tsx` | Reads/writes theme in `localStorage`; reads/writes intro state in `sessionStorage`; theme state is currently set during render. |
| `lib/browserDraftStorage.ts` | Draft text in `localStorage`; selected PDF blobs in IndexedDB. Each file operation opens/closes the database. Records contain `savedAt` but no expiry or quota cleanup. |
| `components/student/hooks/useStudentProjectDraft.ts` | Debounced synchronous local-storage writes every 300 ms after edits; IndexedDB write/delete on file selection. |
| Voice/broadcast/report/download components | Create Blob object URLs. Broadcast recorder/download helpers revoke them, but `VoiceChat` does not revoke its optimistic audio URL when the message is replaced or removed. |

### 3.6 Indexes currently declared in source

This is a source inventory, not proof that the indexes exist in the deployed database. Milestone 0 must compare it with `listIndexes` and `$indexStats`.

| Model | Current declarations | Important gap/overlap |
|---|---|---|
| `User` | Unique `email` (sparse), unique `rollNo`; `role`; `(role, supervisorId)`; `projectId`; `supervisorId`; `(role, createdAt)`; program/batch/status filter compounds. | No migration-code, broadcast-expiry, or fine-status index. Standalone `role` may overlap compound prefixes; optional filter combinations can still require blocking sort. |
| `Project` | Unique `inviteCode`; `titleFingerprint`; `(status, updatedAt)`. | No `supervisorId` or exact `pdfUrl` index despite frequent count/lookup/storage-owner queries. |
| `VoiceNote` | `(projectId, playedAt)`. | Does not match list sort `(projectId, createdAt)`, played filter including `isPlayed`, global cleanup by `createdAt`, or exact `blobUrl`. |
| `RegistrationPolicy` | Unique/indexed `policyKey`. | `unique:true` already creates an index; the extra `index:true` declaration is redundant. |
| `SystemConfig` | Unique/indexed `configKey`. | Same redundant unique/index declaration; `usedBytes` has no non-negative schema guard. |
| `RateLimit` | Unique/indexed `identifier`; TTL on `createdAt` for 3600 seconds. | Same redundant unique/index declaration. TTL cleanup is asynchronous, so a fixed window may last slightly beyond one hour. |
| `Headline` | No explicit index. | GET filters `isActive` and sorts `createdAt`; a singleton removes the need for a growing/sorted collection. |

## 4. Current hot-path cost

These counts are code-path counts, not measured latency. They include the common authorization read where applicable and exclude connection/transaction protocol messages.

| User action | Current cost and bottleneck |
|---|---|
| Student initial page | About 10 MongoDB operations across policy, headline, supervisor list, and dashboard endpoints; 11 when fine-payment policy is needed. Public low-change data is forced to `no-store`. |
| Admin initial page | About 13 MongoDB operations including policy, headline, students, supervisors, and a review-queue data prefetch after 750 ms even if the review tab is never opened. |
| Supervisor initial page | About 5 MongoDB operations including global policy and dashboard; supervisor dashboard reads full student documents. |
| PDF upload + submission | Upload-token step can use 4 MongoDB operations; submission can use roughly 10 more, one R2 HEAD, optional R2 DELETE, and synchronous SMTP. |
| Voice list without expired notes | About 5 MongoDB operations: auth, access, expiration scan, note list, and populate. It opens a transaction even when nothing is deleted. |
| Voice list with expired notes | About 7 database operations plus transaction control and N R2 delete requests launched together. |
| Secure PDF/audio open | Up to 5 MongoDB operations before local URL signing: auth, three owner lookups, and a final project/user relationship check. |
| Project join worst path | Up to 12 database operations including rate-limit consume/refund and transaction work. |
| Admin review queue | 4 database operations without filters; up to 7 with program/search filters. |
| Admin report | 15 database operations including auth; fourteen are launched together against a pool capped at ten connections. Several scan the same collections independently. |

## 5. Findings and required fixes

Priority meaning: **P0** blocks a secure production release; **P1** follows immediately; **P2** is measured hardening/cleanup. “Milestone” refers to section 6.

| ID | Priority | Finding, evidence, and effect | Milestone |
|---|---|---|---|
| SEC-01 | P0 | `app/api/add-supervisor/route.ts` has no `requireCurrentUser(..., ['admin'])`. Middleware is defense in depth and must not be the only authorization layer. Direct/internal invocation or matcher regression can create privileged users. | 1 |
| SEC-02 | P0 | Password recovery accepts public/guessable academic facts and returns a bearer reset token. Supervisor IDs/names are public and batch/program/team facts are discoverable. Replace knowledge-based recovery with proof of mailbox possession or an audited admin-assisted flow. | 1 |
| CAP-01 | P0 | Registration, assignment, change, migration, and join use `countDocuments` followed by a write. Snapshot transactions do not reserve a predicate; concurrent transactions touching different students/projects can both pass. | 2 |
| STO-01 | P0 | Upload issuance checks only `usedBytes >= max`, not `used + requested <= max`; it does not atomically reserve bytes. Concurrent or abandoned PUTs can exceed the cap while remaining absent from the ledger. | 3 |
| STO-02 | P0 | Presigned PUT paths trust declared size/type. R2 metadata can be client supplied, and issuance does not bind a durable reservation. Oversized/invalid abandoned objects are not found by the current cron. | 3 |
| STO-03 | P0 | Broadcast POST trusts `broadcastType`, `broadcastContent`, and `broadcastSize`; it neither checks key ownership nor performs HEAD/content verification. A supervisor can add a negative/huge value or point to an unrelated object and corrupt the ledger. | 1, 3 |
| DATA-01 | P0 | PDF replacement deletes the old R2 object and mutates the ledger before project/team writes have safely committed. Project and user updates run outside a transaction. Partial failure leaves broken references, drift, or a double-counted object. | 3, 4 |
| DATA-02 | P0 | Academic reset and voice GET call R2 inside a MongoDB transaction. If MongoDB aborts after R2 succeeds, the database still references a deleted object; long network calls also hold transaction resources. | 3, 4 |
| DATA-03 | P0 | Join loads `student` outside `withTransactionRetry`. The callback mutates that document; a retried callback can use aborted state and fail to remove membership from a concurrently committed project. Load every mutable document inside each retry. | 4 |
| DATA-04 | P0 | Joining another team deletes an old solo `Project` without deleting/queuing its PDF and voice objects or correcting the storage ledger. | 3, 4 |
| DATA-05 | P1 | Project state is duplicated on `User` and `Project`: supervisor, status, title, domain(s), PDF key, plus membership/projectId in opposite directions. Many writes are not transactional, and observed routes already clear one copy while retaining the other. | 4 |
| DATA-06 | P1 | `reviewProject` checks reviewability from the student copy, deletes a stage PDF before database updates, and updates team/project separately. Concurrent reviews can overwrite each other and failure can retain deleted references. | 3, 4 |
| DATA-07 | P1 | Supervisor removal reads then updates project/users outside a transaction and clears only user project fields while leaving the `Project` content. The next dashboard can display state the removal claimed to reset. | 4 |
| DATA-08 | P1 | `resetStudentAcademicInfo` does not clear `student.domains`, while the duplicate student-route implementation does. Admin academic reset can leave stale domains. | 4 |
| DATA-09 | P1 | `migrationCode` is queried without an index or uniqueness constraint. Duplicate codes select an arbitrary supervisor. | 1, 5 |
| DATA-10 | P1 | Voice-note finalization has no unique key/idempotency guard. Retrying POST can create duplicate note rows and increment `usedBytes` more than once for the same R2 object. | 3 |
| DATA-11 | P1 | Headline replacement is `deleteMany` then `create` without a transaction/singleton key. Creation failure erases the previous headline, and concurrent writes race. | 4 |
| SEC-03 | P1 | Sensitive fields (`password`, reset hash/expiry, migration code) are selected by default. Several routes call unprojected `User.find`/`findOne`, unnecessarily loading secrets into application memory. Use schema `select:false` and explicit `+field` only in authentication/recovery. | 1, 5 |
| SEC-04 | P1 | Several mutation routes accept unchecked IDs/types and omit role filters: delete-supervisor can delete any user ID; toggle-student can update any role; notification toggle can update any user and reports success when no row matched. | 1 |
| SEC-05 | P1 | Public registration has no persistent abuse limit before bcrypt/database work. Login limiting is keyed only by roll number, counts successful logins, and lets an attacker lock a known account. Recovery limits also need trusted-IP plus account dimensions. | 1 |
| SEC-06 | P1 | State-changing cookie-authenticated routes do not explicitly validate same-origin/CSRF. Current JSON/preflight and SameSite behavior help, but route-level default-deny origin checking should be shared and tested. | 1 |
| SEC-07 | P1 | PDF/audio validation trusts stored `Content-Type`; it does not inspect file signatures. A client can upload arbitrary bytes labeled as PDF/WebM. Verify a bounded byte range or route validation through a trusted upload service. | 3 |
| SEC-08 | P1 | Login still accepts plaintext legacy passwords and migrates only on successful login. Complete an offline migration/reset campaign, then remove plaintext comparison. | 1 |
| PERF-01 | P1 | Required indexes are missing or not verified in the deployed database: `Project.supervisorId`, exact non-empty `Project.pdfUrl`, `VoiceNote.blobUrl`, voice cleanup/sort shapes, migration code, and broadcast expiry. Schema declarations alone do not prove production indexes exist. | 5 |
| PERF-02 | P1 | Storage authorization uses suffix regexes over three collections. The regex form defeats exact-key index use and all three collections are queried for every object type. | 5, 6 |
| PERF-03 | P1 | Student dashboard re-reads the authenticated user, performs a separate team-fine query despite already loading project members, and uses populate. Supervisor dashboard reads complete user documents. | 5, 6 |
| PERF-04 | P1 | Admin reports perform fourteen direct operations and repeatedly scan `User`/`Project`. `Promise.all` increases concurrency but does not remove work and exceeds the configured ten-connection pool for one request. | 7 |
| PERF-05 | P1 | Admin review data is prefetched on every admin mount even if never viewed. Public policy/headline/supervisor endpoints are low-change but force database work/no-store behavior on page load. | 6 |
| PERF-06 | P1 | Student submission and project review await Gmail SMTP before returning. SMTP latency and failure are unrelated to the committed portal action. | 8 |
| PERF-07 | P1 | Search uses unanchored case-insensitive regex across many fields, causing collection/index scans. Admin students also retains an unbounded no-parameter response and offset pagination slows at high pages. | 5, 7 |
| STO-04 | P1 | Voice GET mutates data and performs cleanup on every read. The scheduled cron deletes all notes older than 24 hours, launches unbounded R2 calls, removes database rows even when object deletion fails, and refunds all bytes regardless of per-object result. | 3, 8 |
| STO-05 | P1 | Ledger decrement often requires a second “clamp to zero” write, while other paths never clamp. Negative values are allowed by the schema. The ledger is neither transactional nor reconcilable today. | 3 |
| TEST-01 | P1 | `node --test tests/*.test.mjs` fails in three structural files. Assertions still expect dialog/student logic in old monolithic locations after the completed modularization, so the required verification gate is red and cannot protect future work. | 0, 9 |
| PERF-08 | P2 | Many routes call `connectToDatabase()` again after `requireCurrentUser()`. This is usually a warm in-memory return rather than another MongoDB command, but it is redundant code/await overhead and obscures real call counts. | 6 |
| PERF-09 | P2 | Login counter read-then-branch update loses increments at a month boundary under concurrency. Use one atomic update pipeline, or remove the counter if it has no product use. | 4 |
| PERF-10 | P2 | Template HTML is read from disk on every request (up to nine parallel reads) even though files are deployment-static. Memoize at module scope or serve static versioned assets. | 6 |
| PERF-11 | P2 | Connection settings use `minPoolSize:1` and `maxPoolSize:10` per warm serverless instance. Many instances can multiply connections; no measured pool-wait/checkout data currently justifies these values. | 0, 7 |
| SEC-09 | P2 | R2 configuration warns and supplies empty credentials/default bucket instead of failing closed. Several inputs (headline, project text, filename/key length, invite/migration codes) are unbounded at the trust boundary. | 1 |
| SEC-10 | P2 | Logs include storage keys and broad error objects that may contain internal keys, provider details, or personal data. Mailer logs the provider message ID. Use structured allowlisted fields and Sentry spans without secrets. | 0, 1 |
| UI-01 | P2 | Voice client does not check the note-finalization response, can report success while leaving an orphan, leaks optimistic Blob URLs, and fire-and-forgets PATCH. Broadcast clear also treats any HTTP response as success. | 9 |
| UI-02 | P2 | Browser draft records have no expiry/cleanup and can retain a proposal PDF indefinitely on shared devices. Synchronous local-storage writes can become janky because server inputs are not currently bounded. | 1, 9 |
| OPS-01 | P2 | Build warns that the Next.js 16 `middleware.ts` convention is deprecated in favor of `proxy.ts`. Migrate after critical fixes, retaining route-level authorization regardless. | 10 |
| OPS-02 | P2 | CSP permits `'unsafe-eval'`, `'unsafe-inline'`, and any HTTPS `connect-src`; stale `pdfkit`/`date-fns` config entries remain despite absent dependencies. Tighten based on production traces and remove dead config. | 10 |

## 6. Milestone plan

Milestones are ordered by risk, not by how easy the code is. Each milestone is independently deployable and has an explicit exit gate. Avoid a single big-bang refactor.

### Milestone 0 — Reproducible baseline and red tests

1. Create a sanitized production-like dataset at agreed sizes (for example 1k, 10k, and expected three-year maximum users/projects) without copying passwords, reset hashes, emails, storage URLs, or other personal data.
2. Record deployment and MongoDB/R2 regions, MongoDB tier, Vercel runtime, warm/cold status, and connection pool settings.
3. Add sanitized Sentry spans/`Server-Timing` for auth, pool checkout, each logical database group, R2 operation, mapping, response serialization, and SMTP enqueue. Never attach query values, object keys, tokens, or personal fields.
4. Capture `listIndexes`, `$indexStats`, and `explain('executionStats')` for every query shape in section 3. Save plan summaries: winning index, execution time, keys/docs examined, returned rows, sort stage, and memory spill. Run this on staging, not production request paths.
5. Measure endpoint p50/p95/p99 at concurrency 1, 10, and expected peak. Separate cold starts from warm requests and count actual MongoDB commands.
6. Repair the three stale structural tests so they assert the focused modules/current boundaries. Do not move implementation back into barrels/monoliths to satisfy stale regexes.
7. Add failing regression tests for route-level supervisor creation authorization, capacity races, upload reservation, idempotent finalize, transaction rollback, and R2 failure ordering.
8. Back up MongoDB and export current R2 object/ledger reconciliation totals before any migration.

**Exit gate:** reliable green baseline suite; benchmark report with environment and data size; every P0 bug has a failing test; no production secrets in fixtures or telemetry.

### Milestone 1 — Immediate authorization and trust-boundary fixes

1. Add `requireCurrentUser(req, ['admin'])` inside `add-supervisor`; change the handler to `NextRequest`.
2. Add valid ObjectId checks, strict booleans/enums, normalized bounded text, exact role filters, `runValidators:true`, and matched-row checks to delete supervisor, toggle student, notification toggle, email update, promotion, headline, broadcast, and all project actions.
3. Ensure delete-supervisor filters `{_id, role:'supervisor'}` and toggles filter the intended role. Decide and test whether the last/only admin may be modified.
4. Replace academic-knowledge password recovery with a random, short-lived, single-use emailed link whose token is SHA-256/HMAC hashed at rest and consumed atomically. If email recovery cannot be delivered immediately, disable self-service recovery and use an authenticated, audited admin reset rather than keeping KBA.
5. Add trusted-IP plus account-key persistent limits for login, registration, recovery request, reset completion, upload issuance, voice finalization, and public expensive searches. Hash personal identifiers used in rate-limit keys. Successful login must not consume the same budget as failed authentication.
6. Set schema `select:false` for `password`, reset hash/expiry, and migration code. Add explicit projections everywhere; login/recovery opt in to only the secret fields they require.
7. Complete legacy password migration/reset and remove plaintext equality fallback after an announced cutoff.
8. Add one shared same-origin guard for cookie-authenticated mutations and denied-origin tests. Keep NextAuth CSRF behavior and middleware as additional layers.
9. Validate R2 configuration on first storage use and fail closed; remove the production fallback bucket/empty credentials. Bound filenames and every text/code field at the route and schema layers.
10. Stop logging storage keys, broad provider/Mongoose errors, or personal fields. Log stable event names, safe error classes/codes, and correlation IDs.

**Exit gate:** unauthorized/invalid-role/invalid-ID/CSRF/rate-limit tests pass; no public route can create a supervisor; recovery requires a possessed channel; secret fields are absent from normal queries and responses.

### Milestone 2 — Atomic supervisor capacity

1. Confirm whether both slot modes are real requirements. Production is configured for `PROJECT`; if `STUDENT` mode is unused, delete the flag and inactive branches. Supporting one invariant is safer and smaller.
2. Add `occupiedSlots` to supervisors (or a focused capacity document if both modes must remain). Backfill it from canonical projects/students in a one-off migration and produce a mismatch report before writing.
3. Implement one conditional reservation operation using `_id`, role, and `$expr` so increment succeeds only when `occupiedSlots < MAX_SLOTS_PER_SUPERVISOR + extraSlots`. This single write is the lock; `countDocuments` is not.
4. Implement a non-negative release operation and put reserve/release in the same MongoDB transaction as the project/student mutation.
5. Route every capacity-changing flow through the shared operations: registration, first assignment, supervisor change, supervisor migration, team split, removal/unassignment, solo-project deletion during reset/join, and supervisor deletion. If `STUDENT` mode remains, include join/leave too.
6. Keep counts for display as either the atomic counter or an audited aggregation; do not mix two sources silently.
7. Add a reconciliation command that compares counters with canonical records, reports drift, and repairs only under explicit operator control.
8. Add barrier-based concurrency tests where `maxSlots + N` simultaneous attempts yield exactly `maxSlots` successes and no negative/leaked reservations after injected failure.

**Exit gate:** no count-then-write capacity checks remain in mutation paths; concurrency tests prove the hard limit; reconciliation reports zero drift.

### Milestone 3 — Recoverable storage protocol

1. Add a small `UploadReservation` model: unique canonical key, owner, kind (`pdf`, `voice`, `broadcast`), optional project, expected bytes/type, state, created/expiry time, and idempotency token. Do not TTL-delete a pending record before cleanup has processed its object.
2. Split the storage ledger into `usedBytes` and `reservedBytes`. In one transaction, conditionally verify `used + reserved + requested <= MAX_STORAGE_BYTES`, increment `reservedBytes`, and create the reservation.
3. Sign only a key derived on the server from the authenticated owner and reservation. Bind content type and, if verified against R2/browser behavior, content length in the signature. The reservation remains the source of truth even if signing fails; cancel/refund it on failure.
4. Finalization must be idempotent: find the owner/key reservation, HEAD the exact object, require actual bytes `>0` and `<= expected/max`, verify expected metadata, read only a small initial byte range to check `%PDF-` or WebM EBML magic, and reject/delete invalid objects.
5. In one MongoDB transaction, change the domain reference, convert reserved bytes to actual used bytes, and mark/delete the reservation. Add unique `VoiceNote.blobUrl` so retries cannot double-count.
6. Never delete an old R2 object inside that transaction. Create a durable deletion-outbox record containing canonical key, tracked bytes, attempts, and next-attempt time while clearing/replacing the domain reference.
7. A bounded worker/cron deletes queued objects after commit. Decrement `usedBytes` and remove the outbox item only after confirmed idempotent deletion; retry failures with capped exponential backoff and retain a dead-letter record.
8. Process expired upload reservations in bounded pages: HEAD if necessary, delete any object, refund only its reservation, and retain failures for retry.
9. Apply the same protocol to PDF, voice note, broadcast, review-stage cleanup, academic reset, supervisor change, join cleanup, and cron cleanup. Remove all direct R2 calls from MongoDB transaction callbacks.
10. Add a periodic read-only reconciliation that pages through tracked database keys and R2 inventory/metrics, reporting orphan objects, missing objects, duplicate references, and ledger difference. Configure an R2 lifecycle rule as a final safety net for an upload-pending prefix after a conservative age.
11. Test upload abandonment, oversized body, spoofed MIME metadata, invalid magic, duplicate finalize, finalize timeout, old-object delete failure, worker restart, and ledger underflow.

**Exit gate:** every object has a reservation or committed owner; ledger changes are idempotent; no R2 call occurs inside a MongoDB transaction; failures are retryable/reconcilable; `usedBytes` and `reservedBytes` cannot be negative.

### Milestone 4 — One project workflow and canonical state

1. Declare `Project` canonical for project supervisor, members, title, domains, PDF, review status, and stage. Treat duplicated `User` project fields as transitional read projections only.
2. Write a dry-run drift audit comparing `Project.members`/`User.projectId`, project/user supervisor, status, title, domains, and PDF key. Define deterministic repair rules and save counts before mutation.
3. Replace the duplicate student academic-reset branch with `resetStudentAcademicInfo({actor:'student', enforceStudentCooldown:true})`; fix the shared helper to clear `domains` and use the storage outbox.
4. Replace the custom transaction loop with the driver/Mongoose transaction helper that correctly retries the whole callback. Fetch every mutable document inside every retry. Never return a successful transaction result after partial work.
5. Make submission one transaction after upload verification: conditional canonical project update, required transitional user projection update, reservation finalization, and old-object deletion enqueue. Remove the redundant student re-fetch; the already loaded student contains the supervisor ID/name.
6. Make review a conditional update on the canonical project status/stage/version so two reviewers cannot both consume the same state. Update user projections and enqueue storage/email work in the same transaction.
7. Make team join/leave, supervisor change/migration/removal, academic reset, and supervisor deletion preserve both directions of membership in one transaction. Queue abandoned object cleanup rather than deleting project rows alone.
8. Convert headline to a singleton (`policyKey`/constant `_id`) updated with one upsert; clearing sets empty/inactive state atomically instead of delete-then-create.
9. Decide whether user projections are still necessary after callers move to canonical projects. Delete each duplicate field only after reads no longer depend on it; do not perform a big-bang schema deletion.
10. Add success, denied path, concurrency, retry, and injected-failure tests for every transition.

**Exit gate:** drift audit is zero after migration; no route independently implements reset/review/storage cleanup; concurrent transitions produce one legal final state.

### Milestone 5 — Exact keys, projections, and indexes

1. Migrate all stored URLs to canonical R2 keys using `normalizeStorageKey`; reject invalid/traversal/overlong keys and remove the duplicated `getR2ObjectKey` implementations.
2. After migration, remove suffix-regex legacy lookups. Perform exact equality lookups only.
3. Add and verify, based on explains, the minimum indexes needed for active query shapes:
   - `Project: { supervisorId: 1 }` for counts/dashboard/mutations;
   - `Project: { status: 1, updatedAt: -1 }` is already declared; verify it is deployed and used by the review queue;
   - partial non-empty `Project.pdfUrl` index for exact storage ownership;
   - unique `VoiceNote.blobUrl` plus `{ projectId: 1, createdAt: 1 }`, `{ projectId: 1, isPlayed: 1, playedAt: 1 }`, and cleanup `{ createdAt: 1, _id: 1 }` as justified by explains;
   - unique normalized supervisor migration code using a partial index;
   - partial broadcast-expiry index over audio supervisors and `broadcastCreatedAt`;
   - fine-status indexes only if explains show the current 20-row/admin-report queries need them.
4. Inspect `$indexStats` before deleting redundant indexes. The standalone `role` index may be covered by compound prefixes, but keep it until workload evidence proves it unused. Remove duplicate `unique:true` plus `index:true` declarations.
5. Create indexes with a controlled migration, monitor build impact, then verify plans in staging/production. Do not call `syncIndexes()` on normal request startup.
6. Add exact `.select()` and `.lean()` to every read-only query. Priority files: supervisor dashboard, Excel export, cron, voice cleanup, register/login/recovery, storage ownership, and all existence checks.
7. Replace document-returning writes with `updateOne`/matched counts when the result body is unused. Combine ledger decrement and non-negative clamp in one update pipeline.
8. Cap all search values, page sizes, `$in` arrays, exports, cleanup pages, and transaction work. Add `maxTimeMS` to admin search/report queries after selecting a safe threshold.
9. Remove exact+regex double lookups after the roll-number normalization migration.

**Exit gate:** hot exact queries have no collection scan/blocking sort; examined-docs-to-returned ratio is near 1 for point reads and bounded for lists; normal reads cannot select password/reset fields.

### Milestone 6 — Remove redundant hot reads and cache only public low-change data

1. Remove redundant `connectToDatabase()` calls after `requireCurrentUser()` where the connection is already guaranteed.
2. Student dashboard: include fine fields in the server-only member projection and calculate the team restriction in memory; strip those private fine fields before serializing safe member data. Use exact fields for student/supervisor/project and fetch independent relationships in parallel. Keep the auth revalidation read.
3. Supervisor dashboard: select only displayed student fields, query canonical projects by indexed `supervisorId`, and fetch the supervisor migration code explicitly. Never hydrate password/reset/broadcast fields accidentally.
4. Templates: authorize a student with one project query using member/stage conditions, then memoize immutable template file promises at module scope or serve versioned static assets.
5. Secure object reads: route by strict key prefix (`proposals/`, `voicenotes/`, `broadcasts/`), query only the relevant collection, and combine ownership/access conditions where safe. With exact indexed keys, target total database calls including auth: PDF 2, voice 3 or fewer, broadcast 3 or fewer.
6. Stop data-prefetching the admin review queue on dashboard mount; prefetching the JavaScript module is sufficient. Load review data when the tab is requested.
7. Add short public cache/ETag behavior for registration policy, headline, and public supervisor capacity list, with explicit invalidation/version changes after admin mutations. Keep private dashboard responses `private`/`no-store` as required.
8. Avoid refetching the complete public supervisor list after unrelated student actions if the locally affected capacity row can be updated safely; otherwise use one deduplicated refresh.
9. Measure two simple queries versus one aggregation before combining supervisor list/count calls. Choose the faster p95 plan, not merely the smaller call count.

**Exit gate:** cached public hits perform zero database calls; cold student dashboard uses at most five database queries including auth/populated members; admin mount performs no review/report/fine data calls until requested; returned shapes remain unchanged.

### Milestone 7 — Bounded search, pagination, reports, and pool tuning

1. Make admin students always paginated; remove the unbounded no-parameter compatibility path after confirming no caller needs it.
2. Replace deep `skip` pagination with `(createdAt, _id)` cursor pagination where high page depth is expected. Keep page-number compatibility only if required by UI/product.
3. Replace broad regex search with an indexed design chosen from measured requirements: exact normalized roll/email plus bounded name prefix, MongoDB text index, or Atlas Search if already available. Do not add a service merely for theoretical scale.
4. Rewrite admin reports as one `User.aggregate` with `$facet` and one `Project.aggregate` with `$facet`, returning only required summaries/rows. Bound fine detail arrays or paginate them separately. Compare this two-call plan with the current plan on maximum-size staging data.
5. For the review queue, compare the current find/count/user plan with a single bounded aggregation using `$lookup`/`$facet`. Normalize search first; retain the simpler plan if it wins p95 and examined-doc metrics.
6. Batch exports or cap them to the supervisor's real maximum. Select only the eight spreadsheet fields; do not load complete user documents. Derive filenames from trusted database data and sanitize header characters.
7. Use measured pool checkout wait and Atlas connection counts to choose `minPoolSize`, `maxPoolSize`, and `maxIdleTimeMS`. Serverless commonly benefits from `minPoolSize:0`, but deploy only after load testing.
8. Add overload behavior: bounded query time, 429/503 with retry guidance where appropriate, and no unbounded `Promise.all` fan-out.

**Exit gate:** report endpoint uses no more than two primary aggregate calls plus explicitly paginated detail; no list/export/cleanup is unbounded; pool wait remains within the endpoint budget at peak concurrency.

### Milestone 8 — Durable background work

1. Add a minimal outbox collection for email and storage deletion events created in the same transaction as the domain change.
2. Return the committed user action without waiting for Gmail or R2 DELETE. A scheduled worker claims bounded batches atomically, records attempts, retries transient errors, and marks completion idempotently.
3. Enable SMTP pooling only in the worker if measurements show it helps. Never log recipient, body, reset link, provider message ID, or credentials.
4. Remove voice cleanup from GET. Decide the truthful retention policy: either run cleanup frequently enough for the advertised ten-minute played-note expiry or change the UI/policy to the actual daily/24-hour behavior.
5. Process cleanup in small pages with concurrency limits. Prefer S3 `DeleteObjects` batches where R2 behavior is verified; inspect per-key errors before deleting database ownership/refunding bytes.
6. Record job lag, attempts, failures, dead-letter count, and oldest pending age in Sentry/operations dashboards.

**Exit gate:** request latency excludes SMTP/deletion; worker restart and partial provider failure do not lose jobs or corrupt the ledger; cleanup memory/concurrency is bounded.

### Milestone 9 — Client/browser storage and regression coverage

1. Check every upload-finalize/clear/PATCH HTTP response before showing success. If finalization fails after PUT, preserve the reservation for cleanup and show a retryable state.
2. Revoke optimistic voice Blob URLs when replaced, removed, or unmounted; use functional state updates and abort stale fetches.
3. Prevent overlapping voice uploads and make the server idempotency key authoritative rather than trusting UI state.
4. Add a draft expiry/version policy. On startup, delete stale local/IndexedDB records for the current portal namespace; clear drafts on logout/shared-device handoff where product behavior permits.
5. Keep draft text/file sizes bounded and do not store server tokens, signed URLs, or secrets in browser storage.
6. Move theme/intro state changes out of render into safe initialization/effects.
7. Replace brittle source-regex tests with focused behavior/policy tests, retaining only a small number of architecture-boundary tests. Add denied-path tests as well as success paths.

**Exit gate:** no leaked Blob URLs; failed finalization is visible/retryable; stale drafts are bounded; full unit test command passes reliably.

### Milestone 10 — Production rollout and proof

1. Run dry-run data audits and index builds first. Back up MongoDB and record R2/ledger totals. Every migration must be restartable and idempotent.
2. Deploy schema readers that tolerate old and new data, then backfill, then switch writers, then remove compatibility reads in a later release.
3. Canary critical changes with a small traffic share. Compare old/new call count, p50/p95/p99, errors, pool wait, transaction retries, storage drift, and job lag.
4. Run concurrency tests for capacity, join/leave, review, duplicate submission, upload finalization, and password-reset single use.
5. Run failure injection: Mongo commit failure, R2 HEAD/DELETE timeout, SMTP failure, worker crash, duplicate delivery, and cold start.
6. Run security checks for role/object access, CSRF/origin, upload spoofing, traversal/encoded keys, rate-limit evasion, account enumeration, log leakage, and secret-field serialization.
7. Run `npm run lint`, `node --test tests/*.test.mjs`, and `npm run build`. Do not release with a red gate.
8. Migrate `middleware.ts` to `proxy.ts` only after route-level checks are in place. Tighten CSP from production violation reports and remove dead Next config entries.
9. Publish the measured SLO report. If targets are missed, optimize the largest measured span; do not add speculative caches/indexes.
10. Keep rollback paths for each schema/index/writer change until the canary and reconciliation windows are clean.

**Exit gate:** all verification commands green; zero authorization/invariant/storage reconciliation errors; agreed warm/cold SLOs met at expected peak and maximum dataset; rollback rehearsal completed.

## 7. Target call budgets after refactor

These are design targets to validate, not reasons to weaken checks.

| Path | Target |
|---|---|
| Public policy/headline/supervisors | 0 MongoDB commands on cache hit; cold path 1, 1, and at most 2 respectively unless one measured aggregation is faster. |
| Student dashboard | At most 5 MongoDB commands including auth and member data; no duplicate fine/member query. |
| Supervisor dashboard | Auth plus one canonical project query and one projected related-user query; optional own-code read only if auth projection cannot safely supply it. |
| Secure PDF open | Auth plus one exact indexed project/access query; local signing. |
| Secure voice open | Auth plus exact voice-owner and project-access checks; local signing. |
| Upload issuance | Auth/eligibility checks plus one atomic reservation transaction; local signing. No unreserved PUT. |
| Upload finalization/submission | One R2 HEAD/range validation plus one MongoDB transaction; no synchronous delete/email. |
| Voice GET | Auth/access plus one bounded note list; zero cleanup writes/R2 deletes. |
| Admin report | At most two primary bounded aggregations, with detail pagination if needed. |
| Capacity mutation | One conditional reserve/release inside the domain transaction; zero pre-write counts. |

## 8. Ponytail/YAGNI guardrails

- Use the existing MongoDB, Mongoose, S3 SDK, Sentry, platform caching, and `node:test` stack first.
- Do not add Redis, a queue vendor, a search vendor, or a new ORM until native primitives are measured and shown insufficient.
- A small MongoDB outbox/reservation collection is justified because it closes an existing cross-system consistency hole; a general event framework is not.
- Keep route handlers thin. Capacity, reservation/finalization, and transition invariants each belong in one focused shared module, not copied across routes and not merged into a new monolith.
- Delete inactive slot-mode/legacy regex/plaintext compatibility code after migration rather than supporting it forever.
- Preserve public response shapes while changing internals unless a versioned API change is explicitly approved.

## 9. Verification performed during this audit

- `git status --short --branch`: clean at audit start.
- Recent commits inspected: cleanup/modularization merge and its component milestones.
- `npm run lint`: **passed**.
- `node --test tests/*.test.mjs`: **failed** — 27 passed, 3 failed. Failing files:
  - `tests/dialog-portal.test.mjs` expects portal implementation in the compatibility barrel instead of the focused dialog module.
  - `tests/student-dashboard-draft-template-structure.test.mjs` expects draft restoration in the old dashboard file instead of the extracted data hook.
  - `tests/student-dashboard-structure.test.mjs` expects API/workflow symbols in the old dashboard file instead of extracted modules.
- `npm run build`: first sandboxed attempt was blocked because Turbopack could not bind its internal port; the approved non-sandboxed rerun **passed**. It emitted only the `middleware.ts` deprecation warning noted as OPS-01.
- No live MongoDB `explain`, production profiler, R2 inventory, load test, or data mutation was performed. Static source review cannot prove that every runtime bug has been found; Milestone 0 adds the evidence needed to close that gap.

## 10. Progress

- Repository/I/O inventory: **complete**.
- Static security, correctness, redundancy, and query/index audit: **complete**.
- Refactor milestone plan: **complete**.
- Application refactor implementation: **not started (0%)**.
- Database index migration/backfill: **not started (0%)**.
- R2 reservation/reconciliation implementation: **not started (0%)**.
- Production-like benchmark and SLO proof: **not started (0%)**.
- Current gate: lint and build pass; unit-test gate is blocked by three stale structural tests.
