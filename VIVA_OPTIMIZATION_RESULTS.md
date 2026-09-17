# Viva Optimization Results

## Environment

- Commit before: `e7c2f6b0daf73545004d499cd3a888801a93db56`
- Commit after: working tree based on the commit above (not committed by Codex)
- Node.js: `v24.18.0`
- MongoDB: `8.0.16`, local single-node replica set
- Pool settings: unchanged at `maxPoolSize: 10`, `minPoolSize: 1`
- Main benchmark: `npm run test:viva:performance`

The baseline implementation was exercised by the benchmark's legacy hydration function, which reproduces the previous panel/session/context query sequence. The optimized implementation was measured in the same process and fixture.

## Panel agenda

| Sessions | Before reads | After reads | Before ms | After ms | Response bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6 | 5 | 14.00 | 9.92 | 1,169 |
| 10 | 42 | 5 | 29.89 | 7.87 | 11,682 |
| 50 | 202 | 5 | 115.03 | 9.17 | 58,442 |

The optimized read count stays at five as sessions increase. Timings are local observations, not CI pass/fail thresholds.

## Fifty concurrent sessions

All 50 sessions used disjoint examiners and students. The first team contained students from different batches.

| Operation | Successes | Unexpected failures | p50 ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start | 50 | 0 | 403.82 | 411.92 | 412.44 |
| Save grade | 50 | 0 | 84.04 | 91.80 | 92.13 |
| Complete | 50 | 0 | 108.53 | 118.31 | 118.50 |

- Stale participant locks after completion: `0`
- User `updatedAt` changes caused by start locking: `0`
- Shared-examiner start race: exactly one session started
- Shared-student start race: exactly one session started
- Audit records: start, grade, and completion records were present for all 50 sessions

## Database behavior

- Active-session global conflict scan removed: yes
- Unrelated `User.updatedAt` locking writes removed: yes
- Access restriction uses a unique-user participant-lock lookup: yes
- Successful grade save avoids an unconditional session pre-read: yes
- Successful completion avoids an unconditional session pre-read: yes
- Completion and cancellation remove locks in their state-change transaction: yes
- Portal pause reads use a five-second cache with concurrent-read coalescing and local invalidation: yes

Local `executionStats` evidence after index creation:

| Query | Index | Documents examined |
| --- | --- | ---: |
| Panel by examiner | `examinerIds_1` | 1 |
| Sessions by panel, active schedule order | `panelId_1_cancelledAt_1_scheduledAt_1__id_1` | 50 |
| Participant lock by user | `userId_1` | 1 |

## Validation notes

- `npm run lint`: passed.
- `npm run build`: passed.
- All listed Viva integration commands passed against the local replica set, including persistence, round administration, panels, scheduling, session lifecycle, access, grading, cancellation, workflow, automatic scheduling, and the new 50-session performance test.
- Portal pause structural and cache integration tests: passed. Twenty simultaneous cold reads produced one database read; invalidation and expiry produced fresh reads.
- The initial full unit run had two pre-existing failures in `project-rating-ui.test.mjs` and `storage-workflow-structure.test.mjs`. These are outside the Viva changes and are recorded rather than hidden.
- Two stale Viva test fixtures were aligned with existing production validation: round fixtures now include their required project supervisor, and automatic-scheduling input validation is tested through the parser used by the API.

## Rollout

Before deploying:

1. Run `npm run indexes:refactor:audit` against the target database.
2. Apply the reviewed indexes with the repository's guarded `indexes:refactor:apply` command.
3. Confirm there are no active Viva sessions (`startedAt` set, `completedAt` and `cancelledAt` null).
4. Deploy only after the active count is zero. This is the selected migration strategy because existing active sessions do not have participant-lock rows.

Do not switch to the new release while legacy active sessions exist. On rollback, participant locks are harmless derived records, but they must be reconciled or cleared only after confirming there are no active sessions.

## Trade-offs and remaining work

- A pause/unpause performed on one warm application instance may take up to five seconds to be observed by another warm instance. The mutation invalidates its own instance immediately.
- No API contract was changed.
- Agenda payload splitting and completed-history pagination were not added. The measured 50-session response was about 58 KB, and the current UI consumes participant details for every card. This remains the next optimization if real production payloads or history growth justify the extra API/UI complexity.
- Pool sizes were not changed because the optimized workload passed with the existing ceiling of 10 connections.
