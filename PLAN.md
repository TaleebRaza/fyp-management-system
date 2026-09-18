# Viva Performance and Workflow Optimization Plan

> Repository: `TaleebRaza/fyp-management-system`
>
> Execution target: Codex
>
> Primary objective: reliably support at least **50 concurrent Viva sessions**, make **Start Viva** feel immediate, and reduce unnecessary loading/work between Viva actions with the **smallest safe code change possible**.
>
> This plan is intentionally smaller than the repository's existing optimization plan because most of the major backend optimizations have already been implemented.

---

## 1. Rules Codex must follow

These rules are mandatory for every step in this plan.

1. **Do not add any dependency.**
   - Do not change `dependencies` or `devDependencies` in `package.json`.
   - Do not add Redis, queues, WebSockets, SSE libraries, caching packages, load-test packages, or state-management packages.

2. **Do not increase infrastructure as the solution.**
   - Do not increase `maxPoolSize`.
   - Do not change MongoDB tier.
   - Do not increase Vercel resources.
   - Do not add workers or another service.

3. **Do not rewrite working Viva code.**
   - Preserve participant locks.
   - Preserve transactions where state and audit data must remain atomic.
   - Preserve optimistic concurrency using `version`.
   - Preserve current authorization rules.
   - Preserve current snapshots for started/completed sessions.
   - Preserve cancellation and lock cleanup behavior.

4. **Prefer deletion of work over addition of abstractions.**
   - Fewer queries/writes are preferred to caches or new helper layers.
   - Reuse existing response data instead of adding another endpoint.
   - Reuse existing component state instead of introducing new global state.

5. **No speculative optimization.**
   - Measure the current path first.
   - A production change must either:
     - remove a database/network operation from a hot path;
     - remove shared write contention;
     - remove an unnecessary client refetch/re-render; or
     - remove a user interaction/loading step.
   - If a change does not produce one of those outcomes, revert it.

6. **No stale code.**
   - Remove code made unnecessary by the final implementation.
   - Remove temporary logging/instrumentation before completion.
   - Do not leave abandoned helpers, alternate code paths, TODOs, or duplicate state.

7. **Do not create duplicate planning documents.**
   - The repository already contains `PLAN.md` describing the earlier optimization work.
   - If this file is copied into the repository, use it to replace/supersede the old plan rather than permanently keeping both `PLAN.md` and `Plan.md`.

---

# 2. Current verified baseline

Do **not** redo work that is already complete.

The current repository already has the following important optimizations:

- dedicated `VivaParticipantLock` records with a unique `userId` constraint;
- no global scan of every running Viva during Start;
- no fake writes to `User.updatedAt` for locking;
- batched Viva agenda hydration instead of per-session N+1 queries;
- indexed panel/session/participant-lock lookups;
- grade save using a conditional update instead of an unconditional pre-read on the happy path;
- completion using a conditional update instead of an unconditional pre-read on the happy path;
- participant-lock cleanup during completion/cancellation;
- five-second portal-pause cache with concurrent read coalescing;
- a 50-concurrent-session local benchmark.

The recorded local benchmark is approximately:

| Operation | 50/50 success | p50 | p95 |
| --- | ---: | ---: | ---: |
| Start | yes | ~404 ms | ~412 ms |
| Save grade | yes | ~84 ms | ~92 ms |
| Complete | yes | ~109 ms | ~118 ms |

The current 50-session benchmark, however, creates **50 different Viva rounds**. It does not prove the more realistic case where many sessions start concurrently under **one shared round**.

The current `startVivaSession()` hot path still performs an idempotent write to the shared `VivaRound.frozenAt` document during every initial Start transaction. That shared document is the main remaining backend contention candidate.

The current Start result already returns a complete `workspace`, so the client should not need to reload the entire Viva agenda after Start.

---

# 3. Changes intentionally NOT included

Do not implement the following in this pass unless this plan explicitly reaches a measurement gate that requires it.

## 3.1 Do not split the agenda API yet

The measured 50-session agenda response is about 58 KB and the query count is already bounded at about five reads.

A separate list/detail API would add:

- new DTOs;
- new route/API behavior;
- new client fetching state;
- more failure/loading states;
- more tests.

That is not justified by the current measured payload.

## 3.2 Do not add history pagination yet

Only add pagination later if real completed-history growth is measurably slowing the page. Do not add it solely for theoretical scale.

## 3.3 Do not merge Save Grade and Complete Viva

Both operations are currently fast. Combining them changes API semantics and workflow for a relatively small backend gain.

The better minimal improvement is to avoid unnecessary refetches after both operations.

## 3.4 Do not add WebSockets, SSE, or aggressive polling

They are unnecessary for the target workload and add complexity.

Timers should remain client-side based on server timestamps.

## 3.5 Do not prefetch PDFs as part of this pass

Start must remain independent from remote file operations. PDF prefetching is a secondary UX optimization and should not be mixed into the concurrency/Start-latency change.

## 3.6 Do not tune MongoDB pool size

The current optimized benchmark already passes with `maxPoolSize: 10`.

Do not hide application-level work by increasing the pool.

---

# 4. Step 0 - Re-verify the current HEAD and actual Start path

## Goal

Ensure Codex edits the current implementation rather than assumptions from an older commit.

## Changes

No production changes in this step.

## Actions

Run:

```bash
git rev-parse HEAD
git status --short
```

Inspect the exact hot-path call sites:

```bash
rg -n "startVivaSession|saveVivaGrade|completeVivaSession" app components lib tests
rg -n "Start Viva|Complete Viva|Save Grade" app components
rg -n "router\.refresh|refresh\(|refetch|load.*Viva|fetch.*viva" app components
rg -n "frozenAt|confirmedAt" app components lib models tests
rg -n "portal-status|getPortalPause|shouldEnforcePortalPause" app lib proxy.ts tests
```

Record the actual files containing:

- the Start API route;
- the Start button/click handler;
- the grade mutation handler;
- the completion mutation handler;
- the panel session state/list;
- any full agenda reload performed after a mutation.

Run the existing baseline tests:

```bash
npm run test:viva:performance
npm run test:viva:session
npm run test:viva:admin
npm run test:viva:scheduling
npm run test:viva:grading
npm run test:viva:cancellation
npm run test:viva:workflow
npm run lint
npm run build
```

Do not fix unrelated pre-existing failures during this task. Record them separately.

## How to test properly

Use the existing local MongoDB replica-set test environment used by the repository.

For the browser-side delay, open the supervisor/panel page in a staging or development deployment and use the browser Network panel:

1. click **Start Viva** once;
2. identify the Start mutation request;
3. check whether another Viva agenda/dashboard request is immediately triggered afterward;
4. record total Start request duration;
5. record whether the UI shows feedback immediately or remains visually unchanged until the request finishes.

Do not add permanent logging for this measurement.

## Minimality check

At the end of Step 0:

```bash
git diff --exit-code
```

There should be no production diff.

## Completed means

Step 0 is complete when:

- current HEAD is recorded;
- current tests are known;
- exact Start/grade/complete client call sites are identified;
- it is known whether Start causes a second client-side reload/refetch;
- current local performance numbers are recorded;
- no production code has changed.

---

# 5. Step 1 - Add the missing realistic 50-session shared-round test

## Goal

Prove the architecture works when 50 independent Viva sessions belong to the **same Viva round**, which is the important case the current benchmark does not exercise.

This is the first change because it determines whether the remaining shared-round write is actually a problem.

## Primary file

Prefer modifying the existing file only:

```text
tests/support/viva-performance-runner.mjs
```

Do not create a new performance framework or add a package.

## How to implement

Keep the current independent-round benchmark because it is useful as a control.

Add one additional shared-round scenario using existing seeded users/projects where practical.

The fixture should contain:

```text
1 confirmed Viva round
50 Viva sessions
50 panels
50 disjoint examiner pairs
50 disjoint student teams
all 50 sessions -> same roundId
```

Requirements:

- all participants must be disjoint across the 50 sessions;
- each session must have a valid panel admin;
- the round should be confirmed before Start if the normal workflow requires confirmation;
- participant locks from the earlier benchmark must be cleaned before this scenario starts;
- do not introduce sleeps or staggered Start calls;
- launch the 50 Start operations in the same concurrent batch using the existing timing helper.

Measure at least:

- success count;
- unexpected failure count;
- p50;
- p95;
- maximum duration;
- participant-lock count after Start;
- stale lock count after cleanup/completion.

Also verify that every session has `startedAt` after the batch.

If the existing test helper can count Mongo commands without significant extra code, record the number of round `findAndModify`/update operations. If adding that counter would create substantial instrumentation, skip it; latency and correctness are more important.

## Correctness assertions

The test must assert:

```text
50 successful starts
0 unexpected failures
50 started sessions
expected participant-lock count
no duplicated participant locks
0 stale locks after terminal cleanup
```

Keep the existing shared-examiner and shared-student race tests. They remain required.

## How to test

Run repeatedly, not once:

```bash
npm run test:viva:performance
npm run test:viva:performance
npm run test:viva:performance
```

Use the median of the three p95 observations for comparison. This avoids making a design decision from one noisy local run.

## Minimality check

- Modify the existing performance runner instead of creating another test framework.
- Reuse existing factories/helpers/seeded participants.
- Do not introduce a dependency.
- Do not add production instrumentation.

Review:

```bash
git diff -- tests/support/viva-performance-runner.mjs
```

The diff should contain only fixture/test logic required for the shared-round case.

## Decision gate

### If the shared-round scenario already performs acceptably

If all 50 starts succeed consistently and shared-round p95 is close to the independent-round p95 with no transaction instability, **do not change the round-freezing implementation merely for theory**.

Proceed to Step 3.

### If the shared-round scenario is materially worse

Treat it as confirmed shared-document contention and perform Step 2.

A reasonable signal is any of:

- transaction failures/retries visible to the test;
- 50/50 does not complete reliably;
- shared-round p95 is more than about 20% slower than the independent-round p95;
- shared-round max latency has a large serialization spike;
- removing the round write later clearly removes one hot write per Start and materially reduces p95.

## Completed means

Step 1 is complete when:

- the existing performance test includes a 50-session / one-round scenario;
- the scenario passes three consecutive runs or exposes a reproducible issue;
- the decision to keep or remove the Start-time round write is based on evidence.

---

# 6. Step 2 - Remove the shared VivaRound write from Start, only if Step 1 proves it is needed

## Goal

Remove the only obvious shared document write from 50 simultaneous Start transactions while preserving existing correctness.

## Why this is the preferred backend change

The current Start path writes this shared state:

```text
VivaRound.frozenAt
```

Every session in the same round can therefore touch one MongoDB document.

The application already has a separate `confirmedAt` round state. Confirmation already prevents normal round/panel/schedule edits. Therefore the minimal design is:

1. require a round to be confirmed before it can start;
2. stop writing the round document during Start;
3. preserve the existing "a round that has ever started cannot be deleted" rule by checking for a started session in the rare admin delete path instead of writing shared round state on every hot Start path.

This moves work from a high-frequency concurrency path to a rare administrative path.

## Files

Expected files:

```text
lib/vivaSessionDashboard.ts
lib/vivaRoundAdmin.ts
tests/support/viva-performance-runner.mjs
relevant existing Viva integration test runner(s)
```

Do not create a new model, collection, or service.

## 6.1 Require confirmation before Start

In `lib/vivaSessionDashboard.ts`:

1. add `confirmedAt?: Date | null` to the local `VivaRoundRecord` type;
2. include `confirmedAt` in the existing round projection used by `readCurrentContext()`;
3. after reading the round/panel/project and before doing more work, reject Start when `confirmedAt` is not a valid date.

Use a clear existing-style error such as:

```text
This Viva round must be confirmed before sessions can start.
```

Do not add another query. This must use the same existing round read.

Do not change snapshot behavior.

## 6.2 Remove the Start-time round update

Delete the Start hot-path block that performs the idempotent `VivaRound.findOneAndUpdate(... frozenAt ...)`.

Do not replace it with:

- another shared lock document;
- a cache;
- a second transaction;
- a fire-and-forget write;
- a background job;
- a larger retry policy.

The point of this change is to remove the shared write entirely.

## 6.3 Preserve delete safety in the rare admin path

The current system uses `frozenAt` to stop deletion after a round has started.

Because new starts will no longer write `frozenAt`, update `deleteVivaRound()` so it also rejects deletion if **any** session in the round has ever started.

Inside the existing delete transaction, use a narrow existence query equivalent to:

```js
VivaSession.exists({
  roundId,
  startedAt: { $type: 'date' },
})
```

Keep the existing `frozenAt` check for backward compatibility with previously created data.

The rule becomes:

```text
legacy frozenAt exists -> reject delete
OR
any started session exists -> reject delete
```

Do not load full session documents. Use `exists()` or an equally narrow indexed/existence query.

Preserve current behavior where a **confirmed but never-started** round may still be deleted, unless current HEAD has intentionally changed that behavior.

## 6.4 Do not remove `frozenAt` blindly

Search all call sites first:

```bash
rg -n "frozenAt" app components lib models tests
```

`frozenAt` may be needed for legacy records or user-visible state.

Do not perform a schema migration merely to remove this field during this optimization.

It is acceptable for the field to remain as a backward-compatibility marker. It must simply stop being a write dependency of the Start hot path.

## Required tests

Add or update existing tests to prove:

1. an unconfirmed round cannot Start;
2. a confirmed round can Start;
3. a confirmed but never-started round can still be deleted if that is current expected behavior;
4. a round with any started session cannot be deleted;
5. 50 sessions in one confirmed round start concurrently;
6. participant conflicts still allow exactly one winner;
7. failed Starts leave no participant locks;
8. audit events remain present for every successful Start;
9. existing round/panel/schedule immutability after confirmation still works.

## Performance test

Run:

```bash
npm run test:viva:performance
npm run test:viva:performance
npm run test:viva:performance
```

Compare the shared-round p95 before and after.

Also compare the independent-round control to ensure no regression.

## Minimality check

The production change should be very small:

- one existing projection gains `confirmedAt`;
- one confirmation guard is added;
- one shared round update block is deleted;
- one rare delete-safety existence check is added.

Do not refactor adjacent Viva code.

Review:

```bash
git diff -- lib/vivaSessionDashboard.ts lib/vivaRoundAdmin.ts
```

If the diff expands into unrelated helpers/refactors, reduce it.

## Keep/revert gate

Keep Step 2 only if it provides a concrete benefit:

- eliminates the shared round write from every Start; and
- preserves all correctness tests; and
- improves or stabilizes the one-round 50-start benchmark.

If it does not provide a measurable/stability benefit, revert the production change and keep the Step 1 test.

## Completed means

Step 2 is complete when:

- Start performs no write to a shared round document;
- only confirmed rounds can Start;
- delete safety is preserved;
- all Start/audit/participant-lock invariants pass;
- the 50-session shared-round test passes repeatedly;
- no new dependency/model/service exists.

---

# 7. Step 3 - Make Start/Grade/Complete update the UI from mutation responses instead of reloading the agenda

## Goal

Make the supervisor panel respond immediately and eliminate unnecessary loading after mutations.

This is likely the highest-value fix for the reported "Start Viva takes 1-2 seconds" user experience if the client currently waits for a full refetch after the mutation.

## Important existing capability

The backend functions already return updated workspace state:

```text
startVivaSession -> workspace
saveVivaGrade -> workspace
completeVivaSession -> workspace
```

The client should consume this returned state directly.

## Files

Use `rg` from Step 0 to locate the existing panel component and API calls.

Do not create a second Viva state store.

## 7.1 Give immediate click feedback

When **Start Viva** is clicked:

1. set the existing loading/pending state immediately, before awaiting `fetch`;
2. disable the Start button while the request is active;
3. change the button/status text immediately to `Starting...` or the existing loading indicator;
4. do **not** optimistically mark the session as truly running before the server confirms it.

Why:

- immediate feedback removes the feeling that the click did nothing;
- avoiding a fake running state avoids rollback complexity and false timers when Start fails.

Use existing local state if available. Do not add a new global store.

## 7.2 Replace only the changed workspace on success

After a successful Start response:

- take the returned `workspace`;
- replace the matching session in the existing client session array/state by ID;
- select/open that returned workspace if the UI has a selected-session concept;
- clear the pending state.

Conceptually:

```ts
setSessions((current) =>
  current.map((session) =>
    session.id === result.workspace.id ? result.workspace : session
  )
);
```

Adapt this to the existing state shape rather than creating a parallel representation.

## 7.3 Remove redundant post-mutation reloads

If the Start success path currently performs any of the following:

```text
router.refresh()
loadVivaSessions()
fetchAgenda()
refetch()
full dashboard reload
```

remove that call **when the mutation response already contains the authoritative updated workspace**.

Apply the same rule to Save Grade and Complete Viva if those success paths also refetch the full agenda.

Do not remove recovery/error reload behavior if it is genuinely required after a concurrency error.

## 7.4 Preserve server authority

The server remains authoritative.

On error:

- do not modify the session phase;
- clear the pending state;
- show the current existing error message;
- if the server reports `concurrent-change`, use the existing recovery/reload behavior if needed.

Do not build an optimistic rollback system for this task.

## 7.5 Avoid timer-driven network requests

Verify the running Viva timer derives from returned `startedAt`/`vivaEndsAt` and updates locally.

Do not add polling for the timer.

If a timer currently triggers network requests each second, remove that polling and calculate remaining time locally from server timestamps.

Only do this if such polling actually exists.

## How to test

### Browser network test

For each mutation:

1. Start Viva;
2. Save Grade;
3. Complete Viva.

The Network panel should show the mutation request, but there should be **no automatic second full Viva agenda/dashboard request** solely to update the changed card/workspace.

### UI behavior test

Verify:

- Start button visibly enters pending state immediately;
- double clicks cannot send two requests;
- successful response changes the session to running;
- server `startedAt` drives the timer;
- failed Start returns the UI to the scheduled state;
- grade result changes immediately from the mutation response;
- completion changes immediately from the mutation response;
- no stale version is reused after a successful mutation.

### Existing automated tests

Run any existing UI/unit tests covering the component, plus:

```bash
npm run test:viva:session
npm run test:viva:grading
npm run test:viva:workflow
npm run lint
npm run build
```

## Minimality check

This step should mostly **delete** post-mutation reload calls and reuse the returned `workspace`.

Do not:

- introduce React Query/TanStack Query;
- add Redux/Zustand/context for this;
- create a new API;
- create a duplicate workspace DTO;
- add optimistic rollback machinery.

Review the diff and confirm that the existing state object remains the single client source of truth.

## Completed means

Step 3 is complete when:

- clicking Start gives immediate visible feedback;
- Start success updates the existing workspace directly;
- grade success updates the existing workspace directly;
- complete success updates the existing workspace directly;
- no unnecessary full agenda/dashboard refetch happens after those successful mutations;
- duplicate clicks are prevented;
- no new state library or API exists.

---

# 8. Step 4 - Auto-advance to the next Viva using data already in memory

## Goal

Reduce dead time between one completed Viva and the next without adding backend work.

This is a human-workflow optimization, not a database redesign.

## Gate before implementation

Only implement this if the current panel UI makes the examiner manually return to the agenda and reopen the next scheduled Viva after completion.

If the current UI already advances naturally, skip this step.

## How to implement

After successful `completeVivaSession`:

1. update the completed session from the returned workspace as described in Step 3;
2. use the **already-loaded session array** to find the next scheduled session for that panel;
3. update the existing selected-session state to that next session.

Prefer the existing sort order (`scheduledAt`, then ID) rather than writing another scheduling algorithm.

Do not fetch the next Viva again if its workspace is already present in the current state.

Do not automatically Start the next Viva. The panel admin must still intentionally click Start.

## How to test

With at least three sessions in one panel:

1. Start session 1;
2. save grade;
3. complete session 1;
4. verify session 2 becomes the selected/visible next Viva without another agenda fetch;
5. verify session 2 remains scheduled until the admin explicitly clicks Start;
6. complete the last session and verify no invalid next selection is produced.

## Minimality check

This step should be a small client-state change only.

Skip it if it requires:

- a new endpoint;
- a new prefetch system;
- a new state store;
- substantial component restructuring.

## Completed means

Step 4 is complete when the next already-loaded scheduled Viva is shown automatically after completion with no extra request and no automatic Start.

---

# 9. Step 5 - Portal-status latency gate; change only if measurement proves it matters

## Goal

Avoid changing portal-maintenance semantics unless the internal `/api/portal-status` hop is a material part of the remaining Start delay.

The current implementation already has a five-second in-process cache and read coalescing. The remaining cost is primarily the middleware's internal HTTP fetch.

## Do not change this by default

After Steps 1-4, measure a warm deployed Start again.

If the Start interaction is now acceptable, **leave portal pause code unchanged**.

That is the most minimal result.

## When a change is justified

Only continue if tracing/logs show the portal-status middleware fetch is consistently material, for example:

- more than roughly 100 ms of the Start request; or
- more than roughly 20% of the warm Start latency.

Use existing platform/Sentry logs if available. If temporary timing logs are required, add them only in a staging branch and remove them before final completion.

## Preferred no-dependency solution if proven necessary

Do **not** import Mongoose/database code directly into Edge middleware.

Instead, for the exact latency-critical Viva mutation routes only:

1. verify the route handlers already enforce authentication and role/panel authorization independently;
2. exclude those exact mutation routes from the proxy's portal-pause internal HTTP fetch;
3. call existing `getPortalPause()` directly inside those Node route handlers before performing the mutation;
4. fail closed if portal state cannot be read;
5. reuse the existing five-second cache and invalidation logic;
6. do not create another cache/helper unless the same three routes would otherwise duplicate more than a few lines.

This replaces:

```text
middleware -> HTTP /api/portal-status -> cached DB helper -> route
```

with:

```text
middleware auth/normal routing -> route -> cached DB helper -> mutation
```

for only the hot Viva mutation routes.

## Required safety tests

If this optional change is made, prove:

- portal paused -> Start is rejected;
- portal paused -> grade is rejected;
- portal paused -> complete is rejected;
- portal available -> all three work;
- admin/role/panel authorization remains unchanged;
- portal-status failures still fail closed;
- non-Viva routes retain current proxy behavior.

## Minimality check

If moving the pause check requires broad middleware or route refactoring, do not do it in this pass.

No new cache package, edge database library, shared service, or route should be created.

## Completed means

Either:

- measurement shows portal-status is not material and no code changes are made; **or**
- the internal HTTP hop is removed only from proven hot Viva mutation routes while pause/security behavior remains identical.

---

# 10. Step 6 - Final verification and cleanup

## Goal

Prove the final code is smaller in work performed, safe under concurrency, and free of optimization clutter.

## 10.1 Run the complete relevant test set

Run:

```bash
npm run test:viva:persistence
npm run test:viva:admin
npm run test:viva:panels
npm run test:viva:scheduling
npm run test:viva:session
npm run test:viva:access
npm run test:viva:grading
npm run test:viva:cancellation
npm run test:viva:workflow
npm run test:viva:auto-scheduling
npm run test:viva:performance
npm run test:portal-pause:cache
npm run lint
npm run build
```

Run `test:viva:performance` three times for final reported concurrency numbers.

## 10.2 Required final concurrency results

The final one-round scenario must produce:

```text
50 requested starts
50 successful starts
0 unexpected failures
0 duplicate participant occupancy
0 stale participant locks after completion
```

The shared-round p95 should not show severe serialization relative to the independent-round control.

If Step 2 was implemented, record before/after shared-round p50/p95/max in the existing `VIVA_OPTIMIZATION_RESULTS.md` instead of creating another benchmark document.

## 10.3 Required final browser behavior

In a warm deployment:

- click feedback appears immediately;
- only the necessary mutation request is triggered by Start;
- there is no success-path full agenda refetch if the returned workspace is sufficient;
- running UI uses the server-returned Start state;
- grade/complete update directly from their mutation responses;
- completing a Viva does not create unnecessary loading before the next already-loaded session.

Do not use a hard absolute production latency pass/fail threshold without considering deployment geography.

The important acceptance conditions are:

1. local backend remains around the established sub-second range;
2. shared-round performance is stable at 50 concurrent starts;
3. client-side extra round trips are removed;
4. UI acknowledges the click immediately.

## 10.4 Verify no dependency/infrastructure changes

Run:

```bash
git diff -- package.json package-lock.json lib/mongodb.ts vercel.json
```

Expected:

- no dependency changes;
- no pool-size increase;
- no deployment-resource workaround.

If these files changed without a direct requirement from this plan, revert those changes.

## 10.5 Remove temporary/debug code

Search for temporary instrumentation introduced during this work:

```bash
rg -n "TEMP|TODO.*viva|console\.time|console\.timeEnd|performance\.now" app components lib tests proxy.ts
```

Remove temporary measurement code unless it was already part of the repository or is a deliberately retained test measurement.

## 10.6 Diff-size audit

Run:

```bash
git diff --stat
git diff
```

For every changed production block, Codex must be able to answer:

```text
What measured operation does this remove or shorten?
```

If there is no concrete answer, remove the code.

## 10.7 Index verification

No new index is expected from this plan.

Before deployment still run the existing production audit:

```bash
npm run indexes:refactor:audit
```

Do not add another index unless `explain("executionStats")` proves a new query introduced by this plan actually needs one.

## Completed means

The entire plan is complete only when:

- all relevant Viva tests pass;
- lint passes;
- build passes;
- one-round 50-session Start passes repeatedly;
- participant race behavior remains correct;
- no stale locks remain;
- no unnecessary post-mutation agenda reload remains;
- Start click feedback is immediate;
- no package dependency was added;
- no pool/infrastructure increase was used;
- no temporary instrumentation remains;
- no duplicate/unnecessary helper or state path remains;
- benchmark results are recorded in the existing results document;
- the final diff is narrowly limited to measured hot-path/test/UI improvements.

---

# 11. Expected final architecture

The desired Start path is intentionally simple:

```text
Panel admin clicks Start
        |
        +-- UI immediately shows Starting...
        |
        v
existing Start API
        |
        +-- read target session
        +-- read/revalidate this session's confirmed round/panel/project/users
        +-- insert unique participant locks
        +-- mark this session started + write snapshots
        +-- write audit event
        |
        v
transaction commits
        |
        v
API returns updated workspace
        |
        v
client replaces only that workspace in existing state
        |
        +-- no whole-agenda reload
        +-- no shared VivaRound Start write
        +-- no global active-session scan
        +-- no User fake-lock writes
        +-- no new dependency
```

For 50 independent sessions in one round, each Start should work primarily on its own session and participant-lock documents rather than all contending on one shared round write.

---

# 12. Implementation order for Codex

Follow this order exactly:

1. **Step 0:** verify HEAD, tests, browser/client request behavior.
2. **Step 1:** add the one-round 50-session benchmark.
3. **Decision:** if shared-round Start is already healthy, skip Step 2.
4. **Step 2:** only if needed, remove the shared round write safely.
5. **Step 3:** remove successful mutation refetches and add immediate Start pending feedback.
6. **Step 4:** auto-advance using existing state only if current UX needs it and the change stays tiny.
7. **Step 5:** touch portal-status routing only if measured deployed latency proves it is still material.
8. **Step 6:** full regression/performance/cleanup audit.

Do not implement later steps simply because they are listed. Measurement gates exist specifically to keep the final code minimal.

---

# 13. Final definition of success

The task is successful when the system can demonstrate all of the following without additional infrastructure or dependencies:

- **50 concurrent Viva sessions under one shared round** can Start safely;
- session Starts do not depend on the number of unrelated active Vivas;
- no shared round document becomes a Start-time write hotspot if that hotspot is proven by the benchmark;
- participant collision protection remains database-enforced;
- Start click gives immediate visual feedback;
- the client uses returned mutation workspaces instead of reloading all Viva data;
- Save Grade and Complete Viva do not cause unnecessary loading/refetching;
- the next Viva can be reached with minimal examiner interaction using already-loaded data where practical;
- all existing authorization, audit, snapshot, grading, completion, cancellation, and lock-cleanup rules remain correct;
- no new package, service, cache layer, pool increase, or architectural subsystem has been introduced;
- the final production diff contains only code that removes measured work or removes a measured user delay.
