# Viva implementation plan

## Objective

Build Viva in small, testable milestones using the least code and infrastructure that reliably satisfy the requirements.

**Document status:** Active implementation tracker.

## Working rules

Every milestone follows this sequence:

1. **Research:** Read the actual implementation, callers, tests, and relevant configuration. Consult current official documentation where external behavior needs verification.
2. **Choose the simplest approach:** Reuse repository code, then native platform features, then installed dependencies. Introduce abstractions only for demonstrated duplication or a concrete correctness boundary.
3. **Implement:** Make a focused change that completes the milestone.
4. **Verify:** Test the owned behavior, review the diff, and remove unnecessary code introduced by the change.
5. **Record progress:** Document actual results, remaining issues, and a suggested commit message.

Keep research proportional to the milestone. Record useful findings and decisions, not lengthy research diaries.

**Minimal means fewer moving parts, not compressed code.** Preserve validation, authorization, accessibility, error handling, concurrency protection, and explicitly requested features.

Do not introduce speculative configuration, generic workflow engines, service/repository wrappers without a purpose, global state libraries, background infrastructure, or new dependencies when existing tools suffice. Optimize measured bottlenecks rather than hypothetical ones.

## Agreed behavior

- Each session examines one project team. All team members receive the same result.
- Admin creates named rounds and selects participating teams and active supervisors.
- Teachers cannot examine their own teams.
- Admin sets target/minimum panel sizes, factors, and both session durations.
- Support manual panels, random teacher allocation, and drag-and-drop swaps with keyboard/menu equivalents.
- Random allocation may produce a smaller final panel. Panels below the minimum remain unusable until corrected.
- All examiners confirm readiness; the admin-designated chair confirms team attendance and starts.
- **Viva time:** Examiners enter and revise marks; examined students cannot access normal account features.
- **Extra grading time:** Students regain access; examiners fill only skipped factors. Existing marks remain locked.
- At final expiry, remaining blanks become zero and the session ends. No further grading period follows.
- Each factor accepts integer marks from 1–10. Factors and examiners have equal weight.
- Examiners see only their own sheets during grading.
- Admin publishes completed results. Students see overall and factor averages, without examiner identities or individual sheets.
- Serious interruptions use cancellation and a fresh attempt.
- Automatic team scheduling comes last.

## Technical boundaries and defaults

- Keep existing proposal/thesis ratings unchanged.
- Use current Next.js, Mongoose, authentication, dashboard components, and npm tooling.
- Store UTC timestamps; display schedules in Asia/Karachi.
- Require positive durations, at least one factor, and a minimum panel size of at least two, no greater than the target.
- Freeze round factors, durations, and panel membership when its first session starts.
- Allow one non-cancelled attempt per team per round.
- Preserve team, examiner, project, and grading snapshots for historical results.
- Timers retain their configured lengths even when marking finishes early.
- Published assessments are immutable in this version.
- Exclude external examiners, video calls, question banks, pause/resume, deadline extensions, and mark-correction workflows.

## Milestone 1: Domain rules and lifecycle

**Research first**

Read existing project-rating validation, project/team types, and the unit-test harness. Identify reusable validation and error conventions without coupling viva to proposal/thesis scoring.

**What to do and how**

Define concrete viva types and small pure functions for configuration validation, phase calculation, permitted score changes, and averaging. Model `scheduled`, `running`, `extra_grading`, `ended`, and `cancelled`; track publication separately.

Accept the current time as an argument to time-dependent domain functions. Preserve missing marks distinctly from deadline-generated zeros.

**Hurdles and complexity to avoid**

- No generic assessment engine or state-machine dependency.
- No separate boolean for every phase.
- No duplicated scoring rules in React and API handlers.
- No rounding intermediate calculations or treating an empty field as zero early.

**Complete when**

Lifecycle and scoring rules work without database, HTTP, or UI dependencies.

**How to test**

Use existing unit tooling for invalid configuration, exact phase boundaries, missing factors, automatic zeros, equal weighting, rounding, and cancelled-attempt exclusion.

## Milestone 2: Persistence and assessment history

**Research first**

Inspect existing Mongoose schemas, transactions, indexes, reset/deletion flows, and activity logging. Confirm which historical fields would otherwise disappear after project or account changes.

**What to do and how**

Add round, panel, and session models. Embed examiner sheets in sessions to keep score/deadline updates atomic. Add only indexes required by actual reads and uniqueness rules.

Snapshot assessment context at start. Retain durable business audit events using straightforward persistence; store them consistently with the corresponding successful mutation.

**Hurdles and complexity to avoid**

- No generic repository layer wrapping every Mongoose operation.
- No separate collection for each score.
- No event-sourcing architecture or history reconstructed from log replay.
- Do not use the existing capped activity feed as the authoritative viva history.
- Do not assume a transaction alone prevents concurrent booking conflicts; competing operations must contend on an appropriate shared record or constraint.

**Complete when**

Assessments persist reliably, conflicting writes are controlled, and history survives source-record changes.

**How to test**

Use a disposable database for schema validation, uniqueness, concurrent writes, transaction failures, and historical snapshots. Do not test persistence only with mocked Mongoose behavior.

## Milestone 3: Admin round configuration

**Research first**

Inspect admin navigation, existing forms, dialogs, validation messages, and API helpers. Reuse their interaction patterns.

**What to do and how**

Add an admin Viva area and `/api/admin/viva` endpoints. Let admin select teams/teachers, configure sizes and durations, and add, rename, reorder, or remove factors.

Reject frozen-setting changes on the server.

**Hurdles and complexity to avoid**

- No form-builder framework for a small configuration form.
- No new design system or global form store.
- Do not create settings for behaviors already fixed by the requirements.
- Do not rely on disabled controls to enforce immutability.

**Complete when**

Admin can save and reopen an unstarted round, with useful validation and loading/error states.

**How to test**

Check unauthorized requests, invalid inputs, persistence, factor ordering, and rejected edits after the round starts.

## Milestone 4: Manual panel management

**Research first**

Inspect supervisor eligibility, list/search components, and selection controls. Trace account deactivation and deletion behavior.

**What to do and how**

Build searchable panel cards and an unassigned pool. Support manual assignment, removal, movement, and chair selection.

Validate uniqueness within a round, panel sizes, active teachers, and chair membership. Display incomplete panels clearly.

**Hurdles and complexity to avoid**

- No new examiner account role when supervisor accounts suffice.
- Do not store both “assigned” flags and membership records that can disagree.
- No per-panel API calls when one bounded round query supplies the screen.
- No automatic chair reassignment after removing the current chair; require an explicit replacement.

**Complete when**

Admin can assemble valid panels and identify panels that cannot conduct sessions.

**How to test**

Cover duplicate assignments, inactive teachers, chair changes, minimum/target sizes, and membership changes after freezing.

## Milestone 5: Random allocation and accessible swaps

**Research first**

Review the manual assignment operations and browser interaction requirements. Determine what native drag-and-drop plus existing controls can support before considering dependencies.

**What to do and how**

Shuffle selected teachers once and partition them into target-sized panels, retaining the final remainder panel. Show the proposed replacement for review.

Drop onto a teacher to swap; drop into panel space to move. Use the same mutation for drag, keyboard, and menu operations. Validate and save the complete change atomically.

**Hurdles and complexity to avoid**

- No second assignment implementation specifically for drag-and-drop.
- No repeated “random retry” loops to fix invalid output.
- Do not randomize assignments on render or refresh.
- No database writes for hover/mouse-move events.
- Avoid optimistic cross-panel changes with elaborate rollback; confirm server success before committing the displayed result.
- Preserve accessibility even if native dragging is limited on a device.

**Complete when**

Large allocations and individual adjustments preserve every teacher exactly once and reject invalid changes.

**How to test**

Check divisible/remainder counts, insufficient teachers, 500-teacher input, supervisor conflicts, concurrent edits, failed saves, and keyboard/menu equivalence.

## Milestone 6: Manual team scheduling

**Research first**

Trace project membership, supervisor ownership, timezone handling, and scheduling queries. Identify the resources that must not overlap.

**What to do and how**

Let admin assign a team, panel, time, and optional location label. Reserve both timed phases.

Centralize validation for panel eligibility, own-supervisor conflicts, duplicate attempts, and teacher/student overlaps. Allow rescheduling before start.

**Hurdles and complexity to avoid**

- No calendar framework when a schedule table and date/time inputs suffice.
- No separate conflict rules in each screen.
- No scanning every project or session for each validation.
- Do not confuse scheduled time with actual start time.
- Do not build automatic scheduling machinery yet.

**Complete when**

Admin can create a valid schedule and understands why invalid assignments were rejected.

**How to test**

Cover conflicts, adjacent slots, overlaps, duplicate attempts, rescheduling, and UTC/local-time conversion.

## Milestone 7: Waiting room and chair start

**Research first**

Inspect authentication, project-document access, and existing refresh patterns. Trace how concurrent start requests can claim the same teachers or students.

**What to do and how**

Add `/api/viva` participant endpoints and a waiting room showing team details, readiness, and connection freshness.

Let examiners set/withdraw readiness. Let the chair confirm attendance and start after server validation. Atomically snapshot assessment context and store the actual start and deadlines.

**Hurdles and complexity to avoid**

- No separate presence service or WebSocket infrastructure initially.
- Combine presence updates with session synchronization where practical.
- Do not treat page focus as proof of attendance.
- No frontend-only readiness validation.
- Repeated start requests must not restart timers.
- A read-then-write check without concurrency protection is insufficient.

**Complete when**

Exactly one valid start occurs, using consistent deadlines across participants.

**How to test**

Check non-chair requests, absent/stale readiness, changed eligibility, simultaneous starts, and overlapping active sessions.

## Milestone 8: Private grading and autosave

**Research first**

Review existing API hooks, request cancellation, document authorization, and input patterns. Identify the minimum response needed for one examiner.

**What to do and how**

Build the grading workspace with authorized team documents and the examiner’s own sheet.

Save valid changes with ownership, phase, and version checks. Show saving, saved, disconnected, and failed-save states. Use one managed polling loop per workspace and restore server-confirmed state after reconnect.

**Hurdles and complexity to avoid**

- No polling loop per factor or nested component.
- No global state library for local session state.
- Do not fetch every examiner’s marks and hide them in JSX.
- No server writes for incomplete or unchanged input.
- No silent retry loops, localStorage grading ledger, or speculative offline synchronization.
- Do not let a refresh response overwrite unsaved input silently.

**Complete when**

Independent examiners can grade without exposing or overwriting one another’s work, and unsaved marks are clearly identified.

**How to test**

Exercise concurrent users, multiple tabs, stale responses, failed saves, refresh/reconnect, ownership violations, and polling cleanup.

## Milestone 9: Portal access restrictions

**Research first**

Map protected routes, shared authorization, existing login sessions, maintenance behavior, and team/account mutation paths. Look for routes that bypass shared checks.

**What to do and how**

Enforce restrictions at shared server boundaries and reflect them in the dashboard shell.

Students retain restriction-status and sign-out access during viva time. Examiners retain authorized viva workspace access through both phases. Derive unlock behavior from authoritative deadlines.

Reject participating roster/supervisor/account-availability changes during active attempts. Block maintenance activation while attempts are active.

**Hurdles and complexity to avoid**

- Do not reuse `isActive` or the global maintenance flag for temporary viva restrictions.
- No scattered copies of lock checks across components.
- Do not store time-expiring lock booleans that require cleanup to restore access.
- No separate timer-fetch request inside every unrelated component.
- Do not claim full device lockdown or treat visibility events as reliable misconduct evidence.
- Preserve existing behavior for unrelated users.

**Complete when**

Direct API requests and existing sessions obey the same restrictions, and access restores without manual cleanup.

**How to test**

Use multiple devices, existing tokens, direct requests, phase boundaries, unrelated accounts, maintenance activation, and participant mutation attempts.

## Milestone 10: Extra grading and session finalization

**Research first**

Review all score-write paths and database conditional-update behavior. Trace races between score saves, phase changes, and finalization.

**What to do and how**

At the viva deadline, permit only previously missing factors. Lock each newly saved factor.

At final expiry, convert blanks to attributed zeros and freeze marks. Derive phase from timestamps and finalize overdue records idempotently on relevant access.

**Hurdles and complexity to avoid**

- No in-memory server countdown or per-session scheduled process.
- No cron job required for correct access expiry or rejection of late marks.
- Do not trust client time or a timer callback to close grading.
- No extra deadline after the agreed extra minutes.
- Do not omit incomplete examiners from the average.
- Avoid updating an entire grading document from a stale client snapshot.

**Complete when**

Deadline behavior remains correct with closed browsers, delayed requests, and repeated finalization.

**How to test**

Use injected time for exact boundaries. Test concurrent finalization/saves against the database, delayed requests, all-complete sheets, all-empty sheets, and repeated finalization.

## Milestone 11: Cancellation and fresh attempts

**Research first**

Trace session termination, participant restrictions, uniqueness constraints, and audit persistence.

**What to do and how**

Let admin cancel scheduled or active attempts with a required reason. Preserve their records, release restrictions, and allow a fresh attempt with new readiness and blank sheets.

Reject subsequent writes from cancelled workspaces.

**Hurdles and complexity to avoid**

- Do not reset or overwrite the original attempt.
- No copying cancelled marks into the replacement.
- No pause/resume or extension controls.
- Reuse the existing session-creation path for replacements.
- Do not clear unrelated sessions’ restrictions.
- Do not silently turn a published result into a cancelled attempt.

**Complete when**

An interruption can be recovered from without losing history or permitting stale clients to alter the replacement.

**How to test**

Cancel in each permitted phase, retry cancellation, race cancellation against saving/finalization, reconnect stale clients, and start a replacement.

## Milestone 12: Review and publication

**Research first**

Inspect student result displays, admin selection controls, serializers, and historical student/project handling.

**What to do and how**

Show admin examiner breakdowns, generated-zero labels, and calculated averages. Support individual and bulk publication of ended, non-cancelled assessments.

Return the same published overall/factor averages to every snapshotted team member. Keep examiner sheets and unpublished results private.

**Hurdles and complexity to avoid**

- No duplicated averages independently maintained on student, project, and session records.
- No client-calculated authoritative results.
- No premature reporting/export subsystem.
- Do not recalculate historical membership from the current project.
- No hidden post-publication score editor.
- Bulk operations must report partial failures instead of claiming complete success.

**Complete when**

Published results are consistent, durable, private by role, and safe to publish repeatedly.

**How to test**

Verify calculations, privacy at API level, equal team results, repeat/bulk publication, historical membership, and cancelled-attempt exclusion.

## Milestone 13: Integration, performance, and documentation

**Research first**

Review the complete diff, query patterns, polling frequency, deployment limits, and existing CI/test commands. Identify actual hotspots and uncovered boundaries.

**What to do and how**

Exercise the full manual workflow across role-separated browsers. Measure representative operation with 500 examiner accounts using an isolated environment.

Optimize demonstrated bottlenecks through projections, bounded requests, suitable indexes, and polling adjustments. Document setup, cancellation, zeros, publication, and operational limits.

**Hurdles and complexity to avoid**

- No Redis, queue, cache layer, or real-time rewrite without measured need.
- No production load testing without authorization.
- Avoid tests that merely search source text for implementation details.
- No fake performance claim based solely on array allocation benchmarks.
- Do not rewrite unrelated legacy modules under the label of cleanup.
- Avoid logging every heartbeat or keystroke.

**Complete when**

The manual feature works end to end, relevant checks pass, and remaining limits are documented with evidence.

**How to test**

Run `npm run lint`, `npm run test:unit`, and `npm run build`, plus database integration, multi-browser, and representative load checks. Recheck existing ratings, authentication, maintenance, and team workflows.

## Milestone 14: Automatic team scheduling

**Research first**

Use the completed manual scheduling flow and realistic round data to identify constraints, available slots, and common reasons teams cannot be placed.

**What to do and how**

Generate a draft from selected teams, valid panels, and admin-provided availability. Preserve existing bookings and reuse scheduling validation.

Use a deterministic first approach: consider the most constrained teams first, then select the earliest valid slot, favoring panels with fewer assigned sessions and using stable tie-breakers.

List unplaced teams and reasons. Permit manual adjustment and revalidate the complete draft before applying.

**Hurdles and complexity to avoid**

- No optimization solver or scheduling framework initially.
- No promise of a globally optimal schedule.
- Do not label an unplaced team “impossible” merely because the heuristic did not place it.
- No repeated random retries or silent dropping of teams.
- Do not duplicate manual scheduling rules.
- No automatic replacement of existing bookings.
- Do not scaffold this milestone’s abstractions into earlier milestones.

**Complete when**

Admin can generate, review, adjust, and apply a valid draft, with explicit treatment of unplaced teams.

**How to test**

Cover adequate/insufficient capacity, constrained teams, own-supervisor conflicts, existing bookings, uneven workloads, deterministic output, and changes between preview and apply.

## Progress

Append updates after each implementation step. Record evidence, not estimates presented as completed work.

**Overall status:** Milestones 1–2 complete.

### Update template

- **Date/time:**
- **Milestone and status:**
- **Research findings:** Relevant repository evidence and any official documentation consulted.
- **Implemented:** Behavior completed and affected files.
- **Complexity avoided:** Unnecessary code/dependencies rejected or removed.
- **Validation:** Exact commands/scenarios and actual outcomes.
- **Remaining hurdles:** Known failures, uncertainties, or unrun checks.
- **Next step:**
- **Suggested commit message:**

### 2026-09-14, Milestone 1 complete

- **Research findings:** Existing project-rating logic validates at a pure TypeScript boundary and uses Node's built-in test runner. Viva has no persistence or HTTP requirement at this stage.
- **Implemented:** `lib/viva.ts` provides configuration validation, lifecycle derivation using supplied UTC times, separately tracked publication, permitted score changes, deadline-zero finalization, and final-only equal-weight averages. `tests/viva.test.mjs` covers invalid configuration, deadline boundaries, score locking, missing marks, zeros, equal weighting, and rounding.
- **Complexity avoided:** No schema, index, migration, API route, UI, dependency, generic workflow engine, or database abstraction was added.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. `tests/viva.test.mjs` passed. `npm run test:unit` ran 48 files: 46 passed, including Viva; two unrelated existing structure assertions failed.
- **Remaining hurdles:** `project-rating-ui.test.mjs` expects "Download Excel" although the UI renders "Download PDF". `storage-workflow-structure.test.mjs` expects a removed `student.domains = []` assignment. Neither file or behavior was touched here.
- **Next step:** Milestone 2, persistence and assessment history.
- **Suggested commit message:** `feat(viva): add pure lifecycle and scoring rules`

### 2026-09-14, Milestone 2 complete

- **Research findings:** Existing user and project workflows can change or delete source records, while `PortalActivityLog` is capped and best-effort, so neither preserves assessment history. MongoDB transactions require a replica set; the implementation follows the MongoDB and Mongoose transaction and index guidance reviewed for this milestone.
- **Implemented:** Added persistent Viva rounds, panels, sessions, snapshots, examiner score sheets, and immutable audit events. Session writes and their audit records use a transaction. Added required MongoDB indexes, index-audit coverage, and storage-reference checks so a PDF retained in a Viva snapshot cannot be deleted as an orphan.
- **Complexity avoided:** No Viva API/UI, dependency, generic repository layer, event-sourcing system, or changes to the existing User and Project models were added.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. `node --test tests/viva.test.mjs` passed. A local replica-set MongoDB test seeded seven fake users, three fake projects, one round, one panel, and one session; it passed validation, duplicate-panel, snapshot, storage-reference, replacement-attempt, rollback, and concurrent-write checks, then dropped the test database. `npm run test:unit` ran 49 files: 47 passed; the two unrelated existing assertion failures remain below.
- **Remaining hurdles:** `project-rating-ui.test.mjs` expects "Download Excel" although the UI renders "Download PDF". `storage-workflow-structure.test.mjs` expects a removed `student.domains = []` assignment. Neither file or behavior was touched here.
- **Next step:** Milestone 3, Viva workflows and API boundaries, subject to backend-change approval.
- **Suggested commit message:** `feat(viva): persist assessment history and audit trail`

### 2026-09-14, Milestone 3 complete

- **Research findings:** Admin navigation is tab-based, dashboard panels and native form controls already provide the required interaction patterns, and `requireCurrentUser` establishes the existing admin boundary. Viva rounds and immutable audit events from Milestone 2 provide the only persistence needed for configuration.
- **Implemented:** Added the admin-only `/api/admin/viva` route and Viva dashboard area. Admin can create and reopen unstarted rounds, select active project teams and active supervisors, configure panel sizes and both durations, and add, rename, reorder, or remove marking factors. Server validation rejects invalid settings, stale selections, and all changes after a round is frozen. Successful creates and updates are recorded in the durable Viva audit history.
- **Complexity avoided:** No schema change, dependency, generic form/state framework, new design system, client-side-only lock, or storage change. One transaction-backed configuration path performs the shared validation and audit write.
- **Validation:** `npx tsc --noEmit` and `npm run lint` passed. `npm run test:viva:admin` passed against a temporary local single-node MongoDB replica set, seeded six fake users and two fake teams, then dropped `fyp_viva_m3_test`; it verified invalid input, active selections, factor ordering, audit events, and frozen-round rejection. `npm run test:unit` ran 50 files: 48 passed, including Viva; two unrelated existing structure assertions failed. `npm run build` passes with a temporary local `MONGODB_URI`; the normal build is blocked by the workspace's missing `MONGODB_URI` setting. An unsigned local request was redirected to the existing sign-in guard before the Viva route.
- **Remaining hurdles:** `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs` retain their pre-existing failures. The workspace's `.env.local` needs `MONGODB_URI` for an unqualified production build.
- **Next step:** Milestone 4, manual panel management, subject to database-change approval.
- **Suggested commit message:** `feat(viva): add admin round configuration`
