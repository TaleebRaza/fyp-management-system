# Viva Workflow Optimization Plan

> **Repository:** `TaleebRaza/fyp-management-system`  
> **Primary goal:** optimize the existing Viva workflow so the current deployment/resources can reliably handle approximately **50 simultaneous active Viva sessions** with lower database load, lower request latency, lower compute/memory use, and better concurrency.  
> **Execution target:** Codex (or another coding agent) should follow this document as an implementation contract, not as a loose suggestion list.
>
> **Audit baseline observed before this plan:** main was previously observed at commit `e7c2f6b` (`Allow mixed-batch student teams`). **Before changing code, verify the actual current HEAD.** If HEAD differs, record it in the implementation notes and re-check every assumption in this plan against the current code before editing.

---

## 1. Mission

Optimize the Viva workflow **without increasing infrastructure as the primary solution**.

The implementation must prioritize:

1. fewer database operations per logical user action;
2. bounded database work as the number of active/scheduled Vivas grows;
3. less transaction contention;
4. fewer unnecessary writes;
5. less response payload and serialization work where safely possible;
6. better behavior with many simultaneous sessions;
7. preserving all existing authorization, correctness, audit, scheduling, and concurrency guarantees.

The target is not merely “make benchmarks faster.” The target is to make the architecture behave predictably when approximately 50 Viva sessions are active at the same time.

---

# 2. Non-negotiable rules for Codex

Codex **must follow these rules throughout the work**.

## 2.1 Do not solve this by adding resources

Do **not** make any of the following the primary optimization:

- increasing MongoDB Atlas tier;
- increasing Vercel/server compute;
- increasing `maxPoolSize`;
- adding Redis;
- adding a queue service;
- adding a new external cache;
- adding another server;
- adding a background worker platform.

The desired result must come primarily from reducing work.

Infrastructure tuning may be considered only after query/transaction/request amplification is fixed and benchmarks prove a remaining need.

## 2.2 Preserve existing behavior unless this plan explicitly changes it

The following are invariants:

- only the authorized panel admin may start/manage/grade/finalize a Viva where current behavior requires it;
- optimistic concurrency through `version` must remain effective;
- audit events must remain atomic with the state change they describe;
- cancelled/completed sessions must not become startable again;
- the project supervisor must not become an examiner for their own project if existing validation forbids it;
- panel-size validation must remain intact;
- inactive/invalid participants must continue to be rejected according to existing rules;
- existing scheduling conflict rules must continue to work;
- active-session access restrictions must continue to work;
- a participant must not be able to occupy two active Vivas at once;
- existing API response semantics should remain compatible unless a coordinated API/UI change is explicitly performed;
- existing historical snapshots must remain readable;
- old/legacy Viva records supported by the current code must not be broken casually.

## 2.3 Mixed-batch teams are now valid

Do **not** reintroduce a same-batch assumption.

For Viva logic:

- treat `Project.members` as authoritative for team membership;
- do not infer project membership from a single batch;
- do not reject a project because its student members belong to different batches;
- add/keep a regression test proving a mixed-batch project can proceed through the relevant Viva workflow.

## 2.4 Do not weaken consistency for speed

Do not remove transactions merely to improve latency if doing so makes session state and audit state diverge.

Keep transaction boundaries around operations that require atomicity.

The goal is to make transactions **shorter and less contentious**, not to remove correctness.

## 2.5 Do not perform broad unrelated refactors

Do not:

- rename large parts of the codebase;
- change styling/UI unrelated to performance;
- upgrade framework/dependencies as part of this work;
- reformat unrelated files;
- rewrite the scheduling algorithm unless a measured Viva concurrency problem requires it;
- combine unrelated cleanup with optimization commits.

Keep diffs reviewable.

## 2.6 Do not claim an optimization without evidence

For each phase, record:

- tests run;
- before/after query counts where applicable;
- before/after timing where applicable;
- behavior under concurrent execution;
- any trade-offs introduced.

If a proposed change does not improve a measured hot path or materially simplify resource usage, do not keep it merely because it “looks cleaner.”

---

# 3. Current hot-path observations to verify before editing

Codex must independently verify these observations against the current HEAD.

Relevant files currently include:

- `lib/vivaSessionDashboard.ts`
- `lib/vivaAccessRestriction.ts`
- `lib/vivaPersistence.ts`
- `lib/vivaScheduling.ts`
- `lib/mongodb.ts`
- `models/VivaSession.ts`
- `models/VivaPanel.ts`
- `proxy.ts`
- `app/api/portal-status/route.ts`
- `lib/portalPause.ts`
- Viva API routes/call sites
- Viva UI call sites
- `tests/support/viva-workflow-runner.mjs`
- Viva integration tests under `tests/`

Verify all call sites with `rg` before changing exported types/functions.

## 3.1 Panel dashboard N+1 behavior

At the audited version, `getVivaPanelSessions()`:

1. loads panels for an examiner;
2. loads the sessions;
3. for each scheduled session, calls `readCurrentContext()`;
4. `readCurrentContext()` performs:
   - round read;
   - panel read;
   - project read;
   - participant/user read.

This makes scheduled agenda loading scale approximately with the number of sessions rather than remain bounded.

The optimization must make the normal panel-session list require a small, bounded number of queries.

## 3.2 Active-participant conflict scan

At the audited version, `startVivaSession()` calls logic equivalent to:

- load all other active sessions;
- load panels used by those sessions;
- load projects used by those sessions;
- scan them for participant overlap.

That makes the cost of starting one Viva increase as more Vivas become active.

This must be replaced with constant/bounded conflict detection.

## 3.3 User documents are currently used as locks

At the audited version, starting a Viva performs `User.updateMany(... $currentDate: { updatedAt: true })` for students/examiners to intentionally create transaction conflicts.

This:

- writes unrelated user records;
- changes `updatedAt` when user data did not change;
- creates write contention;
- wastes write capacity;
- increases transaction conflict/retry risk.

This mechanism must be removed after a dedicated participant-lock mechanism is proven.

## 3.4 Portal pause check amplifies requests

At the audited version, `proxy.ts` fetches `/api/portal-status` with `cache: 'no-store'` for many matched requests, even though pause enforcement only affects a narrower set of requests.

`getPortalPause()` performs a MongoDB read.

This creates internal request and database amplification.

## 3.5 Pool size is not the first problem

At the audited version:

```ts
maxPoolSize: 10
minPoolSize: 1
```

Do **not** increase `maxPoolSize` before reducing query and transaction amplification.

A bigger pool can simply let inefficient code overload MongoDB faster.

---

# 4. Success criteria

The work is complete only when these criteria are satisfied.

## 4.1 Correctness

All existing Viva tests pass.

Add tests for the new concurrency architecture.

No authorization or audit regression is allowed.

## 4.2 Dashboard query behavior

For a panel dashboard containing scheduled sessions, query count must no longer grow as `4N`-style per-session hydration.

Desired steady-state target:

- no sessions: as few queries as practical;
- scheduled sessions present: approximately **5 bounded reads** for the entire list, not per session:
  1. actor panels;
  2. sessions;
  3. rounds;
  4. projects;
  5. users.

The exact number may differ slightly if the final implementation has a justified reason, but it must remain **O(1) database round trips with respect to the number of sessions displayed**, excluding pagination.

## 4.3 Start-session behavior

Starting a Viva must:

- not scan all active Viva sessions;
- not read panels/projects for unrelated active sessions;
- not update `User.updatedAt` as a locking mechanism;
- use a bounded number of operations;
- reject participant collisions atomically;
- remain safe when two conflicting starts occur simultaneously.

## 4.4 Access restriction behavior

The active-Viva restriction check should become an indexed point lookup against dedicated active-participant state.

It must still distinguish the panel admin from restricted panel members if current UX allows the panel admin to continue navigating.

## 4.5 Grade/save/finalize behavior

The successful/happy path should avoid unnecessary pre-reads where an atomic conditional update can safely enforce the same rules.

Failure paths may perform a fallback read to preserve useful error semantics.

## 4.6 50-session concurrency test

A local integration/load-style test must be able to:

- create 50 independent Viva sessions;
- start them concurrently;
- save grades concurrently;
- complete them concurrently;
- produce no unexpected transaction failures;
- produce no participant-lock collisions for disjoint participants;
- produce no Mongo pool exhaustion caused by application query fan-out;
- leave no stale participant locks after completion.

Do not claim “supports 50 concurrent sessions” unless this test passes consistently on the agreed test environment.

## 4.7 Conflict-race test

When two sessions share a participant and are started concurrently:

- exactly one may acquire that participant;
- the other must fail with the expected conflict result;
- there must never be two committed active locks for one participant;
- there must never be two simultaneously active sessions containing that same participant due to a race.

---

# 5. Work order

Do the work in the following order.

Do not jump directly to connection-pool tuning.

---

# Phase 0 — Establish a reproducible baseline

## Goal

Measure the existing behavior before changing it.

## Tasks

### 0.1 Verify repository state

Record:

```bash
git rev-parse HEAD
git status --short
```

Do not proceed on an unexpectedly dirty working tree without understanding the changes.

### 0.2 Inspect call sites

At minimum run searches equivalent to:

```bash
rg "getVivaPanelSessions|getPanelAdminVivaSessions"
rg "startVivaSession"
rg "saveVivaGrade"
rg "completeVivaSession"
rg "isVivaSessionAccessRestricted"
rg "getPortalPause|portal-status|portalPaused"
rg "startedAt|completedAt|cancelledAt" lib app models tests
```

Purpose:

- identify all terminal paths that may need participant-lock cleanup;
- identify every API/UI consumer before changing DTOs;
- identify every portal-pause read/write path before adding caching.

### 0.3 Run current tests

Run at least:

```bash
npm run lint
npm run test:unit
npm run test:viva:persistence
npm run test:viva:admin
npm run test:viva:panels
npm run test:viva:scheduling
npm run test:viva:session
npm run test:viva:access
npm run test:viva:grading
npm run test:viva:cancellation
npm run test:viva:publication
npm run test:viva:workflow
npm run test:viva:auto-scheduling
npm run build
```

If the repository provides a narrower documented aggregate command, it may be used in addition, not as an excuse to skip Viva coverage.

### 0.4 Add baseline instrumentation for tests

Instrument the test environment only.

Use one of:

- Mongoose debug callback;
- MongoDB command monitoring;
- another deterministic local query counter.

Do not add noisy production logging just to count queries.

Capture at least:

- panel-session list with 1 scheduled session;
- panel-session list with 10 scheduled sessions;
- panel-session list with 50 scheduled sessions;
- start with 0 active sessions;
- start with 10 unrelated active sessions;
- start with 50 unrelated active sessions.

Record:

- DB command count;
- elapsed duration;
- operation types;
- unexpected transaction retries if observable.

The baseline should demonstrate whether query count grows with `N`.

## Phase 0 gate

Do not begin structural optimization until:

- tests are green or existing failures are documented;
- baseline query/timing data exists;
- current HEAD is recorded.

---

# Phase 1 — Remove panel-dashboard N+1 hydration

## Goal

Make `getVivaPanelSessions()` perform bounded bulk reads.

## Primary file

`lib/vivaSessionDashboard.ts`

Potential tests:

- `tests/viva-session-dashboard.integration.test.mjs`
- `tests/support/viva-workflow-runner.mjs`
- new focused query-count test if appropriate.

## Required design

### 1.1 Keep start-time snapshots semantically distinct

**Important:** do not casually populate the existing:

- `roundSnapshot`
- `projectSnapshot`
- `panelSnapshot`

at scheduling time merely to speed up the dashboard.

Those fields currently function as frozen assessment/start-time context for active/completed sessions.

If they are populated early and later treated as authoritative, edits made between scheduling and starting could be hidden.

Preferred approach for this phase:

- scheduled sessions use **batched live hydration**;
- starting a session still revalidates current authoritative round/panel/project/user state;
- start-time snapshots remain frozen at start.

### 1.2 Reuse the first panel query

The initial panel query for the actor should fetch enough fields for scheduled-session hydration:

```text
_id
roundId
examinerIds
panelAdminId
```

Do not query those same panels again per scheduled session.

### 1.3 Batch rounds and projects

After loading sessions:

- gather unique `roundId`s for scheduled sessions;
- gather unique `projectId`s for scheduled sessions;
- bulk read rounds in one query;
- bulk read projects in one query;
- run these two independent reads concurrently.

Use narrow `.select(...)` projections.

### 1.4 Batch users

From the already loaded panel/project records, gather unique:

- examiner IDs;
- project member IDs;
- project supervisor IDs if required for workspace display/validation.

Fetch all needed users in one query.

Build `Map<string, ...>` lookups in memory.

### 1.5 Avoid duplicated validation logic

Refactor current context construction so both:

- single-session `readCurrentContext()` used by start;
- batch dashboard hydration

share a **pure validation/assembly function** where practical.

For example, conceptually:

```ts
assembleCurrentContext({
  vivaSession,
  round,
  panel,
  project,
  peopleById,
  actorId,
})
```

Do not maintain two diverging copies of Viva business rules.

### 1.6 Preserve failure behavior

If a scheduled session references invalid/deleted resources, preserve current safe behavior.

Do not make one corrupt scheduled record crash the entire panel dashboard unless that is already the intended behavior.

### 1.7 Do not use one aggregation merely for cleverness

A large `$lookup` pipeline is not required.

Prefer several simple bounded indexed queries if they are easier to reason about and maintain.

The main requirement is bounded round trips, not “one Mongo query at all costs.”

## Tests for Phase 1

Add tests proving:

- 1 scheduled session is returned correctly;
- 10 scheduled sessions are returned correctly;
- multiple rounds/projects/panels hydrate correctly;
- scheduled session validation still rejects invalid state;
- mixed-batch project members remain valid;
- panel admin `canManage` behavior remains correct;
- running/completed snapshot behavior remains unchanged.

Add a query-count assertion or benchmark that demonstrates list hydration is bounded.

### Target

For many scheduled sessions belonging to actor panels:

```text
panel read
session read
round bulk read
project bulk read
user bulk read
```

Approximately five data reads total.

## Phase 1 gate

Do not continue until:

- functionality tests pass;
- query count is proven bounded;
- there is no new N+1 loop hidden inside a helper.

---

# Phase 2 — Introduce dedicated active Viva participant locks

## Goal

Replace:

- global active-session conflict scans;
- fake writes to `User.updatedAt`;

with small, indexed, purpose-built lock documents.

## New model

Create a model with a clear name such as:

`models/VivaParticipantLock.ts`

Use the repository's naming conventions.

## Required fields

Recommended shape:

```ts
{
  userId: ObjectId,
  sessionId: ObjectId,
  participantType: 'student' | 'examiner',
  restrictPortal: boolean,
  createdAt: Date
}
```

Do not store large snapshots in this collection.

## Required indexes

At minimum:

```text
unique userId
sessionId
```

Meaning:

- one user may belong to at most one active Viva;
- all locks for a session can be deleted efficiently.

If timestamps are enabled, prefer created-at only unless updated-at has a real use.

## Do not add TTL expiry

Do **not** automatically expire active Viva locks after an arbitrary duration.

A Viva may legitimately overrun its scheduled duration.

A TTL could silently allow a participant into a second active Viva.

Cleanup must be tied to the authoritative session lifecycle.

## Lock membership semantics

Preserve the behavior of the current conflict logic.

Lock:

- all project students participating in the Viva;
- all panel examiners, including panel admin.

Do **not** add the project's supervisor merely because they supervise the project unless they are also an actual panel examiner.

This mirrors the current active-participant conflict behavior.

## `restrictPortal` semantics

Recommended:

- students: `true`;
- non-admin examiners: `true`;
- panel admin: `false`.

The panel admin still receives a lock, because they must be prevented from occupying another active Viva.

`restrictPortal: false` means “not portal-restricted,” **not** “not locked.”

## Start-session algorithm

Refactor `startVivaSession()` in `lib/vivaSessionDashboard.ts`.

Desired order inside the transaction:

1. read target session;
2. reject completed/cancelled;
3. handle already-running behavior carefully;
4. read/revalidate current round/panel/project/users for an unstarted session;
5. build participant lock rows;
6. insert all participant locks in the transaction;
7. if unique constraint collides, abort transaction and return the existing user-facing participant-conflict style error;
8. atomically set `startedAt`, `vivaEndsAt`, and snapshots;
9. freeze round if required;
10. write audit event;
11. commit.

### Duplicate key handling

The unique index is the concurrency control.

Do not implement:

```text
check lock exists
then insert
```

as the only guard, because that is racy.

Attempt the insert and let the unique index arbitrate simultaneous starts.

On duplicate key:

- abort the transaction;
- return a clear expected conflict result;
- do not expose raw Mongo errors.

### Remove old locking work

After tests prove the new mechanism:

- delete `reserveStartParticipants()`;
- remove the `User.updateMany(...updatedAt...)` concurrency trick;
- delete `findActiveParticipantConflict()` and its global scan;
- remove imports/types only used by those deleted paths.

This phase should **reduce code**, not leave both implementations permanently.

## Already-running session behavior

Before changing it, inspect tests and current semantics.

At the audited version, current-context revalidation happens before returning an already-running snapshot.

Consider whether an already-running session should instead authorize against its frozen panel snapshot and return that snapshot without re-reading mutable project/panel state.

This would be faster and usually better matches frozen-session semantics.

However:

- do not silently change authorization semantics;
- write a regression test;
- if behavior is intentionally changed, document it.

## Lock cleanup

Locks must be removed in the same transaction whenever a session stops being active.

At minimum inspect and update every path that sets:

- `completedAt`;
- `cancelledAt`.

Search globally; do not assume only two functions exist.

### Completion

On successful `completeVivaSession()`:

```ts
deleteMany({ sessionId }, { session })
```

must be part of the same transaction as completion/audit.

### Cancellation

If active sessions can be cancelled, cancellation must delete their locks in the same transaction.

Deleting zero rows for a never-started scheduled session should be harmless.

### Other terminal/admin/repair paths

Search the entire repository for direct writes to `completedAt` and `cancelledAt`.

Any path capable of terminating an active session must clean locks or deliberately invoke shared lifecycle logic.

Do not leave a hidden stale-lock path.

## Deployment/migration safety

This model introduces derived active state.

Before production rollout, choose and document one safe strategy:

### Preferred operational strategy

Deploy when there are no active Viva sessions, then all future starts create locks.

OR:

### Reconciliation strategy

Create a script such as:

`script/reconcile-viva-participant-locks.mjs`
or use the repo's existing script naming convention.

The script should:

1. read active `VivaSession` records;
2. use their frozen snapshots;
3. derive examiner/student locks;
4. detect duplicate users across already-active sessions;
5. fail loudly on ambiguous/corrupt data;
6. create missing locks;
7. remove stale locks whose session is not active only in an explicit repair/apply mode.

Do **not** silently pick a winner if historical data says one user is in two active sessions.

## Tests for Phase 2

Required tests:

- one Viva starts normally;
- 50 disjoint Vivas can start concurrently;
- two simultaneous starts sharing one examiner result in exactly one success;
- two simultaneous starts sharing one student result in exactly one success;
- transaction rollback leaves no locks after failed start;
- `User.updatedAt` does not change merely because Viva started;
- completing session releases every lock for that session;
- cancelling an active session releases every lock;
- cancelling a scheduled/unstarted session is harmless;
- panel admin is locked against another Viva but is not portal-restricted;
- non-admin examiner is locked and portal-restricted;
- student is locked and portal-restricted;
- mixed-batch students lock normally.

## Phase 2 gate

Do not remove legacy conflict code until all race tests pass.

---

# Phase 3 — Make access restriction a point lookup

## Goal

Use the participant-lock collection for active-session portal restrictions.

## File

`lib/vivaAccessRestriction.ts`

## Desired query

Conceptually:

```ts
VivaParticipantLock.exists({
  userId,
  restrictPortal: true,
})
```

This should be served by the unique `userId` index.

## Rules

- invalid IDs still return safely;
- panel admin remains unrestricted if that is current intended behavior;
- student/non-admin examiner restrictions remain intact;
- no scan of active `VivaSession` snapshots should be needed in the final steady-state implementation.

## Migration caveat

Do not switch to lock-only reads in production if older active sessions can exist without lock rows.

Use the Phase 2 deployment gate/reconciliation strategy.

## Tests

Update `tests/viva-access-restriction.integration.test.mjs` or equivalent.

Include:

- student active -> restricted;
- examiner active -> restricted;
- panel admin active -> not restricted;
- completion -> unrestricted;
- cancellation -> unrestricted;
- unrelated user -> unrestricted.

## Phase 3 gate

Verify query is an indexed point lookup with `explain("executionStats")` or equivalent local evidence.

---

# Phase 4 — Shorten grade and completion transactions

## Goal

Remove unnecessary successful-path pre-reads while preserving error quality and audit atomicity.

## File

`lib/vivaSessionDashboard.ts`

## 4.1 Grade save

Current pattern is approximately:

```text
read session
authorize
validate
conditional update
audit
serialize
```

Target successful path:

```text
validate input/grade in memory
conditional update containing authorization + active state + version
audit
serialize
```

The atomic update filter should include the required state, for example:

```text
_id
version
startedAt is date
completedAt null
cancelledAt null
panelSnapshot.panelAdmin.userId == actor.id
```

Do not copy this blindly; verify exact schema/types first.

### Failure semantics

If the update returns `null`, perform a fallback read **only on the failure path** to distinguish where practical:

- not found;
- forbidden;
- not running/completed/cancelled;
- concurrent version change.

This keeps the common successful path fast while retaining useful errors.

## 4.2 Completion

Use the same pattern where safe.

Successful completion should conditionally require:

- correct session;
- correct version;
- active state;
- authorized frozen panel admin;
- a saved result.

After update:

- validate/canonicalize the returned result;
- remove participant locks in the same transaction;
- write audit event;
- return result.

If legacy malformed data is encountered, abort safely rather than finalizing corrupted data.

## 4.3 Keep transaction atomicity

Do not move the audit write outside the transaction just to reduce latency.

Do not move lock cleanup outside the transaction.

## Tests

Required:

- successful grade update;
- stale version fails;
- unauthorized examiner fails;
- completed/cancelled session fails;
- invalid grade fails before DB mutation;
- completion requires saved grade;
- completion releases locks;
- audit is still written;
- transaction rollback leaves state consistent.

## Performance acceptance

On successful grade save, no unconditional initial session read should remain unless Codex can demonstrate it is necessary for correctness.

Same principle for completion.

---

# Phase 5 — Reduce portal-status request amplification

## Goal

Stop doing pause-status work on requests where the result cannot affect behavior, then safely coalesce/cache the remaining status reads for a very short period.

## Files

- `proxy.ts`
- `app/api/portal-status/route.ts`
- `lib/portalPause.ts`
- admin portal-pause mutation code discovered via search.

## 5.1 Narrow the proxy check first

At the audited version, pause state only causes a response for API requests that are:

- not required auth routes;
- not admin requests.

Therefore, do not fetch portal status for requests where it cannot affect the result.

Construct an explicit predicate similar to:

```text
is API request
AND not portal-status itself
AND not required auth exception
AND actor is not admin
```

Verify this exactly against current desired behavior.

This change should preserve behavior while avoiding pointless internal fetches for:

- page navigation where pause was not enforced anyway;
- admin calls;
- excluded auth paths;
- the status route itself.

## 5.2 Add short-lived status coalescing/cache

After call-site inventory, implement a conservative cache for the status read.

Recommended characteristics:

- TTL around 3–5 seconds;
- single-flight/coalescing so simultaneous cache misses on one instance share one Mongo read;
- explicit invalidation in the admin mutation path on the current instance;
- no long stale window;
- preserve fail-closed behavior where currently required.

A module-level server cache is acceptable if it matches the deployment runtime.

If using a Next.js framework cache instead, verify the API is correct for the repository's pinned Next.js version before implementing it.

Do not guess based on another Next.js version.

## 5.3 Cache endpoint carefully

If changing HTTP cache headers:

- understand whether the pause reason is safe to cache publicly;
- understand same-origin/internal fetch behavior;
- keep the stale window very small;
- document maximum delay before a newly paused portal is enforced on another warm instance.

Do not introduce a long CDN cache merely for benchmark numbers.

## Tests

Add tests for:

- admin request does not require portal-status fetch;
- irrelevant page request does not require portal-status fetch if behavior is unchanged;
- protected non-admin API still enforces paused state;
- status failure remains fail-closed where intended;
- cache expires;
- concurrent cache miss is coalesced if implemented;
- explicit invalidation works on mutation path.

---

# Phase 6 — Add indexes that match the hot queries

## Goal

Add only indexes justified by actual query shapes.

## Candidate indexes

### `VivaPanel`

The hot panel lookup is:

```ts
{ examinerIds: actorId }
```

The existing unique compound index beginning with `roundId` is not an ideal direct match.

Candidate:

```ts
VivaPanelSchema.index({ examinerIds: 1 });
```

### `VivaSession`

The panel list hot query is approximately:

```ts
{
  panelId: { $in: [...] },
  cancelledAt: null
}
.sort({ scheduledAt: 1, _id: 1 })
```

Candidate:

```ts
VivaSessionSchema.index({
  panelId: 1,
  cancelledAt: 1,
  scheduledAt: 1,
  _id: 1,
});
```

### Participant locks

Required:

```text
unique userId
sessionId
```

## Index rules

Do not blindly add indexes.

For each candidate:

1. capture query shape;
2. run `explain("executionStats")` before;
3. add/apply index;
4. run explain after;
5. confirm reduced docs/keys examined and desired plan;
6. keep a record in implementation notes.

Do not remove existing indexes in the same optimization pass unless they are conclusively redundant and there is a separate index audit.

Extra indexes also consume RAM and write resources.

## Production index creation

Do not rely blindly on runtime Mongoose auto-index creation in production.

Inspect the repository's existing index migration/audit scripts:

- `indexes:refactor:audit`
- `indexes:refactor:apply`

Follow that established pattern where possible.

Create/update an explicit apply/audit script if required.

---

# Phase 7 — Reduce agenda payload and unbounded history, but only after call-site inspection

## Goal

Reduce Mongo transfer, server serialization, JSON payload, React/server memory, and client work.

This phase is valuable but more invasive than the database concurrency fixes.

Do it only after Phases 1–6 are stable.

## Problem to verify

At the audited version, `getVivaPanelSessions()` returns full workspace detail including fields such as:

- project description;
- domains;
- tools;
- all project members;
- supervisor;
- full panel;
- grade scale;
- result;
- other workspace fields.

It may also load all non-cancelled historical sessions for the actor's panels.

Verify the current UI usage.

## Preferred API shape

Separate:

### Agenda/list DTO

Only fields needed to render the list/card, for example:

```text
session ID
phase
version
scheduledAt
startedAt
vivaEndsAt
location
round name
project title
small participant summary only if displayed
canManage
result summary only if displayed
```

### Workspace/detail DTO

Fetch full:

- description;
- domains;
- tools;
- members;
- supervisor;
- panel;
- grading data;

only when the user opens/selects a specific Viva.

## Rules

- inspect every UI consumer first;
- do not break current rendering;
- avoid duplicate client requests if one detail fetch can be cached locally for the selected session;
- do not fetch all project descriptions for a screen that only shows titles/times;
- preserve running-session responsiveness.

## Historical sessions

Do not arbitrarily truncate data.

If the current panel page displays unbounded completed history:

- add explicit pagination/cursor or a separate history request;
- always include active/running and upcoming sessions;
- expose older completed sessions through intentional pagination.

Do not hide history merely to make benchmarks faster.

## Acceptance

Measure response byte size before/after on a realistic 50-session fixture.

Keep this phase only if the reduction is meaningful and the UI remains simple.

---

# Phase 8 — Re-evaluate MongoDB pool configuration only after application work

## Goal

Tune connection settings based on measured behavior, not intuition.

## Current audited values

```ts
maxPoolSize: 10
minPoolSize: 1
```

## Rules

### Do not raise `maxPoolSize` first

The optimized code should create far fewer concurrent DB operations.

Benchmark with the existing `maxPoolSize: 10` before changing it.

### Evaluate `minPoolSize`

For serverless environments, `minPoolSize: 0` may reduce idle socket retention across warm instances.

Do not change it without measuring/understanding the deployment model.

### Candidate test matrix

After all query fixes:

```text
maxPoolSize 5
maxPoolSize 10
```

Optionally another value only if deployment connection limits allow it.

Compare:

- p50/p95 latency;
- timeout count;
- connection count;
- transaction failures;
- database saturation.

Choose the smallest pool that sustains the target workload comfortably.

Do not optimize for a synthetic single request at the cost of 50-session stability.

---

# 6. Dedicated 50-session benchmark/integration harness

Create or extend a test/support runner specifically for runtime Viva concurrency.

The current workflow runner's large supervisor count is useful for panel allocation but is not sufficient evidence for 50 simultaneous active Viva sessions.

## Fixture

Create approximately:

- 1 admin;
- enough supervisors for 50 disjoint panels;
- 100+ students for 50 two-student teams;
- 50 projects;
- one or more Viva rounds as appropriate;
- 50 scheduled sessions;
- 50 disjoint participant sets for the main throughput test.

Use realistic panel sizes matching production defaults.

Avoid accidentally sharing supervisors between the 50 throughput sessions.

## Benchmark stages

### Stage A — Panel agenda

Measure list retrieval with:

- 1 session;
- 10 sessions;
- 50 sessions.

Capture:

- DB command count;
- duration;
- returned byte size if practical.

### Stage B — Concurrent starts

Use:

```ts
Promise.allSettled(...)
```

Start all 50 independent sessions as close together as practical.

Record individual durations.

Calculate:

- minimum;
- p50;
- p95;
- maximum;
- success count;
- expected/actual failure count.

### Stage C — Concurrent grades

Save a valid grade to all 50 sessions concurrently.

Record the same metrics.

### Stage D — Concurrent completions

Complete all 50 concurrently.

Record metrics.

### Stage E — Cleanup assertions

Assert:

- all expected sessions completed;
- no active participant locks remain;
- audit records exist;
- no user `updatedAt` was touched solely for locking;
- no unexpected active session remains.

## Conflict benchmark

Separately create two sessions that deliberately share one participant and race their starts.

The test must prove the unique lock is the arbiter.

Do not use scheduling validation as the only protection in this race test.

## Repeatability

Run the concurrency scenario multiple times in one test execution or provide a repeat option.

One lucky run is not sufficient evidence.

Avoid brittle absolute latency assertions in CI if CI hardware is variable.

Use correctness assertions plus query-count/bounded-work assertions, and print timing as benchmark evidence.

---

# 7. Query-count targets

These targets are intended to keep Codex focused on architecture.

## Panel list

Before:

```text
~2 + per-session hydration queries
```

After:

```text
bounded bulk reads, approximately <= 5 for scheduled list hydration
```

Do not accept a refactor that still calls a DB helper inside `sessions.map(...)`.

## Start

After optimization, start cost must not depend on the number of unrelated active sessions.

There must be no operation equivalent to:

```ts
VivaSession.find(all active sessions)
```

for conflict detection.

## Access restriction

Target:

```text
1 indexed exists lookup
```

in final steady state.

## Grade

Successful path:

- no unconditional session pre-read;
- one conditional update;
- audit write;
- transaction overhead only.

## Completion

Successful path:

- one conditional update;
- lock cleanup;
- audit write;
- no unconditional pre-read if correctness can be preserved.

---

# 8. Transaction design rules

## Keep transactions short

Inside a transaction:

- do only data required for the mutation;
- avoid scanning large unrelated collections;
- avoid bulk writes to unrelated users;
- avoid network/external calls;
- avoid CPU-heavy transformations that can happen before the transaction.

## Do validation outside transactions where safe

Examples:

- ObjectId syntax;
- grade enum/input shape;
- date validity.

Do not move validation outside if it depends on mutable authoritative DB state.

## Use unique indexes as concurrency primitives where appropriate

For active participant occupancy, prefer a unique lock document over broad application-level scans.

## Preserve optimistic concurrency

Keep `version` checks for grade/completion/reschedule behavior.

Do not replace all concurrency handling with participant locks; they solve a different invariant.

---

# 9. Data model and lifecycle invariants for participant locks

Treat this section as an implementation contract.

## Invariant A

For every active Viva session:

```text
startedAt is date
completedAt is null
cancelledAt is null
```

there should be one participant-lock document for every panel examiner and participating student.

## Invariant B

No `userId` can occur in more than one participant lock.

Enforce this in MongoDB with a unique index.

## Invariant C

Every lock's `sessionId` points to the active session it represents.

## Invariant D

Completing/cancelling the active session removes its locks atomically with terminal state.

## Invariant E

No lock is released simply because `vivaEndsAt` passed.

## Invariant F

A panel admin remains locked from participating elsewhere even if `restrictPortal === false`.

## Invariant G

Project supervisor membership alone does not create a lock unless current business rules define them as an active panel examiner.

## Invariant H

Do not derive team membership from batch.

Use `Project.members` / frozen project snapshot members.

---

# 10. Tests that must exist before the optimization is considered safe

At minimum, ensure automated coverage for:

## Dashboard

- scheduled session rendering;
- many scheduled sessions;
- running session rendering from snapshot;
- completed session rendering from snapshot;
- invalid deleted context handling;
- non-admin panel examiner can view but cannot manage if that is intended;
- panel admin can manage.

## Start

- valid start;
- duplicate click/idempotent running response behavior;
- wrong admin forbidden;
- inactive examiner invalid;
- malformed panel invalid;
- project supervisor/examiner conflict invalid;
- participant already active conflict;
- concurrent conflict race;
- disjoint concurrent starts.

## Grade

- valid grade;
- invalid grade;
- wrong actor;
- stale version;
- completed state;
- cancelled state;
- concurrent update.

## Complete

- requires grade;
- wrong actor;
- stale version;
- finalizes once;
- creates audit;
- deletes locks.

## Cancel

- scheduled cancellation;
- active cancellation;
- lock cleanup;
- completed cannot cancel;
- repeated cancellation.

## Access restriction

- student;
- examiner;
- panel admin;
- after completion;
- after cancellation;
- unrelated user.

## Mixed batch

Construct a project with students from at least two batches and verify it can:

- remain a valid project team;
- be scheduled where appropriate;
- be hydrated in panel agenda;
- start;
- create participant locks;
- grade;
- complete.

No test should merely grep source text to prove this workflow behavior.

---

# 11. Performance anti-patterns Codex must not introduce

Reject any implementation containing these patterns unless strongly justified.

## 11.1 DB call inside an unbounded list map

Bad:

```ts
await Promise.all(items.map(item => Model.findById(...)))
```

for dashboard hydration.

Batch IDs instead.

## 11.2 Check-then-insert lock race

Bad:

```ts
if (!await Lock.exists({ userId })) {
  await Lock.create(...)
}
```

Use a unique index and atomic insert.

## 11.3 Locking via unrelated entity writes

Do not touch User, Project, Panel, etc. just to force transaction conflicts.

## 11.4 Long cache for portal pause

Do not create a 30–60 second stale pause window to make performance numbers look good.

## 11.5 Giant aggregation without need

Do not replace understandable bounded queries with a fragile aggregation pipeline solely to reduce the query counter from 5 to 1.

## 11.6 Raising pool size to hide N+1

Not acceptable.

## 11.7 Premature snapshots

Do not make scheduled-session data permanently stale just to avoid live hydration.

## 11.8 Swallowing duplicate-key errors

A participant-lock duplicate is an expected business conflict.

Translate it into a known result; do not hide or generically 500 it.

## 11.9 Removing detailed tests because internals changed

Update tests to assert behavior, not implementation text.

---

# 12. File-by-file implementation checklist

This list is a guide. Codex must verify actual current files before editing.

## `models/VivaParticipantLock.ts` — new

- [ ] small schema;
- [ ] `userId`;
- [ ] `sessionId`;
- [ ] participant type;
- [ ] `restrictPortal`;
- [ ] unique user index;
- [ ] session index;
- [ ] no TTL.

## `lib/vivaSessionDashboard.ts`

- [ ] extract reusable pure current-context validation/assembly if needed;
- [ ] replace scheduled-session N+1 with batch hydration;
- [ ] preserve start-time snapshot semantics;
- [ ] integrate participant-lock insert on start;
- [ ] remove global active-session scan after tests pass;
- [ ] remove User fake-lock update;
- [ ] shorten grade successful path;
- [ ] shorten completion successful path;
- [ ] delete participant locks on completion;
- [ ] avoid large unrelated refactor.

## `lib/vivaAccessRestriction.ts`

- [ ] use indexed participant-lock lookup;
- [ ] preserve invalid-ID safety;
- [ ] preserve panel-admin exception.

## `lib/vivaScheduling.ts`

- [ ] identify cancellation path(s);
- [ ] delete active-session locks on cancellation in same transaction;
- [ ] do not disturb scheduling conflict behavior;
- [ ] do not reintroduce batch assumptions.

## `models/VivaPanel.ts`

- [ ] add justified examiner lookup index if explain proves useful.

## `models/VivaSession.ts`

- [ ] add justified panel/list index;
- [ ] do not repurpose start snapshots as schedule snapshots without explicit design;
- [ ] do not remove legacy schema compatibility casually.

## `proxy.ts`

- [ ] only fetch pause status when pause result can actually affect request;
- [ ] preserve fail-closed behavior for relevant API requests;
- [ ] do not expand middleware DB access.

## `lib/portalPause.ts`

- [ ] inspect all call sites;
- [ ] add short cache/single-flight if appropriate;
- [ ] provide explicit invalidation;
- [ ] keep a fresh-read path if admin UI requires it.

## `app/api/portal-status/route.ts`

- [ ] coordinate cache semantics with proxy/cache implementation;
- [ ] do not leave `no-store` if it defeats the chosen safe cache strategy;
- [ ] preserve correct error handling.

## Portal-pause admin mutation file(s)

- [ ] invalidate local status cache immediately after successful mutation;
- [ ] preserve audit/security behavior.

## Integration tests

- [ ] update existing behavior tests;
- [ ] add lock race tests;
- [ ] add 50-session concurrency test;
- [ ] add query-count/bounded-work test;
- [ ] add mixed-batch Viva workflow test.

## Scripts

- [ ] follow existing index apply/audit pattern;
- [ ] add participant-lock reconciliation/audit script if deployment can encounter active legacy sessions.

---

# 13. Commit strategy

Do not make one giant commit.

Recommended sequence:

## Commit 1 — measurement/tests

- baseline/concurrency harness;
- query-count helper;
- no production behavior change.

## Commit 2 — batch panel-session hydration

- remove N+1;
- relevant tests.

## Commit 3 — participant-lock model and start path

- model/index;
- start locking;
- race tests;
- remove old User-write/global-scan mechanism only when passing.

## Commit 4 — lock lifecycle/access restriction

- completion/cancellation cleanup;
- access restriction point lookup;
- reconciliation tooling if required.

## Commit 5 — grade/completion transaction shortening

- happy-path conditional writes;
- fallback failure reads;
- tests.

## Commit 6 — portal-status amplification reduction

- narrow proxy predicate;
- short cache/coalescing;
- tests.

## Commit 7 — hot-query indexes/migration

- explain evidence;
- apply/audit script.

## Commit 8 — payload/pagination optimization

Only if measured and needed.

## Commit 9 — pool tuning

Only if benchmarks show a justified change.

Each commit should be independently reviewable and should leave tests green.

---

# 14. Benchmark report Codex must produce

At the end, create a concise implementation report, e.g. `VIVA_OPTIMIZATION_RESULTS.md`, or include equivalent detail in the PR description.

Include:

## Environment

```text
commit before:
commit after:
Node version:
MongoDB test environment:
test command:
pool settings:
```

## Panel list

Table:

```text
Sessions | Before queries | After queries | Before ms | After ms | Before bytes | After bytes
1
10
50
```

If payload split is not implemented, bytes may be omitted.

## Concurrent start

```text
50 sessions:
successes:
unexpected failures:
p50:
p95:
max:
transaction retry/errors:
```

## Grade

Same metrics.

## Completion

Same metrics.

## Database behavior

State explicitly:

- active-session global scan removed: yes/no;
- User fake-lock writes removed: yes/no;
- access restriction point lookup: yes/no;
- stale locks after benchmark: count;
- query plan evidence for new indexes.

## Trade-offs

Document:

- portal pause cache maximum staleness;
- any API changes;
- any migration/rollout requirement;
- any remaining known bottleneck.

Do not write “50 sessions supported” if the actual 50-session scenario has not been run successfully.

---

# 15. Rollout plan

## Before deployment

- [ ] all tests green;
- [ ] build green;
- [ ] new indexes applied/verified;
- [ ] active participant-lock migration strategy chosen;
- [ ] if lock-only access reads are enabled, confirm existing active sessions have locks;
- [ ] verify no duplicate active participants in current production data;
- [ ] record current Mongo connection usage;
- [ ] keep previous release available for rollback.

## Deployment gate for participant locks

Before switching fully to lock-based reads/conflicts:

Either:

```text
active Viva count == 0
```

or:

```text
reconciliation completed successfully
```

Do not assume there are no active sessions.

## After deployment

Monitor:

- API latency;
- Mongo connections;
- Mongo operation rate;
- transaction errors/retries;
- duplicate-key participant conflicts;
- portal-status error rate;
- stale participant locks;
- start/grade/complete failures.

## Rollback concern

If rolling application code back to a version that does not understand participant locks:

- locks become unused derived records;
- they must not be allowed to corrupt future redeployment.

Document whether rollback requires clearing/reconciling the lock collection after confirming no active sessions.

Never delete locks blindly while active sessions exist.

---

# 16. Definition of done

The optimization is complete only when all of the following are true.

- [ ] Current HEAD/baseline was recorded.
- [ ] Existing Viva behavior tests pass.
- [ ] Mixed-batch project behavior is covered by executable workflow tests.
- [ ] Panel-session scheduled hydration no longer does per-session DB reads.
- [ ] Dashboard query count is bounded.
- [ ] Starting a Viva does not scan all unrelated active sessions.
- [ ] Starting a Viva does not touch `User.updatedAt` for locking.
- [ ] Dedicated participant locks use a unique user index.
- [ ] Concurrent conflicting starts are race-safe.
- [ ] Completion deletes participant locks atomically.
- [ ] Active cancellation deletes participant locks atomically.
- [ ] Access restriction uses the lock collection in steady state.
- [ ] Grade happy path avoids unnecessary read-before-write.
- [ ] Completion happy path avoids unnecessary read-before-write where safe.
- [ ] Portal-status fetch is skipped when it cannot affect the request.
- [ ] Remaining portal-status reads are safely coalesced/cached if implemented.
- [ ] Hot-query indexes have `explain` evidence.
- [ ] `maxPoolSize` was not increased to hide inefficient queries.
- [ ] 50 disjoint sessions can start concurrently in the test scenario.
- [ ] 50 sessions can grade concurrently.
- [ ] 50 sessions can complete concurrently.
- [ ] No stale participant locks remain after the completed benchmark.
- [ ] No unexpected transaction/pool failures occur.
- [ ] Final benchmark/report documents actual results and remaining limits.
- [ ] Production rollout/migration instructions are documented.

---

# 17. Stop conditions

Codex must stop and investigate instead of pushing forward if any of these occur:

1. a change causes audit events to be non-atomic with state changes;
2. two conflicting Vivas can both start;
3. a panel admin loses required control of their running Viva;
4. a student/non-admin examiner can bypass an active-session restriction unexpectedly;
5. mixed-batch teams become invalid;
6. scheduled-session snapshots become stale in a way that changes start-time truth;
7. new indexes materially increase write/resource cost without improving the target queries;
8. 50-session failures are being “fixed” only by increasing the DB pool;
9. the implementation requires a broad unrelated rewrite;
10. a migration can strand users behind stale locks;
11. a production deployment could switch to lock-only reads while active sessions lack locks.

When a stop condition occurs:

- keep the failing regression test;
- identify the violated invariant;
- correct the design;
- do not hide the issue with retries/timeouts/resource increases.

---

# 18. Preferred final architecture

The intended steady-state architecture is:

```text
Panel agenda request
    |
    +-- one panel read
    +-- one session read
    +-- bounded bulk context reads
    |
    --> no per-session DB hydration

Start Viva
    |
    +-- read/revalidate only this session's current context
    +-- insert unique participant locks
    +-- snapshot start context
    +-- mark started
    +-- audit
    |
    --> no global active-session scan
    --> no fake User writes

During active Viva
    |
    +-- access restriction = indexed participant-lock lookup
    +-- grade = conditional update + audit
    |
    --> bounded work independent of number of other Vivas

Complete/cancel
    |
    +-- terminal state update
    +-- delete session participant locks
    +-- audit
    |
    --> atomic cleanup

Portal pause
    |
    +-- checked only where it matters
    +-- very short safe caching/coalescing
    |
    --> no DB read amplification on irrelevant requests
```

The key property is:

> **The amount of work required for one Viva must remain approximately constant as the number of unrelated active Vivas grows from 1 to 50.**

That is the architectural condition Codex should optimize for.

---

# 19. First actions for Codex

Start with these actions only:

1. verify current HEAD and working tree;
2. re-read the listed hot-path files;
3. run all current Viva tests;
4. add/prepare query-count and 50-session baseline instrumentation;
5. record baseline behavior;
6. implement Phase 1 only;
7. prove Phase 1;
8. proceed phase-by-phase.

Do **not** begin by editing `lib/mongodb.ts`.

Do **not** begin by increasing connection limits.

Do **not** begin by creating a new infrastructure dependency.

Reduce the work first.
