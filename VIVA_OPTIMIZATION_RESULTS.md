# Viva Optimization Results

## Environment

- Working tree base: `30d690bcbcb6f36c47e75a76477bb861e6e413ad`
- Validation date: 2026-09-18
- Node.js: `v24.18.0`
- MongoDB: `8.0.16`, temporary local single-node replica set
- Pool settings: unchanged at `maxPoolSize: 10`, `minPoolSize: 1`
- Main benchmark: `npm run test:viva:performance`

## Shared-round concurrency

The benchmark contains both the existing 50-independent-round control and a
50-session scenario in one confirmed round. Every session uses disjoint
examiner and student participants.

| Run | Independent p50 ms | Independent p95 ms | Independent max ms | Shared-round p50 ms | Shared-round p95 ms | Shared-round max ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 361.66 | 370.52 | 370.68 | 305.26 | 314.81 | 315.01 |
| 2 | 370.17 | 378.37 | 380.21 | 308.18 | 317.49 | 317.78 |
| 3 | 357.58 | 366.38 | 366.60 | 306.22 | 314.54 | 316.47 |
| Median | 361.66 | 370.52 | 370.68 | 306.22 | 314.81 | 316.47 |

All three runs produced:

- 50 successful shared-round starts and 0 unexpected failures;
- 50 started sessions and 200 unique participant locks;
- one `session-started` audit event per session;
- 0 stale participant locks after grade and completion cleanup;
- exactly one winner in the shared-examiner and shared-student race checks.

The shared-round scenario is stable and does not serialize behind the round
document. Start now requires an already-confirmed round and does not update
`VivaRound.frozenAt`. Delete safety checks both the legacy `frozenAt` marker
and existence of any started session. A pre-change shared-round measurement
was not captured, so no before/after number is claimed.

## Panel agenda

The three final runs retained the bounded five-read agenda path.

| Sessions | Legacy reads | Current reads | Current response bytes |
| ---: | ---: | ---: | ---: |
| 1 | 6 | 5 | 1,169 |
| 10 | 42 | 5 | 11,682 |
| 50 | 202 | 5 | 58,442 |

## Client mutation behavior

- Source inspection confirms Start, Save Grade, and Complete set pending state
  before `fetch`, disable actions while pending, and replace only the returned
  session on success.
- The only full agenda reloads after mutations are in the existing error
  recovery paths. There is no success-path `router.refresh()` or second GET.
- The panel renders all sessions as a flat card list. There is no selected
  session or return-to-agenda interaction, so auto-advance was skipped.
- Browser Network-panel verification and React Profiler measurement could not
  be performed because no browser session was available. The memoized-card
  extraction was therefore not implemented; its measurement gate was not met.
- The initial `setTimeout(..., 0)` macrotask was removed. The existing fetch is
  queued with `queueMicrotask`, which keeps it in the same event-loop turn and
  satisfies the repository's `react-hooks/set-state-in-effect` lint rule.

## Portal-status gate

The portal-pause cache integration test passed, including concurrent read
coalescing, expiry, and invalidation. No deployed trace was available to show
that the internal `/api/portal-status` hop exceeds the plan's latency gate, so
proxy and route behavior were left unchanged.

## Validation

Passed:

- `npm run test:viva:persistence`
- `npm run test:viva:admin`
- `npm run test:viva:panels`
- `npm run test:viva:scheduling`
- `npm run test:viva:session`
- `npm run test:viva:access`
- `npm run test:viva:grading`
- `npm run test:viva:cancellation`
- `npm run test:viva:workflow`
- `npm run test:viva:auto-scheduling`
- `npm run test:viva:performance` three consecutive times
- `npm run test:portal-pause:cache` with its integration database configured
- `npm run lint`
- `npm run build`

`npm run test:unit` passed 62 of 64 files. The two failures are the existing,
unrelated `project-rating-ui.test.mjs` and
`storage-workflow-structure.test.mjs` failures already present before this
iteration; all Viva unit/structural tests passed.

`npm run indexes:refactor:audit` ran in read-only report mode and exited 2.
The configured target is missing expected indexes, including the Viva indexes.
No indexes were applied by this task.

## Unchanged boundaries

- No dependency, pool-size, or infrastructure change was made.
- No agenda split, history pagination, WebSocket/SSE path, PDF prefetch, or
  client state library was added.
- No portal-status routing change was made without deployed latency evidence.
