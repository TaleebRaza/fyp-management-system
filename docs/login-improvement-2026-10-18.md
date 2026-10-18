# Login changes and constrained before/after tests — 18 October 2026

Login is faster in the measured local tests. The intro remains unchanged. Free-tier burst login is still not instant: 50 concurrent credential callbacks had a final median trial p95 of 17.0 seconds.

## Changes kept

- Login reads use Mongoose `lean()` instead of constructing account documents that the handler never modifies. The same credential projection and legacy roll-number fallback remain.
- Account/IP throttling completes before any credential lookup or password verification. After throttling passes, portal status and account retrieval run together; the existing portal-status cache still applies.
- Student and supervisor Messages/Viva sections load their code when opened. Their initial dashboards download less code. Loading messages use accessible status announcements; all section props and server authorization remain unchanged.
- The HTTP benchmark now includes provider discovery and measures discovery → CSRF → credentials → session → first dashboard API response. Failed waves drain before reporting, network errors retain their error codes, and the final fixture checks login counters and activity records.
- A test-only MongoDB wire proxy and its checks provide repeatable throughput pacing against real MongoDB, without replacing database responses with mocks.

No dependencies were added. Password parameters, session lifetime/revocation, CSRF, access restrictions, login logging, the ten-connection application pool and the eight-worker npm startup setting were preserved. Intro, password implementation and password-reset file hashes were checked against their pre-change values.

## Optimization rejected during testing

An initial variant queried the account alongside account/IP throttling. Its first trial passed, but its second encountered failed requests and activity-log writes in the 50-user wave. That variant was removed. The final code keeps credential reads behind throttling. Artifacts for the failed experiment remain in `after-1/`, `after-2/` and `server-after.log`; they are **not** the final results below.

This is a measured reason to reject that trial, not proof that parallel reads alone caused every failure. Do not revive it based only on its faster successful samples.

## Resource limits

Vercel documents Hobby functions at **1 vCPU and 2 GB**, with a 300-second maximum duration under Fluid Compute. The test application ran in a temporary systemd unit with `CPUQuota=100%` and `MemoryMax=2147483648`; builds and load generators ran outside it. Both measured versions used eight password workers and a ten-connection application pool. [Vercel function limits](https://vercel.com/docs/functions/limitations).

MongoDB Free documents **100 read/write operations per second**, **500 connections**, and **0.5 GB of document/index storage**. A separate loopback MongoDB instance used `--maxConns 500`. All application MongoDB traffic passed through a proxy pacing CRUD commands globally at no more than 100 per rolling second, with a fixed synthetic 40 ms database round trip. Setup and post-test assertions connected directly, outside timed requests. Final logical document/index size was about 1.25 MB and the connection check observed 14 connections. [MongoDB Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

This is a constrained local approximation, not an Atlas/Vercel emulator. Atlas uses shared hardware and three replica-set nodes; this test used one local MongoDB 7.0.41 replica-set node, while current Atlas Free documentation specifies MongoDB 8.0. Command pacing approximates throughput ceilings, not Atlas's internal cooldown algorithm. Shared database CPU/RAM, deployment network placement, autoscaling, cold starts and weekly/monthly quotas were not reproduced. The small fixture did not test operation at the storage ceiling. Client request timeouts remained 30 seconds.

## HTTP comparison

The baseline and final builds used production-mode Next.js and the same synthetic fixture, settings and request sequence. Each trial covered all three roles, missing/wrong credentials, inactive accounts, account/IP limits, missing IP, legacy password upgrade, active Viva restrictions and successful waves of 1/10/25/50 users.

The table uses the **median of three trial p95s**. At concurrency one, each trial supplies one warm wave sample, so that row is a median of three individual timings. Baseline trials were `before-2/3/4`; final trials were `final-1/2/3`. `before-1` was excluded because focused tests overlapped part of that initial run. No builds or unit tests overlapped the selected trials.

| Simultaneous logins | Credential callback before | Final | Observed reduction |
| --- | ---: | ---: | ---: |
| 1 | 445 ms | 328 ms | 26.4% |
| 10 | 5.77 s | 3.12 s | 45.9% |
| 25 | 12.72 s | 9.81 s | 22.8% |
| 50 | 26.93 s | 16.98 s | 37.0% |

For 50 users, the complete HTTP path through the first dashboard API response improved from **32.12 s to 20.14 s** by the same calculation. This excludes dashboard JavaScript and rendering; the browser measurements below include those. The three 50-user callback p95s ranged from 26.09–28.54 s before and 14.94–20.57 s finally.

All three selected baseline trials and all three final trials passed with zero unexpected HTTP failures. The last final trial additionally asserted exactly **93 saved login counts and 93 login activity records**, matching its accepted logins. No final activity-log write failure messages were observed.

These are sequential comparisons on one shared local machine, not randomized cloud trials or guaranteed production percentages. Changes in scheduling, temperature and background host activity can affect timings; the observations do not attribute every saved millisecond to one source change.

## Browser comparison

Chromium used fresh contexts with cache disabled, synthetic 40 ms browser latency and 10 Mbps download/upload limits. Each role was tested three times before and finally. Timing starts at clicking Sign in and ends when the primary dashboard API has returned successfully and the dashboard heading is visible. It excludes the retained intro and does not wait for every secondary background widget.

| Role | Before median | Final median | Dashboard JS after clicking Sign in, before → final |
| --- | ---: | ---: | ---: |
| Student | 1.66 s | 1.42 s | 114,638 → 85,492 bytes |
| Supervisor | 1.62 s | 1.16 s | 93,260 → 71,800 bytes |
| Admin | 1.52 s | 1.12 s | 113,804 → 113,829 bytes |

Byte counts are decoded script sizes, not compressed network bytes. Student/supervisor dashboard code after sign-in fell about **25% / 23%**. Including the public page's existing scripts, total decoded JavaScript through initial dashboard readiness fell about **3% / 2%**. Admin code was essentially unchanged; its timing remains a useful comparison for the shared authentication change and run variation.

The final browser run opened both deferred Messages and Viva sections for students and supervisors, verified their content, and recorded no uncaught page errors. The native NextAuth request sequence remained intact.

## Security and quality checks

- Real HTTP/database checks passed before and finally: revoked sessions denied, disabled accounts and existing sessions denied, legacy roll-number compatibility preserved, correct passwords unable to bypass account/IP lockouts, and paused portals blocking students while allowing administrators.
- The login matrix also checked wrong passwords, legacy bcrypt-to-scrypt upgrade, and active Viva restrictions for students/panel members.
- The focused unit check verifies locked requests never query credentials, run the legacy scan or verify passwords. Real password checks test full Unicode inputs and bcrypt truncation rejection.
- Production webpack builds and their TypeScript checks passed; all 81 final unit-test files passed. Lint passed with the existing unused `models` warning in the portal baseline runner. The final unit/lint logs are retained with the artifacts.
- No production data, R2 objects, email, deployment settings or paid resources were used. Test artifacts contain synthetic identities only.

## Artifacts and replay

Raw results and the local launch/browser/security/comparison scripts are retained in the gitignored `.local-bench/login-2026-10-18/` directory. Build metadata records build IDs and source hashes; resource files record the actual systemd limits. The proxy observed a maximum of **99 CRUD commands per rolling second** across 9,451 commands. The failed experiment is retained separately from final measurements. Temporary application/database/proxy services were stopped and the isolated synthetic database and its generated storage files were removed.

The repository's benchmark entry point remains `tests/support/viva-http-stress-runner.mjs` with `VIVA_STRESS_STAGE=login`. Its guard permits only loopback and the dedicated `fyp_viva_http_stress_test` database, which it replaces. Use `VIVA_STRESS_BASE_URL=http://localhost:3102`, the isolated MongoDB URI and an artifact directory; run a production server with matching auth URL and database settings. The test-only proxy is `tests/support/free-tier-mongo-proxy.mjs`; application traffic must use its port and `directConnection=true` so replica discovery does not bypass it.

Remaining practical limit: secure hashing still needs CPU time. These changes remove overhead; they do not make 50 simultaneous logins instant on one free-tier CPU. Verify the deployed worker setting, co-locate application/database regions, and collect deployed phase/browser timings before making a production latency or capacity promise. Broad mixed upload/grading traffic was not rerun for this login-focused change.
