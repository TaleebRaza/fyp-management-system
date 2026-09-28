# Plan: "Review Rating" button on the supervisor student card

> **Audience:** any coding model or developer implementing this feature.
> **Prime directive:** smallest possible diff, reuse everything that already exists, touch nothing that is not listed here.

---

## 1. Feature in one paragraph

On the supervisor's student/team card, the existing rating display gets a small **"Review rating"** button. Clicking it opens the **existing rating dialog**, pre-filled with the previously saved rating and remarks. The dialog gains one extra button, **"Open document"**, which opens the document that rating was given about (for example, the proposal document while the project is in the thesis stage). The supervisor reads it, changes the rating and/or remarks, and saves.

**Workflow to support:**
Teacher signs in → opens an assigned project → presses "Review rating" on the previous rating → opens the previous document and reads it → changes the rating/remarks → saves.

---

## 2. Invariants (must never change as a side effect)

Saving a revised rating must **only** update the rating record's own fields (score/rating values and remarks, plus an optional `updatedAt`). It must **not**:

- change the project's **stage**
- change the project's **version**
- change any **document status** (submitted / approved / rejected / etc.)
- create, replace, or delete any document or R2 object
- trigger stage progression, unlock templates, or alter deadlines
- touch the **Viva** module (Viva grades are a separate, immutable system. Do not confuse "supervisor rating" with "Viva grade")
- send new emails or notifications, unless the existing "create rating" flow already does and the owner explicitly wants it on edit (default: **silent**)

If any change in the diff can violate one of these, stop and redesign it.

---

## 3. Ground rules for the implementer

1. **Reuse, don't rebuild.** Reuse the existing rating dialog, validators, API helpers, auth helpers, and document-open mechanism.
2. **No new dependencies, no new collections/models, no new env vars.**
3. **Prefer extending over adding.** Add an optional prop or an optional branch before adding a new component, route, or function.
4. **Match the surrounding code style exactly** (naming, imports, error format, toast helper, fetch helper).
5. **Do not refactor unrelated code**, rename things, reformat files, or "clean up" while you are there. Formatting-only changes in touched files are forbidden.
6. **Target diff budget:** roughly 3–6 files changed, and no more than about 150–250 added lines in total. If you are far beyond this, you are over-building.
7. Read `PLAN.md` and `PLAN_ADDENDUM.md` in the repo root first, in case they define conventions or constraints. Follow them if they conflict with anything below, and note the conflict.

> **Note on file names:** the repo already has `PLAN.md`. On Windows/macOS (case-insensitive file systems) `plan.md` would collide with it. Save this file as `docs/plan-review-rating.md` (or similar) if you are working in the repo.

---

## 4. Known context

- Stack: Next.js (App Router), React, TypeScript, MongoDB via Mongoose, NextAuth, Cloudflare R2 for documents, Sentry.
- Top-level folders: `app/`, `components/`, `config/`, `lib/`, `models/`, `types/`, `tests/`, `scripts/`.
- Roles: student, supervisor (teacher), admin. Role checks are enforced server-side.
- Projects move through stages (proposal → thesis → final). Documents are stored in R2 and referenced from the database.

**Important:** the source was not readable when this plan was written (only the public README could be seen). Everything in Section 5 is therefore *discovered*, not assumed. Do not guess file names. Find them.

---

## 5. Phase 0: Discovery (read-only, do this before writing code)

Run these from the repo root and record the answers in your working notes. Every later step depends on them.

```bash
# where ratings/remarks live
rg -n -i "rating|remark" --glob '!node_modules' --glob '!*.lock' --glob '!package-lock.json'

# the supervisor's student/team card
rg -n -i "supervisor" components app --glob '*.tsx' -l
rg -n -i "studentcard|teamcard|projectcard" components app -l

# the rating dialog
rg -n -i "rating.*(dialog|modal)|(dialog|modal).*rating" components app -l

# rating API routes and server actions
rg -n -i "rating" app/api lib --glob '*.ts' -l

# how supervisors currently open/download submitted documents
rg -n -i "presign|signedUrl|getSignedUrl|r2|download|view.*document|openDocument" app lib components -l
```

**Questions Phase 0 must answer:**

| # | Question | Why it matters |
|---|----------|----------------|
| Q1 | Which component renders the supervisor's student/team card and the rating display on it? | Where the button goes |
| Q2 | Which component is the rating dialog? Does it already support prefilled/edit values? | Reuse vs. small prop addition |
| Q3 | Which API route or server action saves a rating? Does it already support update, or only create? | Whether the backend needs any change |
| Q4 | What is the rating's schema? Which fields are rating values, which is remarks? Is the rating stored in its own model or embedded in the project/submission? | Exact `$set` fields |
| Q5 | Does a rating record store a reference to what it was about (document id, stage, version)? | How to resolve "the document the rating was given about" |
| Q6 | How does a supervisor currently open a student's document (signed URL route, proxy route, viewer component)? Does it work for **older** documents or only the current one? | Whether to reuse as-is or extend |
| Q7 | Are older documents retained after the project moves to the next stage/version, or overwritten? | If overwritten, the feature cannot show the old file (see 9.4) |
| Q8 | What auth helper is used server-side (role check, "is this supervisor assigned to this project")? | Copy the same guard |
| Q9 | Does the existing save flow send notifications/emails or change status? | Ensure the edit path skips them |
| Q10 | Is there an SWR/React Query cache or plain `fetch` + `useState` on the card list? | How to refresh only this card after save |

Write the answers down before proceeding. If Q5 or Q7 come back unfavourable, jump to Section 9 (edge cases) and pick the documented fallback rather than inventing a new data structure.

---

## 6. Phase 1: Backend (smallest possible)

### 6.1 Decide: extend or add

- **If the existing save route already supports updating an existing rating** (for example, it accepts a rating id or upserts): **change nothing on the backend** except confirming the invariants in Section 2 hold on that path. This is the best outcome.
- **If it only supports create:** add an update capability to the *same* route/module (e.g. a `PATCH` handler next to the existing `POST`, or an optional `ratingId` in the body). Do not create a parallel module.

### 6.2 The update operation

- Update by **rating id AND project id** together in the filter, so a rating cannot be edited through a mismatched project.
- Use a targeted `$set` (or `findOneAndUpdate`) on **only** the rating fields and remarks. Never spread the whole request body into the document. Whitelist fields explicitly.
- Do **not** call anything that touches the project document (`project.save()`, stage/version helpers, status helpers).
- Do **not** open a transaction. A single-document update is atomic. Only use one if the existing rating code already does, for consistency.
- Rely on the schema's `timestamps` for `updatedAt` if they exist. **Do not add new schema fields** (`revisedBy`, `revisionCount`, and so on) unless the owner asks. Mention them as an optional follow-up instead.

### 6.3 Authorization (copy the existing guard, do not invent one)

The handler must verify, server-side:

1. A valid session exists and its role is supervisor (or whatever the existing rating route requires).
2. The supervisor is **assigned to this project**, using the same check the create-rating path uses.
3. The rating belongs to that project (enforced by the two-key filter in 6.2).
4. The project is in a state where rating edits are already permitted by the existing rules (for example, not archived or reset). Reuse the existing condition; do not define new business rules.
5. If the existing create path restricts ratings to the supervisor who wrote them, apply the same restriction to edits. Otherwise any assigned supervisor of the project may edit.

### 6.4 Validation

Reuse the existing rating validator (zod/Joi/manual, whichever exists). If updates need a looser variant (all fields optional), derive it from the existing schema (`.partial()`-style), so the rules live in one place.

### 6.5 Response

Return the **same shape** the create path returns (the updated rating), so the frontend can drop it straight into state.

---

## 7. Phase 2: Document access (reuse, extend only if required)

Goal: from the dialog, open the document the rating was about.

1. **Resolve which document.** Use Q5's answer:
   - If the rating stores a document id or stage/version, use it directly.
   - If it does not, resolve from the project's document history using the rating's stage (and version if available). Do this on the server, in the existing route that serves documents, not with a new data structure.
2. **Reuse the existing open/download mechanism from Q6** (signed URL route, proxy, or viewer). Do not write new R2 code.
3. **Only if** the existing mechanism refuses non-current documents, extend it minimally: allow a document id that belongs to the same project, and keep the same supervisor-assigned-to-project authorization check. Do not loosen access for anyone else. Students and other supervisors must not gain access.
4. **Resolve lazily.** Do **not** add document URLs to the card-list payload. Fetch/sign the URL only when "Open document" is clicked. This keeps list responses small and avoids expiring URLs.
5. Open in a **new tab** (`window.open(url, "_blank", "noopener,noreferrer")`) so the dialog and its unsaved edits stay intact. Do not build an in-dialog viewer.

---

## 8. Phase 3: Frontend

### 8.1 Card button (Q1)

- In the supervisor card, next to the existing rating display, add **one small icon button** "Review rating" (use an icon already available in the project's icon library; add none).
- Give it an `aria-label`/`title` of "Review rating".
- Show it **only** when a previous rating exists. If there is no rating yet, keep the current behaviour unchanged.
- It calls the same open-dialog handler the card already uses, in an "edit/review" mode with the existing rating passed in.

### 8.2 Dialog (Q2)

- Reuse the existing rating dialog. Add **optional** props only, for example:
  - `initialRating` (prefill values and remarks)
  - `ratingId` (marks edit mode → calls the update path from Phase 1)
  - `onOpenDocument` (or `documentRef`), shown only when provided
- Add one **"Open document"** button in the dialog. It is disabled/hidden if no document can be resolved, and it shows a loading state while the URL is fetched.
- Existing create-mode behaviour must remain byte-for-byte identical when the new props are absent.
- Save button label in edit mode: "Update rating" (or the existing label if a shared one is used).

### 8.3 After save

- Update **only the affected card's rating** in local state/cache from the response (or revalidate that one item). Do not reload the whole page or refetch the entire project list.
- Reuse the project's existing toast/notification helper for success and error.
- Close the dialog on success, as the create flow does.

### 8.4 UX guards

- Disable Save while the request is in flight (prevents double submit).
- Do not enable Save if nothing changed (optional; skip if it needs more than a couple of lines).
- Keep dialog state when the document opens in the new tab.

---

## 9. Edge cases and fallbacks

| # | Case | Required behaviour |
|---|------|--------------------|
| 9.1 | Rating exists but the document reference cannot be resolved | Dialog still works; "Open document" is disabled with a short tooltip. Rating can still be edited. |
| 9.2 | Supervisor not assigned to the project | Server returns 403. UI does not show the button anyway. |
| 9.3 | Project reset by admin / archived | Follow the existing rule for rating edits. Return the existing error, and add none of your own. |
| 9.4 | Old document overwritten in storage (Q7 = overwritten) | **Do not** change the upload pipeline to fix this. Ship the feature with "Open document" showing the latest available file for that stage, and report this limitation to the owner. |
| 9.5 | Signed URL expired | Fetch a fresh one on each click (lazy resolve, 7.4). |
| 9.6 | Two supervisors edit at once | Last write wins, same as the existing create/update behaviour. No locking. |
| 9.7 | Network failure on save | Keep the dialog open, keep the typed values, show the error toast. |
| 9.8 | Multiple ratings for one project (per stage) | The button on each rating opens **that** rating with **its** document. Never mix them up. Key by rating id. |

---

## 10. Efficiency checklist

- [ ] No new collections, models, indexes, or dependencies
- [ ] Update uses a single indexed-key filter (`_id` + project id), one round trip
- [ ] Reads use `.lean()` / projections where the existing code does
- [ ] No N+1: nothing in the card list fetches documents or signed URLs up front
- [ ] Only the affected card re-renders/refreshes after save
- [ ] No new global state, context, or provider
- [ ] Any new code is under the existing folders, in existing files where reasonable

---

## 11. Files expected to change

Fill in the real paths after Phase 0. If your list is longer than this, justify each extra file.

| Layer | Likely change | Size |
|-------|---------------|------|
| Card component | Add the icon button, pass the existing rating to the dialog | ~10–20 lines |
| Rating dialog | Optional `initialRating` / `ratingId` / `onOpenDocument` props, "Open document" button | ~30–60 lines |
| Rating API route / action | Update path for an existing rating (only if missing) | ~30–60 lines |
| Document access route | Minimal extension only if it refuses older documents | 0–20 lines |
| Types (`types/`) | Only if a prop/response type needs an optional field | 0–10 lines |
| Test | One integration or unit test (see Section 12) | ~40–80 lines |

**Not expected to change:** models/schemas, stage/version logic, submission or upload code, Viva code, admin code, student-side pages, `proxy.ts`, config, package files.

---

## 12. Verification

### 12.1 Automated (follow the patterns already in `tests/`)

Add one test for the update path that:

1. Seeds a project with a stage, version, document status, and a rating.
2. Snapshots the project's `stage`, `version`, and document `status`.
3. Updates the rating and remarks through the route/action.
4. Asserts the rating changed **and** the snapshot values are **identical**.
5. Asserts a supervisor not assigned to the project gets 403 and the rating is unchanged.
6. Asserts a mismatched `ratingId`/`projectId` pair updates nothing.

If the repo's tests need infrastructure that is not available locally (for example, a MongoDB replica set), say so and describe what was verified manually instead. Do not fake a passing result.

### 12.2 Manual QA (mirrors the real workflow)

1. Sign in as a supervisor with an assigned project that is in the thesis stage and has a proposal rating.
2. Open the project. Confirm the small "Review rating" button appears on the rating.
3. Click it. The dialog opens prefilled with the previous values.
4. Click "Open document". The proposal document opens in a new tab and the dialog stays open.
5. Change the rating/remarks and save. The toast shows success and the card updates without a full reload.
6. Refresh. The new values persist.
7. Confirm in the UI/DB that **stage, version, and document status are unchanged**.
8. Sign in as a student. Confirm they see the updated remarks where they already saw ratings, and no new access.
9. Sign in as a supervisor **not** assigned to the project. Confirm no button and no access via direct API call.
10. A project with **no** rating yet shows no "Review rating" button, and the create flow works exactly as before.

### 12.3 Static checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

All must pass with no new warnings introduced by your changes.

---

## 13. Definition of done

- [ ] Every invariant in Section 2 holds (verified by test or explicit manual check)
- [ ] Create-rating behaviour is unchanged
- [ ] Diff is within the budget in Section 3.6, with no unrelated edits
- [ ] No new dependencies, models, or env vars
- [ ] Lint, typecheck, and build pass
- [ ] Manual QA 12.2 completed, with any limitation (e.g. 9.4) reported

**Suggested commit message:**
`feat(supervisor): review and revise previous rating with access to the rated document`

**Rollback:** the change is additive and prop-gated. Reverting the commit fully restores previous behaviour. No data migration is involved, so none needs undoing.

---

## 14. Final report the implementer should return

1. Answers to Q1–Q10 (short).
2. List of files changed, each with a one-line reason.
3. Any assumption made and any limitation found (especially Q5, Q7, Q9).
4. Test/QA results.
5. Optional follow-ups deliberately **not** done (audit fields such as `revisedBy`, change-history, student notification on revised rating).
