# Viva Performance Plan — Addendum (Iteration 2)

> Repository: `TaleebRaza/fyp-management-system`
>
> Applies on top of: `PLAN.md` (the "Viva Performance and Workflow Optimization Plan" uploaded for Codex)
>
> Status of base plan: **verified against current HEAD**. Sections 1–2 (rules, baseline) and Steps 0, 1, 2, 5, 6 are accurate and still apply unchanged. **Two of the base plan's steps are stale relative to the actual codebase and must be corrected before Codex executes them.** This file does not undo any implementation. It corrects two mis-targeted steps and adds two new minimal opportunities that the base plan's own Step 0 audit would have missed because it audits behavior, not React render cost.

Codex must read `PLAN.md` first, then apply the corrections in Section A below before touching anything in Steps 3 and 4, then treat Section B as new, gated steps appended after Step 5.

---

## A. Corrections to the base plan

### A.1 — Step 3 ("update UI from mutation responses") is already fully implemented. Do not re-touch it.

**What the base plan assumes:** that `components/supervisor/VivaSessionWorkspace.tsx` (or an equivalent panel component) still calls a full agenda reload after Start/Save Grade/Complete, and that immediate pending-state feedback needs to be added.

**What is actually at current HEAD:** all of the following are already true in `components/supervisor/VivaSessionWorkspace.tsx`:

- `setPendingAction(...)` is set synchronously before the `fetch` call for start, save-grade, and complete, and the button label switches to `Starting...` / `Saving...` / `Completing...` immediately;
- every action button is disabled whenever any `pendingAction` is set, which already prevents double-submission;
- on a successful response, the returned session is spliced into `sessions` by `id` (`current.map((session) => session.id === x.id ? x : session)`) — there is no second fetch, no `router.refresh()`, no `loadVivaSessions()` call on the success path;
- `loadSessions()` (the full reload) is only called once on mount and, deliberately, inside each action's `catch` block as the existing recovery path — which is exactly the behavior the base plan says to preserve.

**Why this matters:** the base plan calls this "likely the highest-value fix," which is no longer true — it is zero-value because it is done. If Codex executes Step 3 as written against this file, the only possible outcomes are a no-op diff or, worse, Codex "fixing" code that already satisfies every one of Step 3's completion criteria, which risks introducing a regression into stable UI code that Section 1, Rule 3 says must not be rewritten.

**Correction:**

1. Codex must treat Step 3 as **already complete** and must not modify `VivaSessionWorkspace.tsx`'s start/save/complete handlers.
2. Codex should still perform Step 3's *browser network test* (open the panel, click Start/Save/Complete, confirm no second agenda request fires) as a **verification-only** action, and record the result in `VIVA_OPTIMIZATION_RESULTS.md` under a new "Client mutation behavior" line, rather than as a code change.
3. The one legitimate, genuinely tiny leftover in this area (not called out by the base plan) is in Section B.2 below.

### A.2 — Step 4 ("auto-advance to next Viva") targets a UI concept that does not exist. Skip it as written; do not add a selected-session state solely to satisfy it.

**What the base plan assumes:** that the panel UI shows one Viva at a time and that, after completion, the examiner must manually navigate back to an agenda list and reopen the next scheduled session — i.e. that a "selected session" concept exists to update.

**What is actually at current HEAD:** `VivaSessionWorkspace.tsx` renders every session assigned to the panel as its own always-visible card in one continuous list (`sessions.map(...)`), each showing whatever controls match its own phase (Start / Save+Complete / completed banner). There is no single-session view, no selection state, and therefore no "return to agenda" step to eliminate — the next scheduled session's Start button is already on-screen the entire time.

**Correction:**

1. Codex must **skip Step 4 entirely**, per the base plan's own gate ("If the current UI already advances naturally, skip this step") — the gate condition is met, just not for the reason the base plan anticipated.
2. Codex must **not** introduce a `selectedSessionId`/single-session view purely to give Step 4 something to act on. That would add new client state and UI restructuring for a workflow problem that measurably does not exist, which conflicts with Section 1, Rules 4 and 5 of the base plan.
3. If there is a real remaining "dead time" complaint from examiners, it is more likely caused by the render-cost issue in Section B.1 below (large panels feeling sluggish) than by navigation — profile before assuming otherwise.

---

## B. New, gated additions (append after Step 5, before Step 6 final audit)

Both items below follow the base plan's own rule: a change is only kept if it removes a measured unnecessary client re-render, a measured request, or a measured interaction step (Section 1, Rule 5). Neither should be implemented speculatively.

### B.1 — Step 5b: Stop re-rendering every session card on every keystroke/mutation (measure first)

**Goal:** Remove unnecessary React re-render work in `VivaSessionWorkspace.tsx` that scales with the number of sessions on screen, which is directly relevant to the plan's own 50-concurrent-session target — the more sessions one panel admin's screen holds, the more this costs.

**Why this is a candidate:** `gradeDrafts` is a single flat `Record<string, string>` held in the parent component. Selecting a grade in any one card's `<Select>` calls `setGradeDrafts` on the whole object, which re-renders the parent and therefore re-evaluates `sessions.map(...)` for every card, not just the one being edited. The same is true for `pendingAction` changes during Start/Save/Complete. None of the session cards are extracted into their own memoized component, so there is nothing for React to skip.

**Measurement gate (must be done before changing anything):**

1. Using the React DevTools Profiler (or `<Profiler>` boundary temporarily, removed afterward per Rule 6), load the panel view with a realistic large session count (e.g. 20–50 cards, matching the shared-round scenario from Step 1).
2. Record render count/time for all cards when: (a) selecting a grade in one card, (b) clicking Start on one card.
3. If unrelated cards visibly re-render and the cost is measurable (not sub-millisecond noise), proceed. If the cost is negligible, do not implement — record the negative result and stop.

**Minimal implementation if the gate is met:**

- Extract the per-session card body into its own component (e.g. `VivaSessionCard`), wrapped in `React.memo`, keyed by `session.id`, receiving only that session's data plus the specific `isStarting`/`isSaving`/`isCompleting` booleans and its own grade-draft value/setter — not the whole `pendingAction` or `gradeDrafts` object.
- Move the single grade draft for that card into that card's own local `useState`, initialized from `session.result?.grade`, instead of a shared parent-level record.
- Do not introduce a state management library, context, or a new API for this. It is a component-boundary change only, inside the existing file/module.
- Do not change any request/response shape, any mutation logic, or any of the already-correct handlers from Step 3.

**Completed means:** unrelated session cards no longer re-render when one card's grade selection or pending state changes, verified with the same profiler measurement as the gate; all existing UI/behavioral tests for this component still pass; no new dependency or state store was added.

### B.2 — Step 5c: Remove the artificial macrotask delay before the first load

**Goal:** Delete one unnecessary tick of latency before the panel's very first data fetch — a pure deletion, no behavior change.

**What is there now:**

```ts
useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadSessions();
  }, 0);
  return () => window.clearTimeout(timer);
}, [loadSessions]);
```

**Why this is a candidate:** the `setTimeout(..., 0)` defers the initial fetch by one macrotask for no stated reason — it doesn't debounce anything, there's nothing else competing for the same tick, and no cleanup depends on the timer having fired. This is a Rule-4-style deletion: fewer steps between page mount and the first request.

**Minimal implementation:**

```ts
useEffect(() => {
  void loadSessions();
}, [loadSessions]);
```

**Verification:** confirm in the browser Network panel that the initial `/api/dashboard/supervisor/viva` GET now fires on the same tick as mount instead of one macrotask later, and that no existing test relies on the deferred timing (search first: `rg -n "setTimeout" components/supervisor/VivaSessionWorkspace.tsx tests`). If a test does depend on the deferral, leave this one alone and record why.

**Completed means:** the `setTimeout` wrapper is gone, the effect calls `loadSessions()` directly, and all existing tests for this component still pass.

---

## C. Updated implementation order for Codex

Replace the base plan's Section 12 order with this one:

1. **Step 0** (from `PLAN.md`) — re-verify HEAD, exact call sites, current test/benchmark state. Do this again even though this addendum already re-verified it once; Codex's own working copy may differ.
2. **Apply Correction A.1** — confirm Step 3 is done via the browser network test only; record the result; make no code change.
3. **Apply Correction A.2** — confirm the flat-list UI via inspection; make no code change; do not build a selection state.
4. **Step 1** (from `PLAN.md`) — add the one-round 50-session benchmark. Unexecuted and still required.
5. **Decision gate** — proceed to Step 2 only if Step 1 proves shared-round contention, exactly as the base plan specifies.
6. **Step 2** (from `PLAN.md`) — only if triggered.
7. **Step 5b** (this file, Section B.1) — profile first; implement only if the gate is met.
8. **Step 5c** (this file, Section B.2) — trivial deletion; low risk, do this regardless once verified against tests.
9. **Step 5** (from `PLAN.md`) — portal-status latency gate, unchanged, measurement-gated as originally written.
10. **Step 6** (from `PLAN.md`) — final regression/performance/cleanup audit, updated to also cover:
    - `git diff -- components/supervisor/VivaSessionWorkspace.tsx` should show either no change (if B.1's gate failed) or a component-extraction-only diff (if it passed), plus the one-line `setTimeout` deletion from B.2;
    - the "Client mutation behavior" verification note from A.1 is present in `VIVA_OPTIMIZATION_RESULTS.md`.

---

## D. Updated final definition of success

In addition to every bullet already listed in `PLAN.md` Section 13, the task is only successful if:

- no working code was changed to satisfy a step whose premise (Step 3, Step 4) did not match the actual current implementation;
- any re-render optimization (Section B.1) was implemented only after a measured profiler gate, not speculatively;
- the trivial `setTimeout(0)` deletion (Section B.2) is either applied or explicitly recorded as skipped with a reason;
- `VIVA_OPTIMIZATION_RESULTS.md` reflects reality — including the parts of the original plan that turned out to already be done — rather than re-describing work that didn't need to happen.
