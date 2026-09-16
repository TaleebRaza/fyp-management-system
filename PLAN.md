# Viva implementation plan

## Objective

Build the Viva feature in small, testable milestones using the least code and infrastructure that reliably satisfy the current requirements.

**Document status:** Active implementation tracker.

**Current design revision:** Single panel-admin dashboard and grade-based evaluation. This revision supersedes the earlier per-examiner factor-scoring design.

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

- Each Viva session examines one project team. All team members receive the same final result.
- Admin creates named rounds and selects participating teams and active supervisors.
- Teachers cannot examine their own supervised teams.
- Admin sets target/minimum panel sizes and session timing.
- Support manual panels, random teacher allocation, and panel-member adjustments.
- Random allocation may produce a smaller final panel. Panels below the minimum remain unusable until corrected.
- Every generated panel has exactly one **panel admin**.
- When panels are generated randomly, the panel admin is also selected randomly from that panel's eligible members.
- The system administrator can change a panel's panel admin when required, as long as the replacement is an eligible member of that same panel.
- There is only **one Viva grading dashboard per panel/session**, and it is used on the panel admin's device.
- Other panel members do not receive separate Viva dashboards and must not be allowed to log in while that panel's Viva session is active.
- The panel admin controls the active Viva session and submits the project's grade from the single dashboard.
- Grading uses a fixed grade list from **A+ through F**. No grading factors, per-factor marks, per-examiner sheets, or examiner averages are shown or collected.
- The dashboard displays each allowed grade together with its percentage representation, for example `A+ (100%)`.
- The grade-to-percentage mapping must exist in one canonical domain constant, not duplicated across API and UI code.
- The exact full grade-to-percentage table must be confirmed before the grading UI is finalized; `A+ (100%)` is currently the confirmed example.
- A saved result stores both the selected grade and its canonical percentage so historical results remain stable if display rules change later.
- Students participating in the active Viva remain restricted according to the session access rules.
- When the session completes or is cancelled, temporary login/access restrictions are released automatically from authoritative session state.
- Admin publishes completed results. Students see the final grade and percentage for their team.
- Serious interruptions use cancellation and a fresh attempt.
- Automatic team scheduling comes last.

## Explicitly superseded behavior

The following requirements from the previous plan are no longer part of the target design:

- Per-examiner grading dashboards.
- Examiner readiness from every panel member.
- Separate examiner score sheets.
- Configurable grading factors.
- Integer factor marks from 1–10.
- Equal weighting across factors or examiners.
- Factor averages or examiner averages.
- Extra grading time used to fill skipped factors.
- Deadline-generated zero marks for missing factors.
- Hiding other examiners' sheets, because separate examiner sheets no longer exist.

Do not continue implementing these superseded behaviors unless the requirements are changed again explicitly.

## Technical boundaries and defaults

- Keep existing proposal/thesis ratings unchanged.
- Use current Next.js, Mongoose, authentication, dashboard components, and npm tooling.
- Store UTC timestamps; display schedules in Asia/Karachi.
- Require positive session durations and a minimum panel size of at least two, no greater than the target.
- Freeze round timing and panel membership when its first session starts, except where an explicitly supported pre-start edit is allowed.
- Allow one non-cancelled attempt per team per round.
- Preserve team, panel, panel-admin, project, selected-grade, percentage, and relevant assessment snapshots for historical results.
- Published assessments are immutable in this version.
- Exclude external examiners, video calls, question banks, pause/resume, deadline extensions, factor scoring, per-examiner marks, and mark-correction workflows.
- Server authorization is authoritative. UI hiding alone never grants or removes permission.
- Login blocking for non-admin panel members must be derived from active session membership/state rather than a permanent account flag.

# Safe reconciliation of work already completed

Milestones 1–3 were implemented against the previous factor/per-examiner design. Do **not** delete the Viva feature wholesale. Reconcile it in place so reusable infrastructure survives.

## Reconciliation goal

Keep all work that is still useful for the new design, remove only behavior that directly conflicts with the new requirements, and avoid destructive schema/data changes until replacement fields and migration behavior are ready.

## Preserve these components unless repository inspection proves they are unusable

- Viva round, panel, and session models.
- Session lifecycle/state handling that is independent of factor scoring.
- UTC timestamp handling and phase calculation that still applies to session start/end.
- Cancellation and replacement-attempt concepts.
- Historical team/project/member snapshots.
- Durable Viva audit history.
- Transaction helpers and concurrency protections.
- Existing indexes that still support real reads or uniqueness rules.
- Storage-reference protections for Viva snapshots.
- Admin Viva navigation and page shell.
- Admin round create/reopen flow.
- Team and supervisor selection logic.
- Panel-size and duration validation.
- Existing authorization/error conventions.
- Tests for reusable lifecycle, persistence, transaction, snapshot, authorization, and frozen-round behavior.

## Replace or remove only the superseded parts

### Domain layer

- Remove factor-specific validation from the active Viva configuration contract.
- Remove factor-score mutation rules from the active grading flow.
- Remove equal-weight factor/examiner averaging from the authoritative result calculation.
- Keep generic lifecycle helpers if still valid.
- Add a canonical grade scale abstraction containing allowed grade labels and percentages.
- Store/return selected grade and percentage as the authoritative result.

### Persistence layer

- Do not delete the existing session/round/panel collections simply because their old fields are no longer used.
- First add the new fields required by the revised design, such as panel-admin identity and final grade snapshot.
- If old factor/examiner-sheet fields already exist, make them legacy/unused before considering removal.
- Prefer a compatibility migration or optional legacy fields over a destructive migration during development.
- Remove old fields only after code search proves there are no remaining reads/writes and test data has been handled safely.
- Preserve audit records and historical snapshots created under previous milestones.

### Admin round configuration

- Preserve the existing Viva admin area and round CRUD behavior.
- Remove grading-factor controls from the UI and request payload.
- Remove server requirements that a round must contain at least one factor.
- Preserve team selection, supervisor selection, panel sizes, durations, validation, loading/error states, freeze rules, and audit writes.

### Panel management

- Reuse the existing panel model/assignment direction.
- Add exactly one panel-admin reference per panel.
- During random panel generation, select the panel admin randomly from that panel's eligible members.
- Allow the system admin to replace the panel admin manually before the affected session starts.
- Validate that the selected panel admin is active, eligible, unique for the panel role, and a current member of that panel.

### Grading UI/API

- Do not build or retain separate examiner grading workspaces.
- Build one session dashboard for the panel admin.
- The grade control shows only the allowed grade list with percentages.
- Do not show grading factors, mark inputs, examiner identities for scoring, averages, or weighting controls.

### Access control

- Do not permanently deactivate panel-member accounts.
- Add a temporary login/session restriction derived from an active Viva session.
- The current panel admin remains allowed to authenticate and use the Viva dashboard.
- Other members of that same active panel are denied login/access until the session reaches a terminal state.
- Release the restriction automatically when the session ends or is cancelled.
- Preserve unrelated supervisor/student/admin behavior.

## Safe reconciliation sequence

Perform this sequence before starting the next feature milestone:

1. Create a checkpoint branch/commit containing the current working implementation if it is not already safely committed.
2. Run the current Viva and repository tests and record the baseline failures before changing anything.
3. Search all Viva code for factor configuration, examiner sheets, mark averaging, readiness, extra grading, and deadline-zero behavior.
4. Classify each occurrence as **preserve**, **adapt**, or **remove**. Do not delete a shared helper just because one caller is obsolete.
5. Add the revised domain contract first: panel admin + canonical grade scale + selected grade/percentage result.
6. Adapt persistence to accept the revised contract while keeping legacy fields readable/optional during the transition.
7. Adapt the admin round API/UI to stop creating or requiring factors.
8. Update tests to the new requirements only after replacement behavior exists.
9. Remove obsolete factor/examiner code paths only after code search and tests prove they are unreachable.
10. Run type-check, lint, Viva tests, database integration tests, and build.
11. Review the diff specifically for accidental deletion of reusable models, audit logic, snapshots, transaction helpers, authorization helpers, or dashboard components.
12. Commit the reconciliation separately from the next new milestone so it can be reverted independently if necessary.

## Prohibited rollback shortcuts

- Do not use `git reset --hard` against uncommitted work unless an intentional backup/checkpoint exists.
- Do not delete all Viva models and recreate them from scratch.
- Do not drop Viva collections/databases to simplify the schema transition.
- Do not remove shared dashboard/auth/database helpers used elsewhere in the application.
- Do not revert entire Milestone 1–3 commits if they also contain infrastructure still required by the revised feature.
- Do not rewrite unrelated legacy modules under the label of cleanup.

## Reconciliation complete when

- The repository still contains the reusable Viva lifecycle, persistence, audit, history, and admin-round infrastructure.
- Active configuration no longer requires grading factors.
- Active grading no longer uses examiner sheets or numeric factor marks.
- Panels support exactly one panel admin.
- A canonical grade list can be returned by the server and rendered by the future grading dashboard.
- Current relevant tests pass or remaining failures are documented as pre-existing/unrelated.

# Revised milestones

## Milestone 1: Revised domain rules and grade scale

**Research first**

Inspect `lib/viva` and its callers/tests from the earlier implementation. Separate reusable session lifecycle logic from superseded factor/examiner scoring logic.

**What to do and how**

Define the revised domain contract:

- panel-admin identity rules;
- allowed grade values from A+ through F;
- canonical grade-to-percentage mapping;
- grade validation;
- session lifecycle and terminal-state checks;
- rules controlling when a grade can be selected, changed, and finalized.

Keep the grade scale in one server-importable module and expose only the serialized values needed by the client.

**Hurdles and complexity to avoid**

- No numeric factor model hidden behind the grade UI.
- No duplicate grade tables in frontend and backend.
- No generic grading-engine abstraction.
- Do not let arbitrary percentages arrive from the client.

**Complete when**

The new grading rules work without database, HTTP, or UI dependencies, and old factor scoring is no longer authoritative.

**How to test**

Test every allowed grade, invalid labels, percentage derivation, immutable finalized results, exact phase boundaries, cancellation, and terminal states.

## Milestone 2: Persistence reconciliation and assessment history

**Research first**

Inspect existing VivaRound, VivaPanel, VivaSession, embedded examiner-sheet structures, indexes, transactions, and audit records created by the earlier milestones.

**What to do and how**

Adapt persistence rather than replacing it:

- add panel-admin identity to the panel snapshot/model;
- add selected grade and canonical percentage to the session/result snapshot;
- retain historical team/project/panel context;
- keep durable audit events;
- make superseded factor/examiner-sheet fields optional/legacy if needed during transition;
- keep concurrency protection around start, grade save/finalize, cancellation, and replacement attempts.

**Hurdles and complexity to avoid**

- No destructive collection reset.
- No second result collection unless an actual query/consistency requirement demands it.
- No duplicated final grade on unrelated source records as an authoritative copy.
- Do not remove legacy fields before all active reads/writes are eliminated.

**Complete when**

New sessions can persist a panel admin and final grade safely while older development records do not break application startup or reads.

**How to test**

Use a disposable database for schema validation, legacy-document compatibility, uniqueness, transaction rollback, concurrent grade writes, panel-admin changes, snapshots, cancellation, and replacement attempts.

## Milestone 3: Admin round configuration reconciliation

**Research first**

Inspect the existing admin Viva area and `/api/admin/viva` route completed under the previous plan.

**What to do and how**

Preserve the existing screen and endpoint structure while removing factor configuration. Admin can:

- create/reopen unstarted rounds;
- select participating teams and active supervisors;
- configure target/minimum panel sizes;
- configure session timing required by the revised workflow.

Reject frozen-setting changes on the server.

**Hurdles and complexity to avoid**

- No factor form left hidden in the client.
- No server requirement for a non-empty factor array.
- No replacement form/state framework.
- Do not weaken existing authorization or freeze checks.

**Complete when**

Admin can save/reopen a valid unstarted round without any factor configuration.

**How to test**

Check unauthorized requests, invalid inputs, active selections, persistence, frozen-round rejection, and absence of factor requirements.

## Milestone 4: Manual panel management and panel-admin assignment

**Research first**

Inspect supervisor eligibility, existing list/search components, panel persistence, account status behavior, and the partially prepared panel-management direction from the earlier plan.

**What to do and how**

Build searchable panel cards and an unassigned pool. Support manual assignment, removal, and movement of members.

Every valid panel must have exactly one panel admin. Admin can choose or replace the panel admin from current eligible members before the relevant session starts.

Validate uniqueness within a round, panel sizes, active teachers, own-supervisor conflicts, panel-admin membership, and frozen state.

**Hurdles and complexity to avoid**

- No new account role for panel admin. It is a per-panel responsibility, not a permanent user role.
- Do not store both contradictory `isPanelAdmin` flags and a separate authoritative panel-admin reference.
- No automatic reassignment after the current panel admin is removed unless the operation explicitly selects a replacement.

**Complete when**

Admin can assemble valid panels, assign/change the panel admin, and identify panels that cannot conduct sessions.

**How to test**

Cover duplicate assignments, inactive teachers, own-supervisor conflicts, panel-admin changes, panel-admin removal, minimum/target sizes, and frozen membership.

## Milestone 5: Random allocation, random panel-admin selection, and accessible adjustments

**Research first**

Review the manual assignment operations and existing random-allocation implementation/direction.

**What to do and how**

Shuffle selected eligible teachers once and partition them into target-sized panels, retaining the final remainder panel.

For each generated panel, randomly select one eligible member as its panel admin in the same generation operation. Show the generated panels and chosen panel admins for admin review before saving.

Support accessible member swaps/moves and explicit panel-admin replacement. Save the complete validated change atomically.

**Hurdles and complexity to avoid**

- No second assignment implementation specifically for drag-and-drop.
- No repeated random retry loops to force a preferred output.
- Do not randomize on render or refresh.
- Do not silently change panel admin when unrelated members move unless the current panel admin becomes invalid; require explicit resolution before save.
- No database writes for hover/mouse-move events.

**Complete when**

Large allocations preserve every teacher exactly once, every valid panel has exactly one eligible panel admin, and admin adjustments remain valid.

**How to test**

Check divisible/remainder counts, insufficient teachers, 500-teacher input, supervisor conflicts, panel-admin distribution, panel-admin replacement, concurrent edits, failed saves, and keyboard/menu equivalence.

## Milestone 6: Manual team scheduling

**Research first**

Trace project membership, supervisor ownership, timezone handling, and scheduling queries. Identify the resources that must not overlap.

**What to do and how**

Let admin assign a team, panel, time, and optional location label. Reserve the complete session interval.

Centralize validation for panel eligibility, panel-admin availability, own-supervisor conflicts, duplicate attempts, and teacher/student overlaps. Allow rescheduling before start.

**Hurdles and complexity to avoid**

- No calendar framework when a schedule table and date/time inputs suffice.
- No separate conflict rules in each screen.
- No scanning every project or session for each validation.
- Do not confuse scheduled time with actual start time.
- Do not build automatic scheduling machinery yet.

**Complete when**

Admin can create a valid schedule and understands why invalid assignments were rejected.

**How to test**

Cover conflicts, adjacent slots, overlaps, duplicate attempts, panel-admin conflicts, rescheduling, and UTC/local-time conversion.

## Milestone 7: Single panel-admin session dashboard and start

**Research first**

Inspect authentication, Viva participant authorization, project-document access, and concurrent session-start handling.

**What to do and how**

Add the participant/session endpoint required by the single dashboard.

The assigned panel admin can open the session workspace, confirm the team/session context, and start the Viva after server validation. Starting snapshots the required assessment context and records actual start/end timing.

Other panel members do not receive their own session dashboard.

**Hurdles and complexity to avoid**

- No all-examiner readiness workflow.
- No separate presence service or WebSocket infrastructure initially.
- No frontend-only start validation.
- Repeated start requests must not restart timers.
- A read-then-write start check without concurrency protection is insufficient.

**Complete when**

Exactly one valid start occurs and the assigned panel admin receives the authoritative session dashboard.

**How to test**

Check non-panel-admin requests, changed panel membership, replaced panel admin, simultaneous starts, stale clients, overlapping active sessions, and repeated start requests.

## Milestone 8: Panel-member login restriction during active session

**Research first**

Map authentication entry points, protected routes, existing sessions/tokens, shared authorization, and account-status checks. Identify where a temporary Viva restriction can be enforced without mutating permanent account state.

**What to do and how**

While a panel's Viva session is active:

- allow the assigned panel admin to authenticate and access the Viva workspace;
- deny login/access to other members of that active panel;
- preserve required system-admin access;
- preserve unrelated users' normal behavior.

Derive the restriction from authoritative active-session state. Release it automatically when the session ends or is cancelled.

Decide and document how existing authenticated sessions for non-admin panel members are handled; direct API requests must obey the same restriction as fresh logins.

**Hurdles and complexity to avoid**

- Do not set users permanently inactive.
- Do not rely only on hiding navigation.
- No scattered copies of lock logic across unrelated components.
- Do not store a time-expiring boolean that requires cleanup to restore access.
- Do not claim full device lockdown.

**Complete when**

Fresh logins, existing sessions, and direct API calls consistently enforce the temporary panel-member restriction and automatically restore access at terminal session state.

**How to test**

Use multiple devices/tokens for panel admin, other panel members, unrelated supervisors, students, and system admin. Test active, ended, and cancelled states plus reconnects.

## Milestone 9: Grade selection, save, and session completion

**Research first**

Review existing API hooks, request cancellation/versioning patterns, session transaction helpers, and UI input components.

**What to do and how**

On the panel-admin dashboard, show the canonical grade choices only, each with its percentage, for example `A+ (100%)`.

The panel admin selects the project's grade. The server validates the grade label, derives the canonical percentage, and saves the authoritative result with concurrency/version checks.

Provide a clear completion action. On completion:

- freeze the selected grade/result;
- transition the session to its terminal completed state;
- release temporary participant restrictions;
- retain audit/history snapshots.

**Hurdles and complexity to avoid**

- No grading factors.
- No numeric mark text fields unless later requirements explicitly add them.
- Do not trust a client-submitted percentage.
- No per-examiner state or averaging.
- No autosave complexity beyond what is actually useful for one grade selection.
- Do not allow a stale tab to overwrite a completed result.

**Complete when**

The panel admin can select one valid grade, save it safely, complete the session, and no further grading writes are accepted.

**How to test**

Exercise all grades, invalid/tampered percentage requests, refresh/reconnect, stale versions, multiple tabs, simultaneous completion/save, unauthorized panel members, and post-completion writes.

## Milestone 10: Cancellation and fresh attempts

**Research first**

Trace session termination, temporary login restrictions, uniqueness constraints, grade state, and audit persistence.

**What to do and how**

Let system admin cancel scheduled or active attempts with a required reason. Preserve the cancelled record, release restrictions, and allow a fresh attempt with a new session state and no inherited grade.

Reject subsequent writes from cancelled workspaces.

**Hurdles and complexity to avoid**

- Do not reset or overwrite the original attempt.
- No copying a cancelled grade into the replacement.
- No pause/resume or extension controls.
- Reuse the existing session-creation path for replacements.
- Do not clear unrelated sessions' restrictions.
- Do not silently turn a published result into a cancelled attempt.

**Complete when**

An interruption can be recovered from without losing history or permitting stale clients to alter the replacement.

**How to test**

Cancel scheduled and active sessions, retry cancellation, race cancellation against grade saving/completion, reconnect stale clients, verify restriction release, and start a replacement.

## Milestone 11: Review and publication

**Research first**

Inspect student result displays, admin selection controls, serializers, and historical student/project handling.

**What to do and how**

Show the system admin completed assessment context, selected grade, canonical percentage, panel, and panel admin. Support individual and bulk publication of completed, non-cancelled assessments.

Return the same published grade and percentage to every snapshotted team member. Keep unpublished results private.

**Hurdles and complexity to avoid**

- No client-calculated authoritative percentage.
- No duplicated authoritative result independently maintained on student, project, and session records.
- No premature reporting/export subsystem.
- Do not recalculate historical membership from the current project.
- No hidden post-publication grade editor.
- Bulk operations must report partial failures instead of claiming complete success.

**Complete when**

Published results are consistent, durable, private by role, and safe to publish repeatedly.

**How to test**

Verify grade/percentage integrity, API privacy, equal team results, repeat/bulk publication, historical membership, and cancelled-attempt exclusion.

## Milestone 12: Integration, performance, and documentation

**Research first**

Review the complete diff, query patterns, authentication checks, polling/refresh frequency if any, deployment limits, and existing CI/test commands.

**What to do and how**

Exercise the full manual workflow across role-separated browsers/devices:

1. Admin creates round.
2. Admin generates or manually creates panels.
3. Each panel receives one random/default panel admin.
4. Admin optionally changes panel admin.
5. Admin schedules a team.
6. Panel admin starts the session from the single dashboard.
7. Other panel members are blocked while the session is active.
8. Panel admin selects a grade and completes the session.
9. Restrictions are released.
10. Admin reviews and publishes the result.
11. Students see the same grade and percentage.

Measure representative operations with a large supervisor set using an isolated environment. Optimize only demonstrated bottlenecks.

**Hurdles and complexity to avoid**

- No Redis, queue, cache layer, or real-time rewrite without measured need.
- No production load testing without authorization.
- Avoid tests that merely search source text for implementation details.
- No fake performance claim based solely on array allocation benchmarks.
- Do not rewrite unrelated legacy modules under the label of cleanup.
- Avoid logging every heartbeat or UI interaction.

**Complete when**

The revised manual feature works end to end, relevant checks pass, temporary restrictions restore correctly, and remaining limits are documented with evidence.

**How to test**

Run `npm run lint`, `npm run test:unit`, and `npm run build`, plus Viva database integration, multi-browser/device authorization, cancellation, publication, and representative load checks. Recheck existing ratings, authentication, maintenance, and team workflows.

## Milestone 13: Automatic team scheduling

**Research first**

Use the completed manual scheduling flow and realistic round data to identify constraints, available slots, panel-admin conflicts, and common reasons teams cannot be placed.

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
- Do not scaffold this milestone's abstractions into earlier milestones.

**Complete when**

Admin can generate, review, adjust, and apply a valid draft, with explicit treatment of unplaced teams.

**How to test**

Cover adequate/insufficient capacity, constrained teams, own-supervisor conflicts, panel-admin conflicts, existing bookings, uneven workloads, deterministic output, and changes between preview and apply.

# Progress

Append updates after each implementation step. Record evidence, not estimates presented as completed work.

**Overall status:** Reconciliation and Revised Milestones 4–13 are implemented and verified. Broader repository validation remains separately tracked below.

## Update template

- **Date/time:**
- **Milestone and status:**
- **Research findings:** Relevant repository evidence and any official documentation consulted.
- **Implemented:** Behavior completed and affected files.
- **Complexity avoided:** Unnecessary code/dependencies rejected or removed.
- **Validation:** Exact commands/scenarios and actual outcomes.
- **Remaining hurdles:** Known failures, uncertainties, or unrun checks.
- **Next step:**
- **Suggested commit message:**

### 2026-09-15, reconciliation complete

- **Milestone and status:** Reconciled the superseded factor/per-examiner implementation. Revised Milestone 4 is next.
- **Research findings:** Factor scoring was isolated to `lib/viva.ts`, Viva persistence models, the admin round flow, and their tests. Existing rounds, sessions, snapshots, audit events, transactions, indexes, and storage-reference protection remain reusable. MongoDB 8 cannot start on the local Linux 6.19 kernel, so the isolated test-only replica set used MongoDB 4.4.29 instead.
- **Implemented:** Defined the canonical six-grade scale: A+ 100%, A 90%, B 80%, C 70%, D 60%, F 0%. Removed active factor scoring and extra-grading configuration. Added a required panel-admin reference for new panels, grade/percentage result snapshots, completion state, and a grade audit-event type. Legacy factor, chair, and examiner-sheet fields remain readable for historical records. Simplified the admin Viva form to round details, panel sizes, Viva duration, teams, and teachers.
- **Complexity avoided:** No collection reset, data deletion, migration job, new dependency, separate result collection, grading engine, or duplicate grade table.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, `node --test tests/viva.test.mjs`, both Viva replica-set integration suites, and `npm run build` passed. The local integration suites seeded only fake data and dropped `fyp_viva_m2_test` and `fyp_viva_m3_test`. `npm run test:unit` still has the two unrelated existing failures in `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`; 48 of 50 files passed.
- **Remaining hurdles:** The first local MongoDB 8 attempt was blocked by the host-kernel incompatibility. The temporary MongoDB 4.4.29 container is test-only and must not become a deployment dependency.
- **Next step:** Implement revised Milestone 4, manual panel management and panel-admin assignment.
- **Suggested commit message:** `feat(viva): reconcile panel-admin grade workflow`

### 2026-09-15, Revised Milestone 4 complete

- **Milestone and status:** Manual panel management and panel-admin assignment are complete. Revised Milestone 5 is next.
- **Research findings:** Existing Viva panels already store examiner and panel-admin identities, and existing round, audit, transaction, and admin-dashboard infrastructure could be extended directly. A teacher's own-team conflict requires a concrete team-to-panel schedule, so that authoritative check remains centralized in the scheduling milestone rather than incorrectly excluding teachers from every panel in a round.
- **Implemented:** Added searchable unassigned-teacher cards and editable panel cards in the admin Viva area. Admin can add/discard panels, assign, move, and remove teachers, choose a panel admin, and see panels below the configured minimum marked as not ready. Saving validates active selected supervisors, one assignment per round, panel capacity, panel-admin membership, and frozen rounds. A transaction replaces the complete pre-start panel draft atomically, records an audit event, and uses a per-round revision to reject stale concurrent saves. Round updates now reject changes that would invalidate saved panels.
- **Complexity avoided:** No new role, drag-and-drop framework, account-state mutation, collection reset, migration job, extra result collection, or database writes for UI movement before Save.
- **Validation:** `npm run lint` and `npx tsc --noEmit` passed. Local fake-data replica-set tests passed for Milestone 4 panel management and existing Milestones 2 and 3 persistence/configuration checks. The temporary MongoDB container and the disposable `fyp_viva_m2_test`, `fyp_viva_m3_test`, and `fyp_viva_m4_test` databases were removed. `npm run test:unit` passed 49 of 51 test files; the unrelated existing failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`.
- **Remaining hurdles:** The normal build runner reached successful compilation and TypeScript checks but did not return a final exit status before the command environment stopped it; a completed production build was not claimed. Team-specific own-supervisor conflicts will be enforced when scheduling assigns a team to a panel in Milestone 6.
- **Next step:** Implement Revised Milestone 5, random allocation, random panel-admin selection, and accessible adjustments.
- **Suggested commit message:** `feat(viva): add manual panel management`

### 2026-09-15, Revised Milestone 5 complete

- **Milestone and status:** Random panel allocation, random panel-admin selection, and accessible adjustments are complete. Revised Milestone 6 is next.
- **Research findings:** The existing panel save transaction and per-round revision already provide the one authoritative pre-start write path. MongoDB's official replica-set guidance confirms that transactions require a replica set, started with `--replSet` and initialized once with `rs.initiate()`.
- **Implemented:** Added a server-side Fisher–Yates allocation preview that shuffles the selected active teachers once, partitions them by target size, retains the final remainder panel, and randomly assigns one of each panel's members as panel admin. The admin UI shows the generated draft before the existing atomic Save action runs. Native select controls now also support member swaps, while explicit panel-admin replacement remains required before moving or swapping a panel admin.
- **Complexity avoided:** No drag-and-drop dependency, second persistence path, allocation table, retry loop, database write for preview, account mutation, or premature team-supervisor conflict logic. The existing save validation and revision check remain the authority.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, `node --test tests/viva.test.mjs`, `node --test tests/viva-panel-allocation.test.mjs`, and `npm run build` with a disposable local `MONGODB_URI` passed. Local MongoDB 4.4.29 `rs0` integration tests passed for persistence, round configuration, and panels. The panel test seeded 506 fake users, including 500 supervisors, verified a 167-panel allocation with a two-member remainder, random in-panel admins, no preview write, atomic save, stale revisions, and frozen rounds; all disposable databases and the container were removed. `npm run test:unit` passed 50 of 52 files; the existing unrelated failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`.
- **Remaining hurdles:** Team-specific own-supervisor conflicts still belong to manual scheduling in Milestone 6, where a team is actually assigned to a panel.
- **Next step:** Implement Revised Milestone 6, manual team scheduling and centralized overlap/conflict validation.
- **Suggested commit message:** `feat(viva): add random panel allocation`

### 2026-09-15, Revised Milestone 6 complete

- **Milestone and status:** Manual team scheduling is complete. Revised Milestone 7 is next.
- **Research findings:** `VivaSession` already had the UTC `scheduledAt`, `vivaEndsAt`, `locationLabel`, and optimistic `version` fields required to reserve an interval, while the existing round, panel, project, audit, and transaction infrastructure supplied the remaining authoritative data. Native `Intl.DateTimeFormat.formatToParts()` provides the exact Asia/Karachi date/time components required by the native `datetime-local` control without a date-library dependency.
- **Implemented:** Added a transaction-backed schedule/reschedule path. It validates round/team/panel membership, viable panel size and admin, active panel members, active students, own-supervisor conflicts, duplicate round attempts, teacher overlaps, student overlaps, and started/cancelled/completed sessions. It reserves the exact planned interval using the current round duration, records immutable scheduling audit events, and rejects stale writes. A per-round schedule revision serializes concurrent overlap checks. The admin Viva page now has an accessible native-control schedule form and schedule list, with schedule input/display fixed to Asia/Karachi and UTC persisted to MongoDB.
- **Complexity avoided:** No calendar dependency, drag-and-drop, second session/result collection, generic scheduling engine, background job, full session scan, duplicate client-side conflict logic, or new account role.
- **Validation:** `npx tsc --noEmit` and `npm run lint` passed. `npm run build` compiled successfully and completed its TypeScript validation with a disposable local MongoDB URI. A local MongoDB 8.0.16 single-node `rs0` replica set passed the existing persistence, round-admin, and panel-admin database suites, plus the new scheduling suite. The new suite seeded 12 fake users and six fake teams, then verified panel eligibility, own-supervisor exclusion, teacher/student interval conflicts, duplicate attempts, UTC interval reservation, rescheduling, stale versions, started-session rejection, and concurrent overlap protection. `npm run test:unit` passed 52 of 54 files; the two existing unrelated failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`.
- **Remaining hurdles:** No user-facing cancellation, session-start dashboard, temporary login restriction, grade completion, or publication behavior exists yet; those belong to subsequent milestones. The normal unit suite remains blocked from an all-green result by the two pre-existing unrelated structural tests.
- **Next step:** Implement Revised Milestone 7, the panel-admin-only dashboard and concurrency-safe session start.
- **Suggested commit message:** `feat(viva): add manual team scheduling`

### 2026-09-15, Revised Milestone 7 complete

- **Milestone and status:** The single panel-admin session dashboard and concurrency-safe start flow are complete. Revised Milestone 8 is next.
- **Research findings:** Scheduled sessions already provide the authoritative round, panel, project, UTC timing, audit, and transaction boundaries. The existing PDF access policy intentionally limits documents to project participants, so this milestone presents the required team and panel context without broadening document access.
- **Implemented:** Added an authenticated supervisor Viva endpoint and a panel-admin workspace in the existing supervisor dashboard. The current assigned panel admin can inspect scheduled team/panel context and start exactly once. Start revalidates current membership, role, panel admin, active teachers, team ownership, and active-session participant conflicts; atomically snapshots the current assessment context, records actual start/end timing, freezes the round, and writes one audit event. Repeated starts return the established workspace without changing its timer.
- **Complexity avoided:** No WebSocket/presence service, readiness workflow, extra role, second session/result collection, document-access expansion, duplicate dashboard, or client-trusted timing.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. A disposable local MongoDB 8.0.16 `rs0` replica set passed all existing Viva persistence, round-admin, panel, and scheduling suites plus the new session suite. The new suite seeded 12 fake users and five fake teams, then verified panel-admin-only access, changed-membership snapshots, frozen rounds, repeat and concurrent starts, stale/replaced panel admins, and active-participant conflicts. `npm run test:unit` passed 53 of 55 files; the two pre-existing unrelated failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`.
- **Remaining hurdles:** Temporary login/access restrictions for non-admin panel members and existing sessions are intentionally deferred to Milestone 8.
- **Next step:** Implement Revised Milestone 8, derived temporary login and API restrictions for non-admin panel members while a Viva session is active.
- **Suggested commit message:** `feat(viva): add panel-admin session start`

### 2026-09-15, Revised Milestone 8 complete

- **Milestone and status:** Temporary access restriction for non-admin members of an active Viva panel is complete. Revised Milestone 9 is next.
- **Research findings:** Every authenticated application API route uses `requireCurrentUser`, while the NextAuth credentials provider has its own fresh-login authorization path. Middleware cannot safely perform the Mongoose lookup in its Edge runtime, so the shared server-side guard is the authority for direct API access and fresh credentials. The active session's panel snapshot is the historical, immutable membership source once the Viva starts.
- **Implemented:** Added one indexed active-session lookup that restricts a snapshot panel member unless they are the snapshot panel admin. The shared check now runs during credential sign-in and in `requireCurrentUser`, so existing authenticated sessions lose all protected API access without any permanent account mutation. A supervisor-only status route signs an already-open browser session out at dashboard load, tab focus, or within 30 seconds. Completion or cancellation removes the condition directly from authoritative session state, so access releases automatically.
- **Complexity avoided:** No account flag, cleanup job, WebSocket, middleware database call, extra session store, or client-only authorization rule.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` with a disposable local MongoDB URI passed. A local MongoDB 8.0.16 `rs0` replica set passed the Milestone 7 baseline and the new Milestone 8 fake-data integration test. The new test seeded six users and one team, then verified panel-admin and unrelated access, snapshot membership, active-member restriction, and automatic completed/cancelled release. `npm run test:unit` passed 54 of 56 files; the two existing unrelated failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`.
- **Remaining hurdles:** The browser checker signs a pre-existing session out at load, focus, or within 30 seconds. Server-side API authorization is immediate; this is not a full-device lockout. Credential-provider wiring is covered by the shared policy and code path, not a browser-level NextAuth test.
- **Next step:** Implement Revised Milestone 9, canonical grade selection, safe save, and session completion.
- **Suggested commit message:** `feat(viva): restrict active Viva panel members`

### 2026-09-15, Revised Milestone 9 complete

- **Milestone and status:** Grade selection, save, and session completion are complete.
- **Research findings:** The existing single panel-admin workspace already exposes server-authorized sessions, snapshots the active panel at start, and has a transactional write path with optimistic versions and durable audit events. `VivaSession.result`, the canonical grade scale, and the active-session restriction all already existed as reusable boundaries.
- **Implemented:** The panel-admin workspace now receives the server-serialized canonical grade scale, persisted selection, and session version. It allows a panel admin to select and save one canonical grade, then complete the Viva. The shared endpoint derives the percentage from the grade server-side, rejects stale/invalid/unauthorized writes, records grade and completion audit events transactionally, finalizes the session, and consequently releases the temporary panel-member restriction. A fake-data replica-set integration suite targets only the disposable `fyp_viva_m9_test` database.
- **Complexity avoided:** No numeric mark input, client percentage, separate grading endpoint, autosave, second result collection, migration, dependency, or real-time state mechanism.
- **Validation:** `npm run test:viva:grading` passed against local MongoDB 8.0.16 `rs0`, seeding five fake users and one fake team in disposable `fyp_viva_m9_test`; it verified all grades, canonical percentages, tampering rejection, panel-admin authorization, refresh, stale versions, concurrent saves, save/complete races, immutable completion, and access release. Existing Milestone 2, 3, 4, 6, 7, and 8 replica-set suites passed against their isolated databases. `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed with a temporary local MongoDB URI. `npm run test:unit` passed 55 of 57 files; the two unrelated existing failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`. The disposable container and test databases were removed after verification.
- **Remaining hurdles:** The two pre-existing unrelated unit failures remain outside Viva and were not changed.
- **Next step:** Implement Revised Milestone 10, cancellation and fresh attempts.
- **Suggested commit message:** `feat(viva): add grade selection and completion`

### 2026-09-15, Revised Milestone 10 complete

- **Milestone and status:** Cancellation and fresh attempts are implemented and verified.
- **Research findings:** `VivaSession` already preserves `cancelledAt`, `cancellationReason`, result snapshots, audit records, and a partial unique index permitting one non-cancelled attempt per team/round. The current access restriction is derived from active-session state, so setting `cancelledAt` releases it without an account mutation. Scheduling already rejects only non-cancelled duplicate attempts and conflicts.
- **Implemented:** Added one transaction-backed system-admin cancellation path requiring a reason, optimistic version check, terminal/published-result protection, immutable audit event, and cancelled schedule serialization. The admin schedule view exposes session state, a required cancellation-reason form, cancellation history, and fresh scheduling for a cancelled team. A replacement is a clean new session, so it does not inherit the cancelled attempt's grade. Added a fake-data integration test scaffold limited to disposable local `fyp_viva_m10_test` on a replica set.
- **Complexity avoided:** No new collection, role, account flag, cleanup job, second session/result workflow, migration, background task, or dependency.
- **Validation:** The new cancellation suite passed against local MongoDB 8.0.16 `rs0`, seeding seven fake users and three fake teams in disposable `fyp_viva_m10_test`. It verified required reasons, scheduled and active cancellation, audit history, restriction release, clean replacement attempts, no inherited grade, cancelled-write rejection, published-result protection, and cancellation/grade races. Existing isolated persistence, admin, panel, scheduling, session, access, and grading Viva suites also passed. `npx tsc --noEmit`, `npm run lint`, and the escalated `npm run build` passed. `npm run test:unit` passed 56 of 58 files; the two unrelated existing failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`. The disposable MongoDB container and test database were removed after verification.
- **Remaining hurdles:** Existing completed results remain non-cancellable; publication UI/API remains Milestone 11 work. The two unrelated unit failures remain outside Viva.
- **Next step:** Implement Revised Milestone 11, review and publication.
- **Suggested commit message:** `feat(viva): add cancellation and fresh attempts`

### 2026-09-15, Revised Milestone 11 complete

- **Milestone and status:** Review and publication are implemented and verified.
- **Research findings:** Completed sessions already preserve immutable round, team, panel, panel-admin, and canonical grade snapshots. `publishedAt` and the immutable `result-published` audit type already existed. The current Mongoose transaction documentation confirms the established `withTransaction()` pattern and requires sequential work inside a transaction, so bulk publication processes selected results sequentially in one transaction.
- **Implemented:** Added one admin-only publication path for individual or selected bulk results. It publishes only completed, non-cancelled sessions with complete historical snapshots, increments the session version, writes an immutable audit event, returns already-published records idempotently, and reports per-record bulk failures. The admin Viva dashboard now reviews the snapshotted team, panel, panel admin, canonical grade, percentage, completion time, and publication state. Student dashboard responses now look up only published results by the frozen team snapshot, so every historic team member receives the same grade and percentage even if source project membership later changes. Added a supporting snapshot-member publication index and a disposable fake-data replica-set test limited to `fyp_viva_m11_test`.
- **Complexity avoided:** No second result collection, project/student grade copies, migration, queue, notification system, bulk-job framework, dependency, or post-publication editor.
- **Validation:** `npx tsc --noEmit` and `npm run lint` passed. `npm run test:viva:publication` passed against local MongoDB 8.0.16 `rs0`, seeding eight fake users and three fake teams in disposable `fyp_viva_m11_test`; it verified unpublished privacy, individual publication, bulk partial failure, canonical grade percentages, snapshotted team history, equal team results, repeat publication, and audit history. Existing isolated Viva persistence, admin, panel, scheduling, session, access, grading, and cancellation suites also passed against disposable replica-set databases. `npm run test:unit` passed 57 of 59 files; the two unrelated existing failures remain `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`. `npm run build` passed with elevated process permissions and a temporary local MongoDB URI. Both disposable MongoDB containers and test databases were removed after verification.
- **Remaining hurdles:** The two pre-existing unrelated unit failures remain outside Viva and were not changed. Milestone 12 still needs the complete role-separated workflow review, representative performance checks, and documentation pass.
- **Next step:** Implement Revised Milestone 12, integration, performance, and documentation.
- **Suggested commit message:** `feat(viva): add result review and publication`

### 2026-09-15, Revised Milestone 12 complete

- **Milestone and status:** Integration, representative local measurement, and documentation are complete and verified.
- **Research findings:** The existing nine isolated Viva integration suites already cover persistence, configuration, panels, scheduling, dashboard start, access restriction, grading, cancellation, and publication. The missing proof was one composed role-separated workflow across those established transactional paths. The existing panel suite already demonstrated 500-supervisor allocation, so the composed check uses the same representative scale and measures a real preview plus transactional panel save rather than an array-only benchmark.
- **Implemented:** Added `test:viva:workflow`, a fake-data replica-set integration suite restricted to disposable local `fyp_viva_m12_test`. It creates a round, allocates 500 supervisors into panels, explicitly replaces one panel admin before saving, schedules and starts a session, verifies the temporary restriction and release, records A+ (100%), publishes the result, and confirms both snapshotted students receive the same result. The check logs observed preview/save durations without a timing threshold. Documented the Viva workflow, grade scale, and local verification command in `README.md`.
- **Complexity avoided:** No browser framework, duplicate end-to-end fixture layer, production load test, timing gate, database reset outside the disposable test database, dependency, queue, cache, or real-time mechanism.
- **Validation:** `VIVA_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/fyp_viva_m12_test?replicaSet=rs0' npm run test:viva:workflow` passed with 504 seeded fake users, 17.82 ms allocation preview, and 401.11 ms transactional panel save. The existing isolated `npm run test:viva:persistence`, `test:viva:admin`, `test:viva:panels`, `test:viva:scheduling`, `test:viva:session`, `test:viva:access`, `test:viva:grading`, `test:viva:cancellation`, and `test:viva:publication` suites all passed against local MongoDB 8.0.16 `rs0`. `npx tsc --noEmit`, `npm run lint`, and `MONGODB_URI='mongodb://127.0.0.1:27017/fyp_viva_build_check?replicaSet=rs0' npm run build` passed. `npm run test:unit` recorded 160 passing, 2 failing, and 10 skipped; the failures are the established unrelated `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs` assertions, while Viva integration tests are skipped when no URI is supplied. All test databases were dropped by their runners and the disposable container was removed after verification.
- **Remaining hurdles:** The two unrelated unit failures remain outside Viva and were not changed. Milestone 13 still needs automatic team scheduling.
- **Next step:** Implement Revised Milestone 13, automatic team scheduling.
- **Suggested commit message:** `test(viva): add full workflow integration coverage`

### 2026-09-16, Revised Milestone 13 complete

- **Milestone and status:** Automatic team scheduling is implemented and verified.
- **Research findings:** The existing manual scheduling validator and transaction path already enforce panel eligibility, own-supervisor exclusion, overlapping teacher/student reservations, attempt uniqueness, audit writes, and schedule revisions. The automatic flow reuses those boundaries when applying a reviewed draft.
- **Implemented:** Added deterministic preview generation from available windows, valid panels, current bookings, and remaining teams. The preview orders teams by available-option count, then uses earliest slots, lower panel workload, and stable panel-ID tie-breakers. Admin can edit or remove draft entries before one atomic, fully revalidated save. The integration runner seeds only fake records into local `fyp_viva_m13_test`.
- **Complexity avoided:** No solver, scheduling dependency, retry loop, automatic replacement, second persistence path, or client-trusted draft.
- **Validation:** `VIVA_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/fyp_viva_m13_test?replicaSet=rs0' npm run test:viva:auto-scheduling` passed against a disposable local MongoDB 8.0.16 single-node `rs0` replica set. The runner seeded 13 fake users and six fake teams, then removed the disposable database. It verified deterministic drafts, constrained and unplaced teams, insufficient capacity, panel eligibility, existing bookings, atomic apply, and stale-draft revalidation. `npx tsc --noEmit` passed. `npm run lint` passed with one warning in `lib/vivaRoundAdmin.ts:419` for an existing unused `actor` parameter. The full unit suite and production build were not run in this pass.
- **Remaining hurdles:** The two previously recorded unrelated unit-test failures remain outside Viva. A broader repository validation pass should still run the full unit suite and production build.
- **Next step:** No further feature milestone is defined; perform broader repository validation when needed.
- **Suggested commit message:** `feat(viva): add deterministic automatic team scheduling`

## Historical implementation record

The following entries are retained as factual history. Their factor/per-examiner requirements are superseded by the current plan and must not be treated as the active specification.

### 2026-09-14, previous Milestone 1 complete

- **Research findings:** Existing project-rating logic validates at a pure TypeScript boundary and uses Node's built-in test runner. Viva had no persistence or HTTP requirement at this stage.
- **Implemented:** `lib/viva.ts` provided configuration validation, lifecycle derivation using supplied UTC times, separately tracked publication, permitted score changes, deadline-zero finalization, and final-only equal-weight averages. `tests/viva.test.mjs` covered invalid configuration, deadline boundaries, score locking, missing marks, zeros, equal weighting, and rounding.
- **Complexity avoided:** No schema, index, migration, API route, UI, dependency, generic workflow engine, or database abstraction was added.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. `tests/viva.test.mjs` passed. `npm run test:unit` ran 48 files: 46 passed, including Viva; two unrelated existing structure assertions failed.
- **Remaining hurdles:** `project-rating-ui.test.mjs` expected "Download Excel" although the UI rendered "Download PDF". `storage-workflow-structure.test.mjs` expected a removed `student.domains = []` assignment. Neither file or behavior was touched here.
- **Current interpretation:** Preserve reusable lifecycle/validation structure, but replace factor/score/zero/average behavior with the revised grade-domain rules.

### 2026-09-14, previous Milestone 2 complete

- **Research findings:** Existing user and project workflows can change or delete source records, while `PortalActivityLog` is capped and best-effort, so neither preserves assessment history. MongoDB transactions require a replica set; the implementation followed the MongoDB and Mongoose transaction and index guidance reviewed for this milestone.
- **Implemented:** Added persistent Viva rounds, panels, sessions, snapshots, examiner score sheets, and immutable audit events. Session writes and their audit records use a transaction. Added required MongoDB indexes, index-audit coverage, and storage-reference checks so a PDF retained in a Viva snapshot cannot be deleted as an orphan.
- **Complexity avoided:** No Viva API/UI, dependency, generic repository layer, event-sourcing system, or changes to the existing User and Project models were added.
- **Validation:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. `node --test tests/viva.test.mjs` passed. A local replica-set MongoDB test seeded seven fake users, three fake projects, one round, one panel, and one session; it passed validation, duplicate-panel, snapshot, storage-reference, replacement-attempt, rollback, and concurrent-write checks, then dropped the test database. `npm run test:unit` ran 49 files: 47 passed; the two unrelated existing assertion failures remained.
- **Current interpretation:** Preserve round/panel/session persistence, snapshots, transactions, indexes, storage references, and audit history. Replace examiner-sheet/factor result storage with panel-admin + final-grade storage without destructive resets.

### 2026-09-14, previous Milestone 3 complete

- **Research findings:** Admin navigation is tab-based, dashboard panels and native form controls already provide the required interaction patterns, and `requireCurrentUser` establishes the existing admin boundary. Viva rounds and immutable audit events from the previous milestone provide the persistence needed for configuration.
- **Implemented:** Added the admin-only `/api/admin/viva` route and Viva dashboard area. Admin could create and reopen unstarted rounds, select active project teams and active supervisors, configure panel sizes and both durations, and add, rename, reorder, or remove marking factors. Server validation rejected invalid settings, stale selections, and all changes after a round was frozen. Successful creates and updates were recorded in the durable Viva audit history.
- **Complexity avoided:** No dependency, generic form/state framework, new design system, client-side-only lock, or storage change. One transaction-backed configuration path performed shared validation and audit writes.
- **Validation:** `npx tsc --noEmit` and `npm run lint` passed. `npm run test:viva:admin` passed against a temporary local single-node MongoDB replica set, seeded six fake users and two fake teams, then dropped `fyp_viva_m3_test`; it verified invalid input, active selections, factor ordering, audit events, and frozen-round rejection. `npm run test:unit` ran 50 files: 48 passed, including Viva; two unrelated existing structure assertions failed. `npm run build` passed with a temporary local `MONGODB_URI`; the normal build was blocked by the workspace's missing `MONGODB_URI` setting. An unsigned local request was redirected to the existing sign-in guard before the Viva route.
- **Current interpretation:** Preserve the admin area, endpoint, round CRUD, team/supervisor selection, panel-size/duration fields, auth, freeze behavior, and audit writes. Remove factor configuration from the active contract/UI/API.

### 2026-09-15, requirements revised

- **Milestone and status:** Design reconciliation required before further Viva feature work.
- **Requirement change:** One panel-admin dashboard replaces per-examiner dashboards. Other active panel members are temporarily blocked from login/access during the session. Grading is a single A+–F grade with a canonical percentage, with no factors. Random panel generation also chooses a random panel admin, and system admin can replace that panel admin when required.
- **Implementation instruction:** Follow the **Safe reconciliation of work already completed** section before revised Milestone 4. Preserve reusable infrastructure and remove only superseded behavior.
- **Suggested commit message:** `docs(viva): revise plan for panel-admin grade workflow`
