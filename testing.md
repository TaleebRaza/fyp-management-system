# Portal load-test baseline

Run date: 2026-10-12  
Result: **passed**  
Detailed machine-readable measurements: `.local-bench/portal-load-2026-10-12/report.json` (local, git-ignored).

## Setup

- A disposable production build of the portal ran on loopback at `127.0.0.1:3191`.
- MongoDB 7.0.41 ran as a local single-node replica set. The seeded and modified records are isolated in `fyp_portal_stress_test`.
- Uploads used a temporary local MinIO instance and the dedicated `fyp-portal-stress-test` bucket. Password-reset messages went to a local SMTP capture server; no external mail was sent.
- Seeded 1,000 students, 500 supervisors, 500 projects, one Viva round, 100 panels, and **100 distinct Viva sessions**. The 100 sessions had separate projects and panel assignments. The upload test created 50 additional projects, leaving 550 at the end.
- Host: Intel Core i5-8250U, 8 logical CPUs, 7.61 GiB RAM. Runtime: Node.js 24.18.0.
- This is a repeatable local baseline, not a production capacity estimate. The app, database, and local storage shared one host; external network, real SMTP, and production object storage were not measured.

## Tests

The load runner issued concurrent requests against the real portal routes. Before the mixed phase, it started 50 sessions. During the mixed phase it ran 50 student login attempts (25 students belonging to active Viva sessions and 25 outside those sessions), 50 project resets, 50 complete password-reset flows, 50 project uploads, 50 supervisor changes, 50 team changes, and 75 dashboard reads. It then saved grades for the first 50 sessions while starting the other 50, bringing the round to 100 started sessions, and finally canceled all 100 sessions concurrently.

Each project/account operation used a separate synthetic student account. Uploads measured the reservation API, direct object-storage transfer, and project submission separately. The password-reset test captured each OTP locally and completed verification and password change.

## Results

Latency is in milliseconds. `p95` means 95% of requests completed within that time. “Login” combines the CSRF and authentication callback requests; its callback includes both successful logins and the expected active-Viva rejection response.

| Operation | Concurrent requests | p50 | p95 | Max | Outcome |
|---|---:|---:|---:|---:|---|
| Login, CSRF + callback | 50 attempts | 2,187 | 2,327 | 2,336 | 25 accepted; 25 active-Viva students correctly received 401 |
| Initial Viva start | 50 | 551 | 589 | 591 | 50 started |
| Viva dashboard reads | 50 | 2,634 | 2,695 | 2,711 | 50 succeeded |
| Student dashboard reads | 25 | 3,074 | 3,092 | 3,099 | 25 succeeded |
| Project reset | 50 | 3,556 | 5,485 | 5,519 | 50 succeeded |
| Password-reset request | 50 | 2,275 | 2,440 | 2,442 | 50 messages captured locally |
| Password-reset OTP verification | 50 | 1,372 | 1,416 | 1,437 | 50 succeeded |
| Password change completion | 50 | 1,930 | 2,740 | 2,785 | 50 succeeded |
| Project upload reservation API | 50 | 8,415 | 11,033 | 11,256 | 50 succeeded |
| Direct upload to local storage | 50 | 3 | 7 | 8 | 50 succeeded |
| Project submission after upload | 50 | 4,235 | 6,918 | 7,801 | 50 succeeded |
| Supervisor change | 50 | 4,825 | 4,862 | 4,890 | 50 succeeded |
| Team change | 50 | 5,216 | 5,276 | 5,293 | 50 succeeded |
| Grade save | 50 | 3,329 | 3,366 | 3,379 | 50 saved |
| Second Viva start wave | 50 | 4,540 | 4,584 | 4,608 | 50 started; 100 total started in the round |
| Session cancellation | 100 | 786 | 910 | 917 | 100 canceled |

The mixed phase stressed reads and writes together, so its endpoint timings include contention from the other concurrent operations. Login callback results of HTTP 401 for active Viva students are expected policy behavior, not service errors.

Across **900 actual HTTP requests**, 0 were dropped (network/timeout failures), 0 returned unexpected statuses, and 0 unexpected errors were recorded. The only 401 responses were the 25 expected active-Viva login denials; the other 875 HTTP requests returned success. The raw report contains per-operation status counts and p50/p95/p99/max values.

## Repeat

The package scripts `npm run seed:portal:load` and `npm run test:portal:stress` reset and exercise only the dedicated stress database and bucket. The stress runner refuses non-loopback targets and any database other than `fyp_portal_stress_test`; it requires a disposable production build and local SMTP/MinIO adapters. The exact environment used for this run is preserved in the ignored `.local-bench/portal-load-2026-10-12` artifacts.
