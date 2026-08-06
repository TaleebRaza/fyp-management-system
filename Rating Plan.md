# Project Approval Ratings Plan

## Agreed feature behavior

- Ratings belong to the project/team, not to individual students.
- A rating is required when an approval advances:
  - `PROPOSAL` to `THESIS_DRAFT`.
  - `THESIS_DRAFT` to `FINAL_DELIVERABLES`.
- Final-deliverables approval remains unchanged and does not ask for ratings.
- The initial categories are:
  1. **Project Idea**
  2. **Technical Merit**
  3. **Documentation Quality**
- Each saved rating is a whole number from 1 through 10. Zero is never a saved rating; it is only the admin filter value meaning “do not filter by this category.”
- Category labels will live in one shared configuration file. Stable internal keys will be used in the database so the labels can be renamed later without migrating saved projects.
- Proposal and thesis ratings are separate, permanent snapshots. A thesis rating must not overwrite the proposal rating.
- Students and the assigned supervisor can see every rating snapshot already recorded for their project.
- Existing projects that passed a stage before this feature will show that stage as **Not rated (legacy approval)**. The portal must not invent or backfill scores.
- The existing admin review queue can approve on behalf of a supervisor. To prevent a bypass, it must follow the same rating requirement for Proposal and Thesis approvals and record the real approving user in the audit fields.

## Data shape

Add two optional embedded rating snapshots to the existing `Project` document:

```text
ratings.proposal
  projectIdea: 1..10
  technicalMerit: 1..10
  documentationQuality: 1..10
  ratedAt: Date
  ratedBy: User ObjectId

ratings.thesis
  projectIdea: 1..10
  technicalMerit: 1..10
  documentationQuality: 1..10
  ratedAt: Date
  ratedBy: User ObjectId
```

The project is the source of truth. Ratings will not be copied onto every student record. This matches the current shared-project model and avoids rating drift between teammates.

## Milestone 1: Make approval and rating one atomic operation

1. Add the shared category keys, labels, rating-round type, and strict 1–10 integer validation.
2. Extend `Project` with the two optional snapshots above. Do not add a new collection or a migration for existing data.
3. Extend the review request with:
   - The three ratings for an approval at `PROPOSAL` or `THESIS_DRAFT`.
   - The project stage and version displayed to the reviewer.
   - The authenticated approving user for `ratedBy`.
4. Enforce the rule in the shared `reviewProject` service, not only in the UI:
   - Reject a Proposal/Thesis approval when any category is missing, non-integer, or outside 1–10.
   - Reject rating data on Changes Requested, Rejected, or final-deliverables approval.
   - Require the project to still be submitted for review, at the expected stage and version.
   - Reject attempts to replace an already stored snapshot.
5. In the existing MongoDB transaction, write the rating snapshot, advance the stage/status, update team-member status/remarks, clear the approved PDF where required, and enqueue existing side effects. All succeed or all roll back.
6. Apply the same service rule to both the supervisor endpoint and the admin review endpoint.

Atomicity and interruption rule:

- Closing the rating form before submission or failing client validation sends no approval request, so the project stays unchanged.
- A server/database failure before the transaction commits rolls everything back.
- If the transaction commits but its HTTP response is lost, a dashboard refresh shows the committed approval. A retry carries the old stage/version and returns `409 Conflict`, so it cannot accidentally approve the next stage.

Milestone 1 is complete when no Proposal or Thesis approval path can advance a project without a valid rating snapshot, and a stale/repeated request cannot advance two stages.

## Milestone 2: Collect and show ratings

1. When a reviewer presses **Approve** on a Proposal or Thesis submission, open one confirmation form containing:
   - Three required 10-star selectors.
   - The selected numeric value beside each selector.
   - The existing optional remarks field.
   - A final **Approve and save ratings** button, disabled until all three scores are selected.
2. Use native radio inputs styled as stars so the controls have field labels, keyboard support, focus indicators, and values announced as “N out of 10.” Prevent repeat submission while the request is running.
3. For final deliverables, keep the current approval interaction and do not display rating inputs.
4. Include existing rating snapshots in the safe project data returned by:
   - The supervisor dashboard endpoint.
   - The student dashboard endpoint.
   - The admin review queue where needed for the shared dialog.
5. Add one shared read-only rating display and reuse it in:
   - The supervisor project details dialog.
   - The student Project Information area.
6. Show separate **Proposal ratings** and **Thesis ratings** sections, including the three category values and rating date. Hide future rounds; use the legacy message only when the project has already passed a round without a snapshot.

Milestone 2 is complete when the supervisor/admin cannot submit an incomplete approval form, and all teammates plus the assigned supervisor see the saved values after refresh.

## Milestone 3: Admin-filtered Excel export

1. Add a **Project Ratings Export** section to Admin Reports with:
   - Rating round: Proposal or Thesis.
   - Minimum Project Idea: 0–10.
   - Minimum Technical Merit: 0–10.
   - Minimum Documentation Quality: 0–10.
   - A **Download Excel** button.
2. Add a dedicated admin-only export endpoint. Validate the round and all thresholds on the server. A value above zero adds a MongoDB `$gte` condition; zero omits that category condition.
3. Always require the selected round’s rating snapshot to exist. Therefore legacy/unrated projects are excluded even when all minimums are zero.
4. Fetch only matching projects, then fetch their students and supervisors in batched queries. Generate the workbook on demand with the already-installed `exceljs`; do not save it to portal/R2 storage.
5. Write one worksheet row per student, repeating project/team data so normal Excel filtering remains simple. Include:
   - Project ID, title, domains, current stage, and current status.
   - Selected rating round and all three scores.
   - Rating date and reviewer name/role.
   - Supervisor name and email.
   - Student name, roll number, email, program, batch, and semester.
6. Sort by Project Idea descending, then project title, then student roll number. Use a filename such as `project-ratings-proposal-2026-08-06.xlsx` and return a valid workbook with headers even when no projects match.

Example: Proposal round + Project Idea minimum `6` + the other two minimums `0` exports every proposal-rated project with Project Idea `6` or higher, regardless of its other two scores.

Milestone 3 is complete when the endpoint is admin-only, the three minimums combine with AND semantics, the downloaded workbook opens correctly, and every matching team member appears exactly once.

## Validation and regression coverage

- Unit tests for category/rating validation, stage-to-rating-round mapping, zero-as-filter-only behavior, and filter construction.
- Review-service tests for missing/invalid ratings, no rating on final approval, atomic rating plus stage advancement, snapshot immutability, stale version rejection, and retry safety.
- API tests for supervisor/admin payloads, authorization, safe response fields, invalid thresholds, and empty exports.
- UI tests for required star selections, accessible labels/keyboard behavior, disabled duplicate submission, final-stage omission, and student/supervisor visibility.
- Workbook tests for headers, AND filtering, one row per student, sorting, and multiple students sharing the same project ratings.
- Final repository checks: `npm run lint`, `npm run test:unit`, and `npm run build`.

## Explicitly out of scope

- Ratings after final submission/final-deliverables approval.
- Overall averages, weighted scores, leaderboards, automatic ranking, or award selection.
- Editing ratings after approval. A correction workflow can be designed later with its own audit trail.
- Backfilling ratings for approvals completed before launch.
- Adding another spreadsheet dependency or storing generated report files.

## Progress (2026-08-06)

- **Milestone 1 complete.** Added shared category configuration and strict integer validation, embedded optional Proposal/Thesis snapshots in `Project`, and made rating persistence part of the existing review transaction. Supervisor and admin approvals now send the authenticated approver plus the displayed project stage/version. The shared service rejects missing/invalid ratings, forbidden rating payloads, non-submitted projects, stale/repeated reviews, and existing snapshots.
- **Milestone 2 complete.** Added the shared supervisor/admin approval form with three required native 10-value radio-star groups, visible numeric values, optional remarks, incomplete/duplicate-submit protection, and unchanged final-deliverables behavior. Added one shared read-only display to supervisor project details and student Project Information, with separate completed rounds, dates, legacy messages, and future rounds hidden.
- **Dashboard/API data complete for these milestones.** Supervisor, student, and admin-review responses now expose sanitized rating values/dates; reviewer ObjectIds remain server-side. Review queue responses also include the project version required for optimistic concurrency.
- **Milestone 3 complete.** Added an Admin Reports export form with a Proposal/Thesis selector and three 0–10 minimums. Its admin-only endpoint validates every filter, requires the selected rating snapshot, combines non-zero minimums with MongoDB AND semantics, uses projected/batched reads, and generates a dated Excel workbook with one sorted row per unique student. Empty results still produce a valid header-only workbook.
- **Deployment impact checked.** The export makes no database or object-storage writes and adds no migration or index. Each download performs one projected project query plus one batched related-user query after authentication, then builds the workbook in function memory. A local synthetic 5,000-row workbook was 0.41 MiB and took about 1.5 seconds to generate. This is intentionally lean for the portal's bounded dataset; large exports approaching Vercel's function payload limit should move to streaming or a queued object-storage export.
- **Regression coverage added.** Tests cover category keys, 1–10 rating validation, stage/round rules, forbidden ratings, safe response serialization, endpoint/transaction guards, accessible controls and visibility, export query validation/AND filters, row uniqueness/sorting, browser download handling, and valid empty workbooks.
- **Validation passed.** `npm run lint`, `npm run test:unit` (41 tests), `npx tsc --noEmit`, `npm run build`, and `git diff --check` completed successfully.
