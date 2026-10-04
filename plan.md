# Portal Backend Optimization & Verification Plan

> **Purpose:** Improve security, reduce unnecessary requests/database work, lower resource usage, and make the portal measurably faster without changing the UI and without changing the password-reset workflow.
>
> **Execution rule:** Each milestone is one small hypothesis. Implement it, run its local database/storage tests, measure it, then either **keep it** or **revert it** before moving on. Do not stack unmeasured optimizations.

## 1. Goals, constraints, and definition of success

### Primary goals

1. Reduce unnecessary browser requests and server work.
2. Reduce MongoDB query count, scanned documents, and expensive aggregation work.
3. Reduce p50/p95 response time for the workflows users actually feel.
4. Reduce CPU/memory pressure under the same local load.
5. Fix known authorization/resource-consumption weaknesses.
6. Keep the portal UI and user-visible workflow unchanged.
7. Keep the password-reset workflow completely untouched.
8. Improve code organization only after behavior is protected by tests.
9. Finish with a measured before/after report, not an opinion.

### Hard constraints

- **No UI redesign or behavior redesign.**
- **Do not edit the password-reset workflow.**
- **Do not weaken password hashing or account/session revocation to gain speed.**
- **Do not replace real verification with mocks.**
- **All portal acceptance testing runs against a real local MongoDB replica set and a real local S3-compatible object store.**
- Do not test destructive changes against production, Atlas production data, Cloudflare R2 production buckets, or real email.
- Do not add a new package when Node, MongoDB, the browser, Docker, or an already-installed dependency can do the job.
- No monorepo migration, generic repository framework, caching framework, or speculative architecture layer.
- One optimization hypothesis per commit whenever practical.

### Password-reset no-touch boundary

Treat the following files as frozen for this project:

```text
app/api/auth/forgot-password/route.ts
app/api/auth/reset-password/route.ts
components/auth/PasswordResetFlow.tsx
components/auth/password-reset/**
lib/auth/passwordResetService.ts
lib/auth/passwordResetValidation.ts
```

`lib/security/password.ts` is shared security infrastructure and is not automatically frozen, but do not modify it unless a non-reset requirement truly needs it. Any change that could alter password-reset behavior is out of scope.

Before work starts, record hashes of the frozen files. At the end, verify every hash is identical.

### Overall target

The original target is **at least 50% improvement across the most important measurable hot paths**, not a fake “50% everywhere” claim.

The target is considered met when the final before/after evidence shows a combination such as:

- idle Viva access polling requests: **120/hour/user -> 0**
- initial admin heavy requests/work: **>= 50% reduction**
- confirmed student Viva schedule DB phases: **5 -> <= 2**
- selected hot-path p95 latency: **>= 50% lower** where the work removed is large enough
- documents examined for newly indexed hot queries: **>= 50% lower**
- resource use under the same load: target **>= 50% lower** on the bottlenecked resource if the local environment demonstrates the original bottleneck

Security is not scored as a fake percentage. Security success is binary/coverage-based:

- zero known critical/high authorization defects in the tested scope
- all normal JSON mutation endpoints have a bounded-body policy
- storage access-control matrix passes against real local object storage
- password-reset frozen-file diff is zero

---

## 2. The “useful or worthless?” rule

Every milestone ends with a decision.

### Keep a change when at least one of these is true

**Security/correctness change**
- It makes a previously failing authorization/security case pass.
- It closes an objectively demonstrated trust-boundary issue.
- It preserves legitimate access while rejecting illegitimate access.

**Performance change**
- It reduces the targeted request/query count by at least **25%**, or
- reduces the targeted p95 by at least **15%**, or
- reduces `totalDocsExamined` by at least **50%**, or
- removes a repeated background action entirely, or
- materially reduces CPU/RSS under the same fixed workload.

Small changes can still be retained when they are obvious deletion wins, for example deleting a 30-second polling loop that provides no authoritative security guarantee.

**Maintainability-only change**
- It does not change behavior,
- tests remain green,
- it removes meaningful duplication or reduces an oversized file/service boundary,
- and it does not add more abstractions than it removes.

### Revert or redesign a change when

- the metric moves by less than the measurement noise,
- p95 gets worse by more than **5%** on an important unaffected workflow,
- query count falls but latency/CPU/docs-examined do not improve,
- the implementation adds a cache/abstraction/complexity that is not justified by measured benefit,
- authorization behavior becomes broader than intended,
- legitimate user workflows break,
- UI changes,
- password-reset frozen files change,
- or the optimization only “looks cleaner” but produces no measurable operational or maintenance benefit.

### How to calculate improvement

For lower-is-better metrics:

```text
improvement % = ((baseline - after) / baseline) * 100
```

For higher-is-better metrics such as throughput:

```text
improvement % = ((after - baseline) / baseline) * 100
```

Do not compare one lucky run. Use the same machine, dataset, server mode, Node settings, MongoDB settings, and workload.

---

## 3. Measurement protocol used by every milestone

### Run modes

Use two separate measurement modes because MongoDB profiling itself adds overhead.

**Latency mode**
- MongoDB profiler off.
- Production build: `npm run build` then `npm start`.
- 5 warm-up requests/workflows.
- At least 30 timed repetitions for single-user endpoint measurements.
- For load behavior, use the existing Viva HTTP stress runner.
- Run the complete sample at least 3 times.
- Compare median p50/p95 across the repeated samples.

**DB-work mode**
- Use the same seeded database.
- Enable MongoDB profiler only for the short workflow being inspected, or use `explain("executionStats")` for isolated queries.
- Record query count, `nReturned`, `totalKeysExamined`, `totalDocsExamined`, stage (`IXSCAN`/`COLLSCAN`), and execution time.
- Disable profiling immediately after capture.
- Do not compare latency numbers collected with the profiler enabled to latency-mode numbers.

### Browser mode

For every user-facing milestone, test the real portal in a browser at `http://localhost:3100`:

- sign in as the relevant role
- use the actual screen/buttons/forms
- inspect the Network panel for request count, duplicate requests, response status, response size, and timing
- confirm loading/error/success UI remains identical
- repeat once with a fresh session and once with a warm session
- record screenshots before and after for the touched screens if the change could affect rendering

No code-only milestone is considered complete when it changes a user workflow.

### Resource mode

For stress milestones, record:

- Node process CPU
- Node RSS/heap
- MongoDB container CPU/memory
- request throughput
- error rate
- p50/p95/p99
- MongoDB operation count if captured in a separate DB-work run

Use `docker stats`, OS process metrics, and the existing stress runner before adding any monitoring dependency.

### Result record

For every milestone create a small result file under a gitignored local folder, for example:

```text
.local-bench/
  baseline/
  m03-viva-poll/
  m04-admin-lazy-load/
  ...
```

Each result should contain:

```text
commit:
machine:
node:
npm:
mongodb:
minio:
dataset profile:
server command:
environment toggles:
test command/workflow:
baseline:
after:
improvement:
regressions:
decision: KEEP | REVERT | REDESIGN
notes:
```

---

# Milestones

## Milestone 0 - Freeze scope and establish a clean source baseline

### Goal

Make later measurements trustworthy and prevent accidental changes to the password-reset workflow.

### What to do

1. Work from the complete local repository, not the Repomix export.
2. Start from a clean Git working tree.
3. Create a dedicated optimization branch.
4. Record:
   - current commit SHA
   - Node version
   - npm version
   - OS/CPU/RAM
   - current environment-variable names, without secrets
5. Run `npm ci`.
6. Run the existing validation suite:
   ```bash
   npm run lint
   npm run test:unit
   npm run build
   ```
7. Record every existing failure **before changing anything**. Do not silently fix unrelated failures and call them optimization wins.
8. Hash the password-reset frozen files:
   ```bash
   sha256sum \
     app/api/auth/forgot-password/route.ts \
     app/api/auth/reset-password/route.ts \
     components/auth/PasswordResetFlow.tsx \
     components/auth/password-reset/* \
     lib/auth/passwordResetService.ts \
     lib/auth/passwordResetValidation.ts \
     > .local-bench/password-reset-before.sha256
   ```
9. Save a Git diff/status snapshot.

### Tests

- Clean checkout builds, or all pre-existing build failures are documented.
- Existing unit tests run.
- Password-reset hash file is generated.
- No implementation change has been made yet.

### Completion gate

Complete only when we can answer: “What was broken before we started?” and “Can we prove the password-reset files never changed?”

---

## Milestone 1 - Build the disposable local MongoDB + object-storage environment

### Goal

Every important test must exercise the real persistence paths: MongoDB transactions and actual S3-compatible uploads/downloads/deletes.

### What to do

Create a local Docker Compose setup with four responsibilities:

1. **MongoDB**
   - single-node replica set
   - loopback-only published port
   - persistent Docker volume for normal local development
2. **Mongo replica-set initializer**
   - waits for Mongo
   - runs `rs.initiate(...)`
   - exits after initialization
3. **MinIO**
   - S3 endpoint on a loopback port
   - MinIO console on a second loopback port
   - local credentials only
4. **Bucket initializer**
   - creates a dedicated bucket such as `fyp-local`
   - sets CORS so the browser at `http://localhost:3100` can use presigned PUT/GET/HEAD requests

Pin image versions in the real repo rather than floating forever on `latest`.

Suggested local connection values:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/fyp_local?replicaSet=rs0
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=<local-only-secret>

R2_ACCESS_KEY_ID=<local-minio-access-key>
R2_SECRET_ACCESS_KEY=<local-minio-secret>
R2_BUCKET_NAME=fyp-local

STORAGE_S3_ENDPOINT=http://127.0.0.1:9000
STORAGE_S3_REGION=us-east-1
```

### Minimal application change for local storage

`lib/s3-client.ts` currently hardcodes Cloudflare R2. Add only an environment override:

- if `STORAGE_S3_ENDPOINT` is set, use it
- otherwise preserve the exact current R2 endpoint behavior
- if a local endpoint is supplied, `R2_ACCOUNT_ID` is not required
- keep the existing S3 client and presigner
- do not add another storage SDK
- keep `forcePathStyle` enabled
- production behavior with no new variables must remain unchanged

The point is not to create a “storage abstraction framework.” It is one endpoint override so the existing production code can talk to MinIO.

### Initialize the storage ledger

The current storage protocol expects exactly one storage ledger record. Reuse the real repository’s existing storage integrity/repair script if it initializes the ledger correctly.

If it does not, add a local seed step that creates exactly one:

```text
SystemConfig:
  configKey: "storage"
  usedBytes: 0
  reservedBytes: 0
```

Do not add silent production initialization inside request paths.

### Tests

**Database reality test**
1. Start Compose.
2. Connect with `mongosh`.
3. Confirm replica-set state is PRIMARY.
4. Run a tiny transaction and abort it.
5. Confirm no data remains after abort.

**Storage reality test**
1. Create the bucket.
2. Put a small object into MinIO.
3. HEAD it.
4. GET it.
5. Delete it.
6. Confirm it is gone.

**Portal storage smoke test**
1. Start the Next production server using the local MongoDB and MinIO env.
2. Sign in through the portal.
3. Use an existing upload flow to request a signed upload.
4. Upload through the browser.
5. Open/download through the portal.
6. Confirm the object exists in MinIO.
7. Trigger the portal deletion/cleanup path.
8. Confirm the object is deleted and storage ledger values remain valid.

### Completion gate

- Mongo transactions work.
- Browser presigned upload works against MinIO.
- Browser read works.
- portal cleanup works.
- no request touched real R2 or production MongoDB.

---

## Milestone 2 - Create deterministic local data and capture the true baseline

### Goal

Create the baseline against which every later claim is judged.

### What to do

Use deterministic synthetic data only.

Create/reuse a local seed script with two profiles:

### Functional profile

Enough data to manually exercise all roles:

- 1 admin
- 3 supervisors
- 12-20 students
- multiple projects:
  - unassigned
  - assigned
  - submitted
  - under review
  - approved/rejected states used by the app
- at least one supervisor broadcast
- at least one student message
- at least one proposal PDF in MinIO
- a Viva round/panel/session set that covers normal, active, completed, and restricted states
- initialized storage ledger

### Performance profile

Large enough for query planning to matter. Start with:

- 5,000 students
- 100 supervisors
- 2,000+ projects or a realistic project/student ratio
- reportable review/fine/status data
- 500 Viva-relevant supervisors if existing performance tests already use that scale
- only enough MinIO objects to exercise storage paths; do not generate gigabytes

Allow counts to be changed through environment variables, but keep one named canonical profile for all before/after comparisons.

### Baseline workflows to capture

**Student**
- login
- initial dashboard
- headline
- supervisor list
- project view
- confirmed Viva schedule
- proposal upload and read

**Supervisor**
- login
- dashboard
- project list/details
- broadcast upload/read
- proposal read/review path

**Admin**
- login
- initial dashboard
- students
- supervisors
- reports
- project review queue
- Viva administration

**Background**
- leave dashboard idle for 10 minutes
- count recurring network requests
- note server/MongoDB activity during the idle period

### Existing Viva stress baseline

Use the repository’s existing local stress machinery with the dedicated local replica-set database.

Capture at least:

```bash
npm run test:viva:stress:preflight
npm run test:viva:stress:login
npm run test:viva:stress
npm run test:viva:stress:traffic
```

Use the exact local environment requirements documented by the repository and never point the runner at production services.

### Baseline query plans

Capture `explain("executionStats")` for:

- `Project.find({ supervisorId })`
- project review queue page query
- admin report aggregation
- student confirmed Viva schedule lookup path
- any admin student status/search query changed later

### Tests

- Reset and reseed twice. The record counts must match.
- Run all browser workflows successfully.
- Run the full existing unit/build checks.
- Run the local Viva integration workflow.
- Run storage upload/read/delete via the browser.
- Save baseline latency, query, resource, and request-count results.

### Completion gate

No optimization begins until there is a reproducible baseline dataset and a saved baseline result.

---

## Milestone 3 - Delete the 30-second Viva access polling loop

### Goal

Eliminate repeated non-authoritative background work while preserving server-side enforcement.

### Current problem

The dashboard access hook performs an immediate check and then repeats it every 30 seconds. The server remains authoritative on protected requests, so the fixed polling loop generates ongoing DB work even when the user does nothing.

### What to do

In `components/ui/dashboard/useVivaAccessRestriction.ts`:

1. Keep the initial access check.
2. Keep the focus/visibility recheck if it is useful when a user returns to the tab.
3. Remove the fixed `setInterval(..., 30_000)` loop.
4. Do not weaken the server guard in `requireCurrentUser`.
5. Do not add WebSockets, SSE, a cache library, or another synchronization mechanism.

### Tests

**Browser functional**
1. Sign in as a normal student.
2. Open the dashboard.
3. Verify the initial Viva-access request occurs.
4. Leave the tab open for 10 minutes.
5. Verify no 30-second request repeats.
6. Move focus away and back.
7. Verify the intended focus recheck still occurs.

**Authorization reality**
1. Using the local database, create/activate a Viva restriction for the logged-in student while the page is open.
2. Attempt a protected action without manually refreshing.
3. Verify the server rejects/redirects according to current policy.
4. Refocus or reload and verify the UI catches up.

**Measurement**
- Baseline expected periodic checks: about 20 in 10 minutes.
- After: 0 timer-driven checks in 10 minutes.
- Compare Mongo operation count during an idle 10-minute window.

### Completion gate

Keep if timer-driven requests fall to zero and protected actions remain correctly enforced.

Expected value: nearly **100% removal of idle polling work**.

---

## Milestone 4 - Stop eagerly loading heavy Admin data

### Goal

Make the Admin dashboard feel fast by not loading reports/review data before the user asks for it.

### What to do

Inspect:

```text
components/admin/hooks/useAdminReports.ts
components/admin/hooks/useAdminProjectReviewPrefetch.ts
admin dashboard composition/hooks
```

Implement the smallest change:

1. Remove mount-time `loadReports(true)`.
2. Remove unconditional project-review prefetch on mount.
3. Fetch reports on first report-dialog/tab use.
4. Fetch project-review data on first review-tab/dialog use.
5. Retain already loaded data in component state until an action invalidates it.
6. If the Admin overview currently depends on heavy report data just to show a few totals, create a tiny summary endpoint that performs only the direct counts required for the existing UI.
7. Do not create a generic client data/cache layer.
8. Do not rename or redesign UI components.

### Tests

**Browser**
1. Sign in as admin with DevTools Network open.
2. Load the initial dashboard.
3. Verify report/review heavy endpoints are absent.
4. Open Reports.
5. Verify exactly one report request is made.
6. Close and reopen Reports.
7. Verify it does not refetch unless invalidated.
8. Repeat for Project Review.
9. Verify all existing totals/cards still show the same values.

**Database**
- Profile initial admin load before and after.
- Count Mongo commands and docs examined.
- Profile first Reports open separately.

**Performance**
- Measure admin dashboard data-ready time.
- Measure initial request count and total transferred bytes.
- Full report-open latency may remain similar; that is acceptable because the work is now paid only when requested.

### Completion gate

Keep if:
- initial heavy request count drops by at least 50%, or
- initial DB work drops by at least 50%,
- and report/review screens still return identical data when opened.

---

## Milestone 5 - Fix broadcast storage authorization using the canonical Project relationship

### Goal

Correct the known storage authorization bug and prove legitimate/illegitimate access with real local objects.

### Current problem

`lib/security/storage.ts` checks a student-supervisor relationship through `User.supervisorId`, while the canonical relationship is represented through `Project.supervisorId` and `Project.members`.

### What to do

1. Trace all callers of `canAccessStoredObject`, `canAccessBroadcast`, and the legacy storage path.
2. Replace the invalid student `User.exists(... supervisorId ...)` relationship check with a `Project.exists(...)` check using:
   - `supervisorId: broadcastOwner._id`
   - `members: currentUser.id`
3. Apply the same canonical relationship to the legacy broadcast branch.
4. Reuse one tiny helper if both branches need the exact same predicate.
5. Do not broaden access beyond:
   - admin
   - broadcast owner
   - student who belongs to a project supervised by that owner
6. Do not change object-key rules.

### Tests

Create this local authorization matrix using real MinIO objects:

| Actor | Object | Expected |
|---|---|---|
| admin | any broadcast | allow |
| broadcast owner | own broadcast | allow |
| different supervisor | other supervisor broadcast | deny |
| student supervised by owner | owner broadcast | allow |
| unrelated student | owner broadcast | deny |
| deactivated/invalid session | broadcast | deny before storage authorization |

For each row:

1. Seed the relationship in local MongoDB.
2. Put an actual broadcast object in MinIO.
3. Call the real portal read route as that actor.
4. Follow the signed redirect only for allowed cases.
5. Verify denied cases never receive a usable signed storage URL.
6. Verify MinIO access logs/object state if needed.

Also test the legacy-key branch if legacy keys still exist in supported data.

### Performance check

This is primarily a correctness/security change. Still record query count. The replacement should use the existing project relationship and an indexed shape where possible.

### Completion gate

Keep only when all matrix cases pass and legitimate student access works. This milestone is valuable even if latency is neutral because it fixes authorization correctness.

---

## Milestone 6 - Add and verify the missing `Project.supervisorId` index

### Goal

Stop supervisor/project relationship queries from scanning unnecessary project documents.

### What to do

1. Confirm the exact supervisor dashboard and authorization query shapes.
2. Run `explain("executionStats")` on the performance dataset **before** adding an index.
3. Add the smallest useful index to `Project`, initially:
   ```ts
   ProjectSchema.index({ supervisorId: 1 });
   ```
4. Do not add a compound index until a real query needs its sort/filter suffix.
5. Build/apply indexes on the local database.
6. Re-run `explain`.
7. Check the actual index list for duplicates/redundancy.
8. Only then decide whether a compound index is warranted.

### Tests

**Query-plan**
Record before/after:

```text
winningPlan stage
nReturned
totalKeysExamined
totalDocsExamined
executionTimeMillis
```

**Portal**
1. Sign in as supervisor.
2. Open dashboard.
3. Open multiple assigned projects.
4. Test broadcast access and student-message access paths that rely on project relationship.
5. Verify identical results.

**Write impact**
- Create/update a project several times.
- Confirm no noticeable write failure or duplicate-index conflict.

### Completion gate

Keep the index if:
- the target query uses it,
- `totalDocsExamined` falls materially, target >= 50% on the performance dataset,
- and no redundant index makes it pointless.

Delete it if MongoDB does not use it for the real hot query.

---

## Milestone 7 - Collapse the confirmed Student Viva schedule read path

### Goal

Reduce the confirmed schedule path from a chain of roughly five dependent collection reads to one or two reads using the snapshots already stored on `VivaSession`.

### What to do

1. Map the current flow in `lib/vivaScheduling.ts`:
   - project lookup
   - round lookup
   - session lookup
   - panel lookup
   - participant user lookup
2. Inspect all fields on `VivaSession` snapshots:
   - `roundSnapshot`
   - `projectSnapshot`
   - `panelSnapshot`
3. Verify, using seeded current and historical sessions, that snapshots contain every field the existing UI/API response needs.
4. Verify snapshot membership indexes support finding a session for a student.
5. Reimplement only `getConfirmedVivaSchedulesForStudent` using session snapshots.
6. Preserve the exact returned response shape, ordering, and null/empty behavior.
7. Do not convert every Viva service to snapshots in this milestone.
8. If one small current-user lookup is still required, accept two queries rather than building a large aggregate.

### Tests

**Golden-response test**
1. On baseline code, save JSON output for:
   - student with no schedule
   - student with one confirmed schedule
   - student with completed schedule
   - team member
   - panel/admin-related edge cases relevant to this response
2. Apply the change.
3. Compare normalized JSON output exactly.

**Local integration**
- Run all existing Viva integration tests against the local replica-set DB.
- Run the full workflow integration test.
- Use the portal as a student and inspect the schedule/results UI.

**Query count**
- Profile one confirmed-schedule load before and after.
- Target: approximately 5 DB phases -> <= 2.

**Performance**
- Measure endpoint p50/p95 with the same seeded dataset.

### Completion gate

Keep if response compatibility is exact and DB phases fall by at least 50%. Target reduction is **60-80%**.

If snapshot completeness is not proven, do not force this optimization. Keep the old path until data invariants are established.

---

## Milestone 8 - Replace the Admin Reports first-stage `$facet` scan

### Goal

Stop the report route from forcing broad collection work for every report request.

### Current problem

The report aggregation begins with `$facet`. A first-stage `$facet` cannot take advantage of an earlier filtering/index stage and can turn report generation into a collection-wide workload.

### What to do

1. Identify which values are needed:
   - on initial Admin overview
   - only inside the full Reports UI
2. Keep the lightweight overview out of the full report route if Milestone 4 created a summary endpoint.
3. For the full report route, split independent totals into direct `countDocuments`/targeted queries when that is cheaper and clearer.
4. For project-related student report rows, start from the collection/query that can use the most selective predicate rather than scanning every User and looking up Projects.
5. Use projections to return only fields required by the current UI/export.
6. Preserve current report response shape unless both server and client can be changed internally without UI behavior change.
7. Avoid a generic report query builder.
8. Do not add caching until the rewritten query is measured. If the route is still expensive and data can tolerate a short delay, then consider the existing/native caching pattern with explicit invalidation/revalidation semantics.

### Tests

**Correctness**
- Snapshot baseline report JSON on deterministic seed data.
- Compare totals and row identities after the rewrite.
- Test empty dataset, one user, mixed statuses, fines, review queue counts, and large dataset.

**Query-plan**
- Capture old aggregate `explain("executionStats")`.
- Capture new query plans.
- Compare total documents examined across the entire report request, not just one subquery.

**Portal**
1. Open Admin Reports.
2. Verify all tabs/cards/tables/export actions display identical values.
3. Repeat after mutating a student/project/fine and verify data updates as expected.

**Performance**
- 30+ report requests after warmup.
- Record p50/p95 and Node/Mongo CPU.
- Target >= 50% reduction in docs examined and, ideally, >= 50% p95 improvement.

### Completion gate

Keep only if the new shape materially reduces work. If several smaller indexed queries are faster and clearer than one clever aggregate, prefer the boring version.

---

## Milestone 9 - Bound normal JSON request bodies without touching password reset

### Goal

Prevent unbounded body parsing/resource use on normal mutation routes.

### What to do

1. Inventory every `await req.json()` call.
2. Exclude the frozen password-reset routes completely.
3. Group normal endpoints by realistic body size:
   - tiny control/action payloads
   - standard form payloads
   - larger metadata payloads
4. Implement one small shared helper, for example `readBoundedJson`, using native Request APIs:
   - reject unsupported content type where the route expects JSON
   - reject declared content length above the route limit
   - read actual bytes and enforce the limit even when `Content-Length` is missing or false
   - return 400 for malformed JSON
   - return 413 for oversized JSON
5. Use conservative limits that are comfortably above real portal payloads.
6. Migrate normal mutation routes incrementally.
7. Do not migrate password reset.
8. Do not add a schema/validation package only for byte limits.

### Tests

For each limit category, test through the running local portal/server:

1. normal valid request -> existing success result
2. malformed JSON -> 400
3. oversized body with `Content-Length` -> 413
4. oversized streamed/chunked body without useful `Content-Length` -> 413
5. wrong content type where JSON is mandatory -> expected rejection
6. boundary-size payload -> accepted if valid
7. one byte over boundary -> rejected

Then run normal browser mutation workflows for each affected role.

### Password-reset guard

Re-run the frozen-file hashes. They must match Milestone 0 exactly.

### Completion gate

- 100% of selected non-reset JSON mutation routes use an actual byte bound.
- normal portal workflows remain unchanged.
- password-reset frozen-file hashes remain identical.

---

## Milestone 10 - Remove duplicate Admin Students query work

### Goal

Reduce avoidable work in the admin-students endpoint without redesigning the UI.

### What to do

1. Trace normal branch vs status-filter branch.
2. In the status-filter branch, reuse data already produced by the aggregation instead of issuing another `Project.find` for the same page student IDs when it adds no information.
3. Measure `countDocuments`, distinct batch lookup, and active-total calls.
4. If metadata is identical across repeated pages and changes infrequently:
   - first try returning it only when the UI needs it,
   - or move it to the lightweight admin summary from Milestone 4.
5. Do not add a cache until simple query deletion/reuse is insufficient.
6. Keep the current cursor pagination and API response contract.

### Tests

- Compare exact row IDs/order for the first 5 pages.
- Test status filters.
- Test batch filter.
- Test exact roll number/email search.
- Test name prefix search.
- Test empty results.
- Use the actual Admin Students screen for all filters.

Measure:
- DB operation count/request
- docs examined
- p50/p95
- response bytes

### Completion gate

Keep when duplicate DB work is removed and the affected request shows a clear query-count or latency improvement with identical rows.

---

## Milestone 11 - Replace deep review-queue offset pagination with cursor pagination

### Goal

Prevent later review pages from getting progressively more expensive.

### What to do

1. Record the current sort order and stable tie-breaker.
2. Use a cursor composed of the current sort field plus `_id`, for example:
   ```text
   updatedAt + _id
   ```
3. Add only the index needed by the final cursor filter/sort after checking `explain`.
4. Preserve current page size.
5. If the UI requires a total count, keep that metadata separately; do not use offset just to preserve a page number internally.
6. Preserve search/filter semantics.
7. Do not build a generic pagination library.

### Tests

**Data correctness**
- Fetch enough pages to cover at least 500 rows.
- Ensure no duplicates.
- Ensure no missing IDs.
- Insert/update a row between page requests and verify behavior is documented/stable.
- Test equal `updatedAt` timestamps to prove `_id` tie-breaking works.

**Portal**
- Navigate review queue forward/back through the UI as supported.
- Test searches/filters.

**Performance**
Compare early and deep pages:
- old page 1 vs old deep page
- new page 1 vs new deep page

The new deep-page cost should remain close to early-page cost.

### Completion gate

Keep when deep-page docs examined/latency no longer grows with the skipped offset and UI behavior is preserved.

---

## Milestone 12 - Collapse repeated authenticated-user reads and unnecessary refreshes

### Goal

Reduce duplicate work after authentication without weakening immediate session/account revocation.

### Critical safety rule

Do **not** “optimize” by trusting a long-lived JWT alone. The current DB-backed `sessionVersion`/active-user validation protects revocation. Preserve that property.

### What to do

#### A. Repeated user reads

1. For each hot route, list:
   - fields already fetched by `getCurrentUser`
   - fields fetched again later
2. Where a route needs one or two extra fields, allow `requireCurrentUser`/a route-specific auth helper to request an explicit projection rather than issuing a second User query.
3. Keep the canonical active-user/sessionVersion check.
4. Do not create an auth-result cache with a revocation delay unless a later benchmark proves it necessary and the security window is explicitly accepted.

Start with:
- supervisor dashboard
- student dashboard
- other highest-frequency routes identified by profiling

#### B. Frontend refreshes

1. Trace mutations that call both dashboard refresh and supervisor-list refresh.
2. Refresh only data actually invalidated by the mutation.
3. If a mutation already returns the authoritative updated state, update local state from that response instead of immediately refetching the same resource.
4. Lazy-load supervisor data until the user enters a workflow that needs it if the existing UI can preserve its visible state.

### Tests

**Revocation**
1. Sign in.
2. Change `sessionVersion` or deactivate the user in local MongoDB.
3. Make a protected request.
4. Verify it is rejected immediately according to existing behavior.

**Portal**
- run all student and supervisor mutation workflows
- verify data updates correctly without a manual refresh
- verify no stale supervisor capacity/status is displayed after actions that change it

**Measurement**
- DB operations per dashboard request
- browser requests after each mutation
- dashboard p50/p95

### Completion gate

Keep each individual change only if it removes a real repeated read/request while the revocation test and state-consistency tests remain correct.

---

## Milestone 13 - Organize oversized backend modules only after behavior is protected

### Goal

Improve maintainability without turning the project into an abstraction museum.

### Target areas observed in the snapshot

Large/hot modules included:

```text
lib/vivaScheduling.ts
lib/vivaSessionDashboard.ts
app/api/dashboard/student/route.ts
lib/storageProtocol.ts
lib/vivaRoundAdmin.ts
app/api/admin/reports/route.ts
app/api/dashboard/supervisor/route.ts
```

### What to do

Refactor one feature at a time.

Preferred direction:

```text
app/api/...                      # thin HTTP adapters
lib/features/
  viva/
    scheduling.ts
    sessions.ts
    panels.ts
  admin/
    reports.ts
    students.ts
  student/
    dashboard.ts
  supervisor/
    dashboard.ts
  storage/
    protocol.ts
    authorization.ts

lib/security/...
models/...
config/...
```

Do not move files merely to make the tree look fashionable. A move should correspond to a real responsibility boundary.

For each route:

1. Keep HTTP concerns in `route.ts`:
   - auth call
   - parse/validate request
   - invoke feature/service function
   - map known error to response
2. Move domain/query logic only when it is substantial or reused.
3. Keep direct Mongoose queries in feature modules when that is the clearest code.
4. Do **not** create:
   - one repository class per model
   - factories with one implementation
   - interfaces that only wrap Mongoose
   - a home-grown dependency injection container
5. Consolidate duplicate validation/text helpers only where there are genuinely multiple callers.
6. Delete dead branches/helpers found during the move.

### Tests

After each feature move:

```bash
npm run lint
npm run test:unit
npm run build
```

Then run the relevant real local portal workflow against MongoDB and MinIO.

For routes whose code moved, compare:
- response status
- response JSON
- request count
- DB query count
- p95

### Maintainability acceptance

A refactor is only worthwhile if at least one is true:
- large route becomes materially smaller and easier to read
- duplicated logic is deleted
- one canonical authorization/query rule replaces multiple copies
- a feature can be tested without loading unrelated route plumbing

Revert a move that only creates more files and indirection.

---

## Milestone 14 - Full local portal regression with real MongoDB and MinIO

### Goal

Prove the optimized portal works as a portal, not just as isolated functions.

### Test environment

- production Next build
- local MongoDB replica set
- local MinIO bucket
- deterministic functional dataset
- no production services
- no real SMTP
- same browser and machine for before/after comparison

### Student end-to-end checklist

- sign in
- load dashboard
- read headline
- inspect supervisor list
- create/join/leave project according to allowed flows
- submit proposal PDF to MinIO
- reopen/download proposal through the protected route
- send supported student audio message to MinIO
- verify access restrictions on unrelated storage
- inspect Viva schedule
- exercise active Viva restriction behavior
- inspect completed result
- sign out

### Supervisor end-to-end checklist

- sign in
- load dashboard/projects
- inspect assigned students/projects
- access proposal PDF
- perform review action
- create audio broadcast using MinIO
- verify intended students can access it
- verify unrelated students cannot access it
- use Viva panel/session actions permitted to that supervisor/panel admin
- sign out

### Admin end-to-end checklist

- sign in
- initial dashboard
- open Students
- filter/search/paginate
- open Supervisors
- open Reports and verify totals
- open Project Review queue
- exercise Viva admin workflows
- verify storage/admin access paths
- verify no heavy Reports/Review request happens before first use
- sign out

### Storage lifecycle checklist

For proposal, broadcast, and student-message object kinds:

1. reserve upload
2. get presigned URL
3. upload to MinIO
4. finalize reservation
5. confirm ledger
6. read through authorized portal route
7. reject unauthorized read
8. delete/replace through real application workflow
9. process deletion outbox/cleanup
10. verify object removal
11. verify `usedBytes`/`reservedBytes`
12. run storage integrity/key audits available in the full repo

### Data-integrity checks

Run available repository commands such as:

```bash
npm run capacity:reconcile
npm run project:drift-audit
npm run storage:keys:audit
npm run storage:integrity:audit
npm run indexes:refactor:audit
npm run rate-limit:ttl:audit
```

Use audit mode, not repair/apply mode, unless a specific test requires repair.

### Password-reset protection

Run existing password-reset regression tests but do not manually change or refactor that workflow.

Re-run the frozen-file hashes and compare:

```bash
sha256sum -c .local-bench/password-reset-before.sha256
```

### Completion gate

No critical user workflow fails. Storage and database effects match what the UI claims happened.

---

## Milestone 15 - Final performance/stress comparison and keep/revert sweep

### Goal

Measure the combined system using exactly the same workload as the baseline and remove changes that did not earn their complexity.

### What to do

1. Reset MongoDB to the canonical performance seed.
2. Empty/reinitialize the MinIO test bucket and storage ledger.
3. Build production code fresh.
4. Record the exact final commit.
5. Run the same:
   - student workflow benchmark
   - supervisor workflow benchmark
   - admin workflow benchmark
   - report benchmark
   - Viva integration/performance suite
   - Viva HTTP preflight/login/stress/traffic suite
   - 10-minute idle-dashboard measurement
6. Repeat the same measurement count as baseline.
7. Collect CPU/RSS and MongoDB resource stats.
8. Re-run all key query plans.
9. Compare every milestone decision.
10. Remove any optimization whose complexity is not justified by its final measured contribution.

### Final comparison table

At minimum produce:

| Metric | Before | After | Change | Target | Result |
|---|---:|---:|---:|---:|---|
| Admin initial requests |  |  |  | <= 50% of baseline | |
| Admin initial DB ops |  |  |  | <= 50% | |
| Admin Reports p95 |  |  |  | -50% desired | |
| Student dashboard p95 |  |  |  | -50% desired | |
| Supervisor dashboard p95 |  |  |  | -50% desired | |
| Confirmed Viva schedule DB phases | ~5 |  |  | <= 2 | |
| Idle Viva checks/hour/user | ~120 |  |  | 0 | |
| Project-by-supervisor docs examined |  |  |  | -50%+ | |
| Review deep-page docs examined |  |  |  | near constant | |
| Browser requests after student mutations |  |  |  | lower | |
| Node CPU under fixed load |  |  |  | -50% desired | |
| Node RSS under fixed load |  |  |  | no regression / lower | |
| Mongo CPU under fixed load |  |  |  | -50% desired | |
| Error rate |  |  |  | 0 unexpected | |
| Protected storage authorization matrix |  |  |  | 100% pass | |
| Bounded non-reset JSON mutation routes |  |  |  | 100% in scope | |
| Password-reset frozen file changes | 0 |  |  | 0 | |
| Unit/integration/build result |  |  |  | no regression | |

### Completion gate

The final branch contains only changes that have:
- a security/correctness proof, or
- a measurable performance/resource benefit, or
- a clear maintainability benefit with zero behavior regression.

Everything else is deleted or reverted.

---

## Milestone 16 - Produce the final before/after report

### Goal

Create a document that proves what improved, what did not, and why the retained implementation is worth maintaining.

### Required report sections

1. Executive summary
2. Scope and constraints
3. Test machine and software versions
4. Local MongoDB replica-set setup
5. Local MinIO storage setup
6. Dataset sizes and seed method
7. Baseline commit and final commit
8. Exact commands/workflows used
9. Security findings fixed
10. Request-count changes
11. Query-count and query-plan changes
12. p50/p95/p99 changes
13. CPU/RSS changes
14. Browser data-ready changes
15. Storage workflow results
16. Viva stress results
17. Tests passed/failed/skipped, with explanations
18. Password-reset no-touch verification
19. Source/code-organization changes
20. Reverted experiments and why they were worthless
21. Remaining bottlenecks
22. Recommended next work only if measurement justifies it

### Evidence rules

- Never claim a percentage without a saved before and after value.
- Never compare runs with different datasets.
- Never compare dev server baseline to production-build after.
- Separate cold and warm results.
- Separate profiler-on DB analysis from profiler-off latency results.
- Call out noise/variance.
- State when the local environment cannot predict production behavior.
- Do not hide regressions.
- Include changes that were tested and reverted, because they demonstrate that the final design was selected by evidence rather than taste.

---

# 4. Recommended execution order

Execute in this order because it gives fast wins first, protects security, and delays structural churn until behavior is measurable:

```text
M0  scope + baseline source
M1  local Mongo replica set + MinIO
M2  deterministic seed + real baseline
M3  delete Viva polling
M4  lazy Admin reports/review
M5  fix broadcast authorization
M6  supervisorId index
M7  Viva schedule query collapse
M8  Admin report query rewrite
M9  bounded normal JSON bodies
M10 remove Admin Students duplicate work
M11 cursor review pagination
M12 remove duplicate auth/refresh work
M13 structural cleanup
M14 full real-portal regression
M15 final benchmark + keep/revert sweep
M16 final report
```

Do not begin M13 structural cleanup early. Performance work is easier to compare when filenames and call paths have not been shuffled yet.

---

# 5. Per-milestone Git discipline

For each milestone:

```text
1. reset/reseed local services
2. capture milestone-specific baseline
3. create one focused commit
4. run static/unit checks
5. run local Mongo integration
6. run local MinIO path if storage is relevant
7. run browser portal workflow
8. run measurement
9. record result
10. KEEP, REVERT, or REDESIGN
```

Suggested commit style:

```text
perf(viva): remove fixed access polling
perf(admin): defer reports until first use
fix(storage): authorize broadcasts through project membership
perf(projects): index supervisor ownership
perf(viva): read confirmed schedules from session snapshots
perf(reports): replace first-stage facet scan
security(api): bound normal json request bodies
perf(review): replace offset pagination with cursor
refactor(viva): split scheduling responsibilities
```

Do not combine unrelated milestones into one commit. The ability to revert a worthless experiment is part of the plan.

---

# 6. What not to build unless later evidence demands it

Do **not** preemptively add:

- Redis
- another caching library
- GraphQL
- a message broker
- a generic repository/data-access layer
- a dependency injection framework
- a monorepo/Turborepo migration
- WebSockets/SSE merely to replace the Viva timer
- a second S3 SDK
- a frontend state-management library
- a full observability platform just for local benchmarks
- a new test framework solely for this optimization pass

The existing stack, local MongoDB, MinIO, Node scripts, browser DevTools, Mongo `explain`, and existing Viva stress tools are sufficient to prove the first round of improvements.

Add infrastructure only after a measured remaining bottleneck demonstrates that the simple approach has reached its ceiling.

---

# 7. Final release gate

The optimization branch is ready only when all of the following are true:

- [ ] UI is functionally unchanged.
- [ ] Password-reset frozen files are byte-for-byte unchanged.
- [ ] `npm run lint` has no new failures.
- [ ] unit tests have no new failures.
- [ ] production build succeeds or only pre-existing documented failures remain.
- [ ] local MongoDB integration tests pass.
- [ ] local MinIO upload/read/delete lifecycle passes.
- [ ] student browser workflow passes.
- [ ] supervisor browser workflow passes.
- [ ] admin browser workflow passes.
- [ ] storage authorization matrix passes.
- [ ] immediate auth/session revocation behavior still passes.
- [ ] Viva workflow/integration suite passes.
- [ ] Viva HTTP stress suite has no unexpected errors.
- [ ] query plans for touched hot queries are recorded.
- [ ] before/after p50/p95 values are recorded.
- [ ] before/after request and DB-operation counts are recorded.
- [ ] CPU/RSS results are recorded.
- [ ] every retained optimization has a KEEP decision with evidence.
- [ ] worthless experiments have been reverted.
- [ ] final before/after report is complete.

The key rule is simple: **measure first, change one thing, exercise the real portal against real local persistence, measure again, and keep only what earns its complexity.**
