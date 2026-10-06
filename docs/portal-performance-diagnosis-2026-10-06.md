# Portal performance diagnosis — 6 October 2026

This report records the pre-change diagnosis. Approved changes and their measured results are documented in [the implementation and retest report](portal-performance-improvement-2026-10-06.md).

The portal survived the local workload, but response times were slow. The main problem is the amount of database and password-checking work competing for limited application capacity. Application fixes have not been implemented.

## Evidence and proposed fixes

| Priority | Finding | Evidence | Smallest useful fix |
| --- | --- | --- | --- |
| 1 | Viewing a student dashboard writes registration settings unnecessarily. | `lib/features/student/dashboard.ts:33` calls `getOrCreateRegistrationPolicy`; `lib/registrationPolicy.ts:11` always runs an upsert. Schema timestamps turn this into an update even when the policy exists. Diagnostic snapshots recorded 450 policy find-and-modify commands. | Use the existing read helper; create defaults only when the policy is missing. Preserve policy changes and closure checks. |
| 2 | Student dashboards repeat database work. | The dashboard loads a project, while `getConfirmedVivaSchedulesForStudent` separately loads it again when no schedule snapshot exists. That fallback also loads rounds, sessions and panels, including panels when there are no matching sessions. | Reuse the project within the request and stop unnecessary fallback queries early. Preserve schedules for older records without snapshots. |
| 3 | Database operations queue for ten available connections. | `lib/mongodb.ts:32` limits the pool to ten. During the instrumented baseline, connection checkout averaged approximately 180 ms; the highest ten-second interval p95 was 999 ms. Most individual command averages were about 26–42 ms. | Reduce operations first, then benchmark modest pool sizes on the intended hosting environment. Consider bounded waiting with deliberate overload handling; a timeout alone does not improve capacity. |
| 4 | Admin viva reads load the entire project catalogue. | `lib/vivaRoundAdmin.ts:397` loads all populated projects and their students, all rounds, panels and schedules. The fixture contained 2,500 projects and about 4,900 project members, although the round had 75 sessions. | Separate current-round data from selection catalogues; search/page the catalogue and load it when needed. |
| 5 | Concurrent logins queue behind expensive password checks. | The application uses asynchronous scrypt. An isolated single check took about 152 ms, but a wave of 50 took 1.97–2.30 seconds with four workers, before any database or HTTP work. Mixed diagnostic snapshots observed up to 36 outstanding checks. | Keep password strength. Benchmark worker counts against CPU and memory limits after reducing request work; scale application capacity if necessary. |

The application event loop was busy approximately 87% of the sampled baseline window, sometimes effectively 100%. This confirms application pressure, but does not identify one specific CPU function. No stack-level CPU profile was collected, so serialization, instrumentation or any particular library should not be declared the dominant CPU cause.

## A larger connection pool was not a successful fix

Two instrumented 90-second local runs used the same workload configuration and temporary monitoring. Only the application pool setting changed, from 10 to 40; no repository configuration was changed.

| Mixed-traffic p95 | Pool 10 | Pool 40 |
| --- | ---: | ---: |
| Student dashboard | 7.77 s | 9.01 s |
| Login, CSRF plus callback | 7.48 s | 9.34 s |
| Supervisor viva dashboard | 2.95 s | 5.19 s |

Both runs passed correctness checks. Some team operations improved with the larger pool, but important dashboard and login tail latencies worsened. These are single sequential comparisons, not repeated randomized trials; they establish that blindly increasing the pool is not a demonstrated solution. The workload waits for responses before repeating, so completed operation counts differ between runs.

An isolated four-versus-eight-worker scrypt comparison showed a modest, variable improvement, not proof that eight workers would speed up the complete portal. More workers also consume additional memory and CPU.

## Secondary suspects and limits

- Every login and several student mutations await an update to one shared recent-activity document (`lib/portalActivityLog.ts`). This concentrates writes. Its measured command average was about 40 ms, so it is a secondary candidate, not the demonstrated main bottleneck. If further isolation proves contention, use individual activity records while preserving durable logging.
- Five checked query plans used indexes efficiently. This does not prove every query is indexed, but there is no basis to blame missing indexes generally.
- The load test deliberately repeated dashboards during active sessions more frequently than the current UI normally does. The UI does not contain the continuous five-second dashboard polling simulated by the test.
- The local test did not measure browser rendering, deployed network latency or actual hosting limits. Local results cannot certify production capacity.
- Atlas Free limits are a separate deployment constraint, not the cause of local queueing. Validate the intended database tier before making a production capacity claim.
- The previously discovered PDF closure bypass after a project reset is a separate correctness issue; it does not explain the measured slowness.

## Recommended approval scope

First implement read-only policy retrieval and remove duplicate/empty dashboard queries. Then reduce admin payloads. Retest the same mixed workload and test 75 simultaneously active sessions with roughly 75 concurrent logins to check the requested 50% headroom. Only then choose connection-pool, worker-count or hosting changes from measurements. These first fixes reuse existing code and need no new dependencies.

## Sources and artifacts

- [MongoDB connection-pool documentation](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/) explains connection waiting and the default unlimited wait-queue timeout.
- [Node.js CLI documentation source](https://github.com/nodejs/node/blob/main/doc/api/cli.md) documents scrypt's shared worker pool and its default size of four.
- Previous full-run report: `docs/viva-mixed-stress-report-2026-10-06.md`.
- Raw diagnostic artifacts, excluded from Git: `.local-bench/root-causes-2026-10-06/`, including baseline/pool-40 HTTP results, driver timing snapshots and isolated scrypt results.
- Monitoring adds overhead; the earlier uninstrumented ten-minute run remains the primary traffic benchmark. Ten-second diagnostic boundaries can include adjacent phases, so aggregated driver timings are approximate.

The temporary Next servers were stopped and the dedicated synthetic stress database was removed after testing. No application behavior or production data was changed by this diagnosis.
