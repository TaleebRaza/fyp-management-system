# Login diagnosis — 18 October 2026

Follow-up: [implemented changes and constrained before/after results](login-improvement-2026-10-18.md). The proposed parallel account/rate-limit reads were tested and rejected; the intro was retained.

Scope: login UI, NextAuth client/server, password verification, rate limits, MongoDB connection reuse, portal/Viva restrictions, login writes and initial dashboard loading. No application behavior, credentials or database data changed. Existing unrelated working-tree changes were preserved.

## Findings

1. **The first visit deliberately hides the login form for about 4.9 seconds.** `app/page.tsx` gates unauthenticated rendering on `SessionIntro`. Its sequential timers in `components/ui/SessionIntro.tsx` total 4,909 ms, excluding scheduling/render overhead; the safety timeout is seven seconds. Reduced motion still waits 950 ms. This happens before entering credentials, once per tab session, and does not explain post-submit delays. Removing the blocking intro is the clearest security-neutral improvement to first access.

2. **Concurrent password verification queues behind finite CPU/workers.** A fresh benchmark called the real `hashPassword` and `verifyPassword` exports with synthetic credentials and asserted every verification succeeded. Parameters remained N=32768, r=8, p=1. Results below are single local waves, not deployment predictions. The existing npm dev/start scripts already default to eight workers; direct hosting startup must configure its own environment. More workers do not guarantee better complete-workload performance.

   | Concurrent checks | Default workers p95 | Eight workers p95 |
   | --- | ---: | ---: |
   | 1 | 128 ms | 130 ms |
   | 10 | 443 ms | 383 ms |
   | 50 | 1,937 ms | 1,396 ms |

   These timings exclude database, HTTP and browser work. Historical `findings.md` also records verification p95 of 1,738 ms against callback server p95 of 2,005 ms in its corrected baseline. That is historical evidence, not a rerun of the current application. Preserve hashing strength; confirm deployed startup settings and allocate compute based on a matched login/mixed workload.

3. **Post-submit login is a request waterfall.** Installed `next-auth/react` calls providers → CSRF → credential callback → session sequentially. Only then does `app/page.tsx` mount the dynamically imported role dashboard, whose hooks fetch dashboard data. Thus callback latency alone understates time until the portal is usable. Measure all four requests, chunk loading and the first dashboard response. Keep NextAuth's CSRF/session handling. A measured follow-up could preload the appropriate dashboard chunk after trusted session identity is known, overlapping its download with exit animation; this is secondary to server queues.

4. **The callback has serial database stages.** Current order is portal status/connection → limits → user lookup → password verification → Viva restriction → successful writes. Rate-limit deletion, monthly-login update and activity write already run in parallel. Connections are already reused, portal status already has a five-second cache, and account/IP limit reads already share one query. A small candidate is overlapping the read-only user lookup with the limit lookup, while still awaiting and enforcing limits before any password verification. This trades one removed round-trip dependency for extra lookup work on blocked attempts; benchmark it before retaining it. Do not move password verification ahead of throttling.

5. **Database queueing is historically measured, but current deployed impact is unmeasured.** The ten-connection pool is shared with other portal work. Earlier reports show checkout waits of seconds under mixed load; a previous pool-40 trial worsened login tails. The current five-second checkout timeout bounds a wait; it does not increase throughput. Reduce competing work and measure checkout/command durations before choosing pool size or database/app capacity. Missing indexes are not established as the cause: the schema declares unique login/limit indexes and earlier query-plan checks used indexes. Actual deployment indexes and app/database network placement still need verification.

6. **Legacy bcrypt logins do extra work on their first successful login.** A synthetic cost-12 bcrypt password took 449 ms to verify and 575 ms including the required scrypt rehash, excluding its database update. Current production hash distribution was not inspected, so this is conditional, not a demonstrated production bottleneck. Subsequent scrypt logins avoid that migration cost. Preserve compatibility and the guarded hash update.

7. **Every successful login awaits activity and account writes.** Activity records share one document across users. This is a potential contention point, not a newly measured dominant cause. Existing historical measurements put its average command time around 40 ms. Preserve logging; do not replace awaited writes with untracked promises in serverless execution. Consider changing activity storage only if phase/driver measurements establish significant contention.

## Recommended order

1. Remove the blocking intro to expose the form immediately, if changing that presentation is desired.
2. Use existing `LOGIN_PHASE_TIMINGS=1` in controlled staging and capture browser request timings for warm/cold single login and 10/50-user waves. The phase logger records durations/outcome, not usernames/passwords. It measures authorization only, excluding the other auth requests and dashboard readiness.
3. Verify deployed worker settings, compute capacity, database region and real indexes. The eight-worker startup default is already implemented.
4. Trial overlapping independent limit/user reads, preserving check ordering; compare latency and database work under successful and blocked attempts.
5. Address measured database contention and dashboard loading next. Recheck mixed traffic, not just isolated login throughput.

Literal zero-time authentication is not realistic: password verification is intentionally expensive. The practical goal is immediate access to the form and a short, measured warm-login path, with separate tail-latency targets for concurrent bursts.

## Validation and limits

`node --test tests/password-security.test.mjs tests/login-rate-limit-structure.test.mjs` passed both test files. Password benchmarks exercised real cryptography with assertions; no mocks or weakened parameters were used. The structure checks do not prove end-to-end security or concurrency behavior.

No live deployment, real-account login, database query plans, current HTTP load test or browser trace was available/run in this diagnosis. No production root-cause attribution or speedup guarantee is claimed. No application fixes were applied; this is the requested investigation and prioritized fix scope.
