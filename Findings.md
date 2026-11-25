# FYP portal performance findings

[Backend bottlenecks under load — diagnosis and fix priorities](#backend-load)

**Test date** 21 November 2026, Asia/Karachi.

All 301 students signed in when login ran alone. With login, uploads, and Viva starts released together, 287 signed in, 201 files reached storage, 144 proposals were saved, and 20 Vivas started. All 201 student changes succeeded in a separate wave. A Viva-only comparison reached **50 active sessions**, the maximum with 100 supervisors under the portal's two-examiner minimum and participant locks.

## Timings

Times are in seconds. Minimum, average, and maximum include successful attempts only. Each row represents a single local wave. The upload-only row that starts at reservation includes the entire proposal submission, while the synchronized rows start at the PUT after advance reservation.

| Wave and operation | Success / attempts | Min | Avg | Max | Other outcomes |
| --- | ---: | ---: | ---: | ---: | --- |
| Login only, CSRF through verified session | 301 / 301 | 55.98 | 57.14 | 57.46 | |
| Mixed, CSRF through verified session | 287 / 301 | 52.36 | 52.53 | 52.73 | 14 HTTP 401 |
| Viva only, start | 50 / 101 | 2.04 | 2.12 | 2.19 | 51 active-participant conflicts, HTTP 400 |
| Mixed, Viva start | 20 / 101 | 0.71 | 12.36 | 24.09 | 81 HTTP 500 |
| Upload only, reserve through saved proposal | 201 / 201 | 10.44 | 13.51 | 16.32 | |
| Upload only, reserve | 201 / 201 | 2.81 | 6.62 | 10.23 | |
| Upload only, staggered object PUT | 201 / 201 | 0.007 | 0.008 | 0.023 | PUTs followed individual reservations |
| Upload only, synchronized object PUT | 201 / 201 | 0.210 | 0.489 | 0.580 | |
| Upload only, synchronized PUT through saved proposal | 201 / 201 | 5.19 | 8.31 | 11.64 | |
| Mixed preparation, reserve before burst | 201 / 201 | 2.19 | 3.25 | 4.28 | |
| Mixed, synchronized object PUT | 201 / 201 | 0.646 | 0.664 | 0.673 | |
| Mixed, proposal save after PUT | 144 / 201 | 23.63 | 34.52 | 45.14 | 57 HTTP 500 |
| Mixed, PUT through saved proposal | 144 / 201 | 24.34 | 35.22 | 45.90 | 57 failed at proposal save |
| Mixed, student dashboard GET | 10 / 10 | 13.07 | 13.18 | 13.30 | |
| Student changes, join another team | 51 / 51 | 12.57 | 14.60 | 15.75 | |
| Student changes, reset project | 50 / 50 | 9.04 | 16.39 | 18.18 | |
| Student changes, change supervisor | 50 / 50 | 12.00 | 13.78 | 15.82 | |
| Student changes, password reset through local OTP | 50 / 50 | 6.16 | 9.48 | 12.14 | |

In the mixed wave, unsuccessful attempts took **20.36 / 20.74 / 21.20 s** for login, **21.39 / 22.13 / 22.81 s** for Viva start, and **18.53 / 18.85 / 19.17 s** for proposal save (min / avg / max).

The four main waves took **57.53 s** for login only, **16.34 s** for uploads only, **52.76 s** for mixed traffic, and **18.19 s** for student changes. The Viva-only wave took **2.81 s** overall. Browser sign-in took **2.01 s** from button click to dashboard profile controls in one quiet sample.

## Faults and what to optimize

| Finding and evidence | In plain English | Improvement to test |
| --- | --- | --- |
| **Viva starts exhausted the app's MongoDB pool.** All 81 mixed-wave Viva 500s logged a connection checkout timeout. The app allows 10 pooled connections per process and a 5 s checkout wait. The Viva-only wave returned 50 starts and 51 expected participant conflicts with zero 500s. [App pool](lib/mongodb.ts#L34) · [Viva start](lib/vivaSessionDashboard.ts#L1061) | Other traffic used the same database connections, so many Viva starts ran out of time waiting. | Measure checkout wait by route. Bound the number of simultaneous transactions and return an explicit retryable response when capacity is temporarily exhausted. Retest before raising the pool size. |
| **Saving proposals was slower and less reliable during mixed load.** All 201 mixed PUTs succeeded. PUT-to-save averaged 35.22 s on successes, versus 8.31 s in the synchronized upload-only control. There were 57 failed saves. Finalization checks and copies the object, then updates a shared storage ledger inside a serialized per-process transaction. Generic submission logs leave the exact cause of each save failure undetermined. The control used fresh proposals and the mixed wave reused projects with PDFs from the prior wave, so the comparison combines traffic and record-state differences. [Finalization](lib/storageProtocol.ts#L352) · [Shared write queue](lib/transaction.ts#L30) | The file arrived, but the portal was slow or failed while attaching it to the project. | Record timings for verification, commit-queue wait and transaction retries. Test resumed saves and compare fresh proposals against replacements with the same traffic. |
| **Password verification dominated login-only credential work.** Server telemetry averaged 27.43 s inside authorization, including 23.71 s in password verification and its wait. The quiet browser sample spent about 194 ms in that phase. The 14 mixed 401s had no recorded reason. Only three login actors belonged to Viva projects, so the active-Viva login restriction could explain at most three of the 14. [Credential flow](app/api/auth/%5B...nextauth%5D/route.ts#L104) · [Hashing](lib/security/password.ts) | Hundreds of password checks queued behind each other, and some mixed-load sign-ins were rejected. | Preserve the password hashing cost. Measure the password-work queue, test admission control and additional compute, and record internal rejection categories without logging passwords. |
| **Reset transactions all update the same policy record.** All 50 succeeded and averaged 16.39 s in the student-change wave. The reset increments the same policy version inside each project's transaction. This test did not isolate how much delay came from that update. [Reset transaction](app/api/dashboard/student/route.ts#L192) | Students resetting different projects still write to the same shared record. | Measure transaction retries by action. Test whether the admin's reset policy can be enforced with less shared write contention. |
| **Dashboard reads slowed in the mixed wave.** The client measured 13.18 s on average for 10 reads. The quiet browser probe's one dashboard request logged about 0.62 s of server time. These are different timing boundaries, so the comparison is directional. The combined wave does not isolate login, upload, and Viva effects from each other. | Opening a dashboard took longer while other students were signing in, uploading, and starting Vivas. | Compare identical dashboard probes while adding one workload at a time. Prioritize keeping read requests responsive during large write waves. |

## Data and requests

| Finding and evidence | In plain English | Improvement to test |
| --- | --- | --- |
| A fresh student browser run used **32 local requests**, **10 to API routes**, and about **0.97 MiB** of DevTools-reported transfer from initial navigation through the dashboard. Two raw logo responses accounted for about **626 KiB** with Playwright request interception and HTTP caching disabled. The separate DevTools MCP page-open saw the second raw logo request return 304. | The logo was the biggest download in the cache-disabled run. With caching on, the second request reused the image. | Consolidate the splash and login logo sources, then check actual cold and warm transfer sizes. |
| Login used three benchmark requests per user. A browser also asked for providers, portal status, registration policy, Viva access, headline and the dashboard. The credential response was **31 B** in the login-only wave, with **5.9 Mongo driver commands** on average across 653 callbacks including setup. [Login-side writes](app/api/auth/%5B...nextauth%5D/route.ts#L147) | Login returned very little data, but it still made several trips and wrote counters and activity records. | Review repeated initial reads and measure deferring nonessential counters. Keep required access checks and audit behavior. |
| The mixed student dashboard averaged **1,645 B** of decoded response data. Across 11 recorded dashboard reads, each used **10 to 44** Mongo driver commands. Upload reservations returned **659 B** and averaged **12** driver commands, followed by the direct PUT and a separate save. Driver counts can include transaction commands and retries. [Upload route](app/api/upload/route.ts#L45) | The database did a lot of work to send back small answers. | Profile repeated queries by route, reuse verified data within a request, and keep file bytes on the direct-to-storage path. |
| The Viva overview asks for a preview capped at three entries. The full Viva workspace reads the whole assigned agenda with full workspace data. The student supervisor picker already loads on demand and caches its public data for 60 seconds. These lists were not measured at their largest sizes. [Viva agenda](lib/vivaSessionDashboard.ts#L972) · [Supervisor cache](lib/publicContentCache.ts#L42) | The Viva preview is small, but a long agenda can still load a lot at once. | Measure a large agenda before adding pagination. Keep the on-demand supervisor picker. |

The driver counts show where to investigate extra work. They do not measure database result bytes or the number of records scanned. The generic failure messages also gave the client too little information to distinguish a safe retry from a rejected operation.

## Fixed limits and local approximations

| Boundary | Limit and test treatment | In plain English |
| --- | --- | --- |
| Vercel Hobby | Node function memory is **2 GB**, with **1 vCPU** and a **300 s** maximum duration with Fluid compute. Function requests and responses are capped at **4.5 MB**. Next.js ran on one pinned logical CPU with a **1,536 MiB V8 old-space cap**. That cap applies to part of Node's memory. Peak sampled RSS was **628 MiB**. Sampled Next.js cumulative CPU utilization reached **85.9%** of one core. The test did not emulate platform autoscaling, edge routing or the deployed container limit. [Vercel function limits](https://vercel.com/docs/functions/limitations) | Optimizing the portal can save resources, but it cannot raise Vercel's limits. |
| MongoDB Atlas Free | **100 operations/s**, **500 connections**, **0.5 GB** for data and indexes, and **10 GB inbound plus 10 GB outbound** per rolling seven days. Local MongoDB used a one-node replica set, **500** configured max connections and a **256 MiB** WiredTiger cache. Atlas throttling, storage accounting, latency and shared-host behavior were unmodeled. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) | The cloud database can throttle traffic even when the portal runs well locally. |
| Cloudflare R2 Standard | The monthly included usage is **10 GB-month**, **1 million Class A** requests and **10 million Class B** requests. The local S3-compatible service validated signing and object writes. It did not model R2 network behavior or billing. The simultaneous uploads used different object keys. [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [R2 limits](https://developers.cloudflare.com/r2/platform/limits/) | Local uploads do not measure Internet speed, and using more than the free allowance can cost money. |
| Portal Viva rules | Each panel needs **at least two examiners**, and each examiner can be locked to one active session. **101** simultaneous sessions require at least **202** eligible examiners. The 101 attempts shared 50 panels. [Panel minimum](models/VivaRound.ts#L19) · [Participant lock](models/VivaParticipantLock.ts) | With 100 supervisors, the portal can run at most 50 Vivas at once, regardless of hardware. |

The observed mixed-load limit was local application connection checkout. This run does not establish a hosted capacity number or show that upgrading one provider alone will meet a latency target.

## Setup and reproduction

1. Start from [the local test launcher](testing/local-portal.sh) and [testing instructions](testing/README.md). Use disposable MongoDB, S3-compatible storage and the local SMTP sink on loopback. Pin the Next.js process with **taskset -c 2** and launch Node with **--max-old-space-size=1536** and **UV_THREADPOOL_SIZE=4**. This host had an Intel i5-8250U, eight logical CPUs and about 7.6 GiB RAM. Record route timings, login phase timings, vmstat at one-second intervals and process CPU and RSS at two-second intervals.
2. Run **node scripts/seed-local.mjs performance** with student, supervisor, project, session and panel counts of **500, 100, 250, 100, 50** using M2_STUDENT_COUNT, M2_SUPERVISOR_COUNT, M2_PROJECT_COUNT, M2_VIVA_SESSION_COUNT and M2_VIVA_PANEL_COUNT. Add one scheduled record for an unused assigned project on an existing panel. Make all sessions due and give the 298 non-Viva students individual eligible proposal projects. Clear synthetic fines, set students active and provide spare supervisor capacity.
3. Use one Playwright APIRequestContext per actor. Release 301 CSRF, credential, and session-verification flows together. Run 201 PDF reservation, signed PUT and proposal save flows using 64 KiB files. Reserve 201 new uploads before the mixed wave. Release 201 PUTs and their subsequent saves together with another 301 login flows, 101 Viva starts and 10 student dashboard reads.
4. Release 51 team joins, 50 project resets, 50 supervisor changes and 50 password resets together. Fetch reset codes from the loopback mailbox. For the control, start with a fresh equivalent fixture, pre-reserve 201 uploads before releasing PUTs and saves together, then run the 101 Viva start attempts separately.
5. Keep browser and scale results distinct. Playwright ran one sandboxed headless Brave browser at a time. DevTools MCP opened the portal and reported two form fields without associated labels. Playwright's DevTools Protocol session captured the successful browser login and its network traffic. The concurrency waves used API contexts with real cookies. Wave sizes describe client releases, with sequential steps inside each flow. This test did not render hundreds of tabs or measure sustained active-Viva traffic, grading, or hosted-provider behavior.

The fresh Turbopack build failed on sandbox port binding and a Google Fonts fetch. The measured target used the existing **20 November 2026** production test build in the local reports directory. The first smoke attempt passed five API-backed tests and hit three Brave launch errors with a custom temporary path. The retry with the default temporary path passed **all eight** Playwright smoke tests in **22.1 s**.

A browser upload received a signed URL from the HTTP storage fixture, but the page's HTTPS-only external connection policy blocked the PUT. The HTTPS loopback retry used a disposable certificate scoped to the test browser and saved the proposal in **0.29 s** from the submit click to the save response. The portal's content security policy stayed active. In plain English, browser upload needs HTTPS storage even on this local test. [Content security policy](lib/contentSecurityPolicy.ts#L11)

Browser UI checks also saved a team join in **0.16 s**, a project reset in **0.42 s**, and a supervisor change in **0.46 s** from the relevant confirmation or action click to the response. The browser password reset completed all three requests through the local mailbox and signed in with the new password. A panel admin started a Viva in **1.03 s** from click to response on a fixture with a scheduled end time, and Brave showed the active session controls. These are individual workflow checks outside the load waves.

The disposable MongoDB files, object storage, mailbox, test scripts, certificates, browser profiles, and run artifacts were cleaned up after verification. The earlier audit is preserved below.

<details>
<summary>Previous dashboard audit, 9 October 2026</summary>

# Complete dashboard performance audit — 9 October 2026

This report records what the current portal does and proposes improvements. No performance fix has been applied to the application. The strongest proven opportunity is the student-list sorting index. Other clear savings come from delaying unused lists and avoiding repeated counts and refreshes.

**Completion statement:** dashboard reads and backend action cases below have runtime evidence; UI callback sequences were also traced in source. Successful email verification could not run with email disabled. Not every mutation was clicked through its browser dialog, and this report does not certify those complete browser journeys. Browser-only clipboard, microphone capture, and every downloaded document's contents are not fully verified. These limits are not counted as successful tests.

## Tested source and environment

- Revision: `33e4c55667ec837c482402b15112f9665e90ccc9`. The tracked working tree was clean when the audit began.
- Stack: Next.js 16.3.5 App Router, React 19, Mongoose 9, MongoDB, NextAuth, and S3-compatible storage. Existing Node.js, Playwright, MongoDB and MinIO packages/services were reused; no dependency was installed.
- Production-mode application servers used loopback ports 3119, 3120 and 3121. Only database `fyp_dashboard_audit_20261009` and bucket `fyp-dashboard-audit-20261009` were changed by audit requests.
- Functional fixture: 161 users, 128 projects, one Viva round, three panels and three sessions. It includes active/inactive students, assigned teams, and examiners. Capacity values and migration-code casing were corrected before the canonical success runs.
- Larger fixture: 5,161 users, including 5,133 students, and 2,628 projects. It added 5,000 students and 2,500 projects temporarily. This was a synthetic growth check, not a production-data copy or production-capacity test.
- The application was copied to `/tmp` for building and instrumentation. Only that copy had its Google font download removed and Sentry disabled. A local-network-only preload blocked external services. Email credentials were absent. The backend's business logic was preserved.
- The isolated Webpack production build passed. A sandboxed build attempt failed while reading TypeScript configuration; the normally approved local build succeeded. No application change was made to work around it.
- Old October 5–7 reports were used as background only. Current traces, rather than their historical counts, are the evidence here.

## What the numbers mean

An **action** means a dashboard workflow such as opening a section, saving a name, or grading a Viva. It does not mean every React render, state update, or JavaScript function invocation.

A **call** is an HTTP request. Browser API calls, page assets, and direct storage transfers are recorded separately. One call can run many database operations.

Database **reads** include `find`, `aggregate`, and `distinct`; **writes** include updates, inserts, deletes, and `findAndModify`. Cursor continuation (`getMore`), transaction commit/abort, and collection/index creation are separate. A single aggregation may examine thousands of records. A returned aggregation document may itself contain arrays: cursor-row counts are not the number of students processed internally.

Browser `bodyBytes` is the decoded response body length. `sizes.responseBodySize` is Playwright's transferred response-body measurement; headers are separate. Small transferred bodies can be slightly larger because of transfer framing. API harness response sizes are reserialized JSON bytes. Database `replyJsonBytes` is a JSON-size estimate of a driver reply, **not BSON or network traffic**. These different measurements must not be added together as one bandwidth number.

Database profiling runs and the 30-sample timing runs used separate servers. Timings are local elapsed HTTP durations; they include request handling and transfer, not browser rendering. The larger-fixture timing pass had some light supplemental browser activity against the same local database, so its percentiles are observations on this machine, not an isolated capacity guarantee. p95 uses the nearest-rank sample. No before/after application speedup is claimed.

The canonical backend pass contains **387 HTTP requests**, with **120 distinct measured read/action variants**, each repeated three times. Setup calls are retained separately. Status totals: `{'200': 339, '201': 39, '401': 3, '503': 3, '404': 3}`. The three 401s are deliberate active-Viva restrictions, three 503s are disabled email verification, and three 404s are deliberately denied file access. All other canonical requests returned 200 or 201.

Raw evidence and the full per-field sizes are in [summary.json](.local-bench/dashboard-audit-2026-10-09/summary.json). The evidence directory is Git-ignored; keep it with this report when sharing the measurements.

## Dashboard opening, focus, and idle activity

Each row below summarizes three browser trials. JSON bytes exclude scripts, images and other page assets. Login starts from the signed-out page and ends after the dashboard loads. Reload starts with an authenticated session. Focus was dispatched explicitly; it is separate from idle observation.

| Dashboard | Event | API calls | Decoded response bytes | Transferred body bytes | DB reads | DB writes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| student | login | 11 | 6689 | 6812 | 15–19 | 3 |
| student | reload | 7 | 6365 | 6445 | 11 | 0 |
| student | focus | 4 | 878 | 923 | 3–4 | 0 |
| supervisor | login | 10 | 5807 | 5918 | 13 | 3 |
| supervisor | reload | 6 | 5483 | 5551 | 9 | 0 |
| supervisor | focus | 4 | 884 | 929 | 2–3 | 0 |
| admin | login | 11 | 13708 | 13833 | 20–21 | 3 |
| admin | reload | 7 | 13384 | 13466 | 16 | 0 |
| admin | focus | 3 | 848 | 882 | 1–2 | 0 |

The first student login against the fresh database additionally created 13 collections and issued 41 index-creation commands. These are visible in the raw trace and excluded from the operational read/write columns. Later lazy model initialization also appears in the per-action administrative counts in `summary.json`. Do not describe initial index setup as work that occurs on every dashboard visit.

**Ten-minute idle result:** all three roles made **zero background API requests** during the observed 600.105-second common window. The student and admin pages remained in their Viva workspaces; the supervisor page remained in its Viva section. This establishes idle behavior for those screens, not every possible open dialog or fine-restricted visibility transition. There is no evidence here for adding an idle polling optimization.

The student reload calls registration policy, portal status, session identity, headline, supervisor catalogue, Viva access and student dashboard. Supervisor reload calls registration policy, portal status, session identity, Viva access, supervisor dashboard and Viva sessions for the Home preview. Admin reload calls registration policy, portal status, session identity, headline, supervisor list, summary and student list.

The shell and identity calls begin together. Dashboard calls start after session resolution. Student data/headline/catalogue requests start together. Supervisor's Home Viva preview starts after project loading mounts Home. Admin's list and summary hooks start together. Some database calls run concurrently within endpoints; query counts are not sequential round-trip counts.

See [browser.jsonl](.local-bench/dashboard-audit-2026-10-09/browser.jsonl), [browser-extra.jsonl](.local-bench/dashboard-audit-2026-10-09/browser-extra.jsonl) and [browser-viva.jsonl](.local-bench/dashboard-audit-2026-10-09/browser-viva.jsonl). Initial exact-name selectors missed buttons with badges; supplemental checks covered them. Initial Viva subsection clicks had no selected round and were disabled; the corrected run selected the fixture round and completed Panels → Schedule → Round setup → Panels three times. These were harness issues, not portal defects.

## Data fetched and where the interface uses it

| Read | Data returned / use | Amount in the functional fixture |
| --- | --- | --- |
| Shared registration policy | Registration/submission switches, closure message, fine settings; shell/admin controls | 600 JSON bytes |
| Shared portal status | Pause flag and reason; access screen and admin status | 111 bytes |
| Session identity | Signed-in identity, role and session data; choose dashboard | 137–153 bytes in browser reloads |
| Student dashboard | Student profile, project fields, team members, supervisor, broadcast, restrictions, Viva schedules/results; Home/forms/team/Viva | 1,584 bytes for assigned baseline |
| Public supervisors | Names, IDs, slot counts and availability; assignment/change selector | About 3.9 KB for 26 supervisors; fetched on Home too |
| Templates | Word template metadata and HTML; preview/copy | 3,053 bytes; loaded on request |
| Supervisor dashboard | Assigned project details, team/student fields, ratings, stage/version, migration code; Home counts, filters, cards and PDF | About 4.6 KB for seven projects |
| Supervisor Viva | Full session workspaces with project/team/panel details and grade scales; full Viva screen | 15 bytes for no sessions; 1,264 bytes for one scheduled session |
| Supervisor Home Viva preview | Same full Viva response, but Home uses ID, phase, title and date for up to three upcoming entries | Does not need all full-workspace fields |
| Admin student page | 20 student rows, status, cursor, totals, active count, global batch choices; table/filter/badges | About 6.2 KB per populated page |
| Admin supervisor list | Supervisor identity, migration codes, notifications and capacity; management table | About 6.9 KB after fixture preparation |
| Admin summary | Four numeric totals; Home statistics | 64 bytes |
| Admin reports | All report summaries, fine detail lists, supervisor/login counts; selected report and local exports | About 6 KB; larger fixture still about 6.2 KB despite expensive joins |
| Admin Viva setup | All eligible teams/members/examiners, all rounds/panels/schedules; setup pickers and quotas | 30,688 bytes small; 807,358 bytes large |
| Admin Viva operational | Teams/examiners selected by existing rounds, plus rounds/panels/schedules | 3,633 bytes in these fixtures |
| Staff inbox | Routed student message content/metadata; supervisor project context when applicable | Empty response 15 bytes; populated variants measured separately |
| Project reviews | Current page's projects/people, pagination, submission switch | Empty 123 bytes; 24 large-fixture search results 17,972 bytes |
| Fines | Up to 20 matching students plus payment/accrual/restriction settings on initial load | Empty baseline 335 bytes; populated variants measured |
| Activity logs | Bounded page of audit entries and pagination | Baseline about 2.8 KB |
| Ratings export | Matching project/member/reviewer rating rows; browser builds PDF | Both empty and populated variants measured |

The canonical JSON files record top-level field sizes, list counts and field names. Source references for consumers and request triggers are in [source-inventory.json](.local-bench/dashboard-audit-2026-10-09/source-inventory.json). Full UI state and every DOM field access were not instrumented.

## Action coverage and follow-up calls

The sequences below come from current UI source, with their endpoint operations exercised by the backend harness. They are not claims that every dialog was automated. Counts describe successful requests; error recovery can add reloads.

| Dashboard workflow | Calls and follow-up work | Evidence / behavior |
| --- | --- | --- |
| Student Home / My Project / Team / Viva navigation | Existing dashboard data; no extra API request merely to switch these views | Browser navigation and source |
| Student Resources / templates | Open Resources: no data call; Load templates: one GET; cached nonempty template list avoids repeat fetch | Browser and API |
| Student template preview/copy | Uses fetched HTML; no backend call | Source; clipboard success not fully verified |
| Student project draft edits | Local browser draft storage; no server save on each keystroke | Source |
| Student name save | POST student action → GET dashboard | Endpoint measured; callback traced |
| Student academic save | POST action → GET dashboard → GET supervisors, sequentially | Endpoint measured; callback traced |
| Student assign/change supervisor | POST action → GET dashboard → GET supervisors, sequentially | Both success endpoints measured |
| Student join / reset | POST join/reset → GET dashboard | Join, reset and reset-with-file measured |
| Student leave | POST leave → GET dashboard → GET supervisors, sequentially | Multi-member success fixture measured |
| Student new PDF submission | POST upload reservation → direct storage PUT → POST submit → GET dashboard | Real tiny local file transfer/finalize/read measured |
| Student existing PDF submission | Can omit reservation/PUT when reusing current file; submit and dashboard refresh remain | Source branch; no separate existing-file resubmission benchmark |
| Student message section | GET current message on mount; revisiting remounts and reads again | Browser repeat visits |
| Student text send / delete | POST or DELETE → GET current message | Success endpoint paths measured |
| Student audio send | POST voice reservation → storage PUT → POST message → GET current message | Real local bytes and finalization measured |
| Student audio/file playback | GET read-pdf → redirect → storage GET; audio players may request ranges | Real local authorized reads; denied access measured |
| Student fine view / visibility refresh | Fine view uses dashboard data; returning to visibility while restricted refreshes dashboard | Fined endpoint measured; visibility callback source-derived |
| Student email request / confirm | POST email action per step; success revokes session after confirmation | Request returns 503 with mail disabled; successful delivery/confirmation blocked |
| Supervisor Home / projects / help | Project list fetched once by dashboard hook; Home also fetches full Viva preview on mount; filters/help use local state | Browser and source |
| Supervisor project search / program / batch / queue filters | Local filtering, no additional database request | Source; assigned-project navigation measured |
| Supervisor project dialog | Uses loaded project; opening/closing itself needs no API | Source |
| Supervisor review / rating / progress / migrate / expand / remove | POST supervisor action → GET supervisor dashboard | Every backend action measured |
| Supervisor local PDF export | Builds from loaded projects; no new project-data API request | Source; full generated PDF contents not verified |
| Supervisor communication | GET staff inbox on mount/reload | Empty and populated inbox measured |
| Staff acknowledgement | PATCH messages; update local row on success; reload on conflict/error | Admin and supervisor success measured |
| Staff text reply | POST messages; remove replied row locally; no normal GET afterwards | Both roles measured |
| Staff audio reply | POST voice reservation → storage PUT → POST reply; local row removal | Real local transfer measured |
| Supervisor text broadcast / delete | One POST or DELETE; close dialog locally | Text, audio and deletion variants measured |
| Supervisor audio broadcast | POST voice reservation → storage PUT → POST broadcast | Real local transfer measured |
| Supervisor Viva open / reload | GET full sessions | Empty, scheduled, running snapshot and completed states measured |
| Supervisor Viva start / save grade / complete | One POST; returned workspace updates local state; GET on errors | Success lifecycle and access restriction measured |
| Supervisor Viva requeue | One POST; response contains refreshed session list | Success measured |
| Admin Home | Hooks fetch students, supervisors, headline and summary | Browser reload measured |
| Admin student search / program / batch / status / pagination | One GET per committed filter/page; search is debounced 300 ms | API variants and browser search/page measured |
| Admin student program / batch / promotion / activation | POST mutation → GET students | All endpoints measured |
| Admin email change | POST → local row patches → GET supervisors and GET students concurrently | Mutation measured; follow-up source-derived |
| Admin supervisor create / slots / notifications | POST → GET supervisors | All endpoints measured |
| Admin supervisor delete | POST → GET supervisors and GET students concurrently | Success measured |
| Admin headline publish | One POST; update local headline | Endpoint measured |
| Admin reports open / refresh | First open GET reports; reopen can reuse loaded data; explicit refresh GET | Browser open/close and API measured |
| Admin report selection / HTML / CSV / open tab | Uses existing report data; no new report-data API request | Source; output contents not fully verified |
| Admin ratings PDF | GET export rows → browser PDF generation | Empty/populated row API measured; full PDF artifact not verified |
| Admin review open/search/program/page/reload | One GET, with cursor required for later pages | Empty/populated/search/program/page variants measured |
| Admin review approval / changes requested / stage progression | POST review; local change; conditional page/queue reload; approval can open optional next-stage confirmation | Backend success paths and source callbacks |
| Admin submission switch | One PATCH; update local flag | Both close/open measured |
| Admin registration settings | One PUT; returned policy updates parent/local state | Success measured |
| Admin fines open/search | One GET; search returns matching list without repeating all settings | Empty/populated/search measured |
| Admin fine controls | PATCH for pause/resume accrual, new-fine toggle, payment details, restriction toggle, clear one, clear all, erase history | All eight actions measured; normal success patches local data |
| Admin portal pause / resume | One PUT; parent state updates locally | Both measured |
| Admin activity logs / paging | One GET for selected page | Initial read measured; every later page not separately exercised |
| Admin Viva setup/panels/schedule navigation | GET catalogue=1 for setup, catalogue=0 for operational sections; switching refetches data | Corrected browser sequence repeated three times |
| Admin Viva round create / update / delete | POST / PUT / DELETE; response/local state updates | All measured |
| Admin Viva panel drafts / quotas / move / swap examiners | Local changes until Save; random generation POST; save PATCH | Generation/save measured; individual draft edits source-derived |
| Admin Viva schedule preview / apply / confirm / cancel / swap | POST preview; PATCH apply, confirm, cancellation or panel swap | Every backend operation measured |
| Theme, local dialogs, cancel confirmation | Local state; no backend request until confirmed action | Source |
| Sign out | NextAuth CSRF/signout flow; student also clears local draft | Source; signout not separately benchmarked |

Raw backend cases: [api-complete.jsonl](.local-bench/dashboard-audit-2026-10-09/api-complete.jsonl), [extra-complete.jsonl](.local-bench/dashboard-audit-2026-10-09/extra-complete.jsonl), [edges.jsonl](.local-bench/dashboard-audit-2026-10-09/edges.jsonl). Earlier attempts are retained for traceability but excluded from canonical success totals.

## Thirty-sample timings for the five slowest larger-fixture paths

These paths were selected from the initial broader measurements. All 150 measured responses returned 200. These are current-state timings, not improvements after a fix.

| Path | Samples | Median ms | p95 ms |
| --- | ---: | ---: | ---: |
| `/api/admin/viva?catalogue=1` | 30 | 202.55 | 337.97 |
| `/api/admin/students?page=1&limit=20&status=Pending` | 30 | 851.74 | 1139.73 |
| `/api/admin/students?page=1&limit=20` | 30 | 68.36 | 181.07 |
| `/api/admin/reports` | 30 | 876.37 | 1170.11 |
| `/api/admin/project-reviews?search=Audit&program=BSCS` | 30 | 93.43 | 180.54 |

Evidence: [scale-timing.jsonl](.local-bench/dashboard-audit-2026-10-09/scale-timing.jsonl). Profiling runs for the same fixture are in [scale.jsonl](.local-bench/dashboard-audit-2026-10-09/scale.jsonl); their slower timings include profiling overhead and must not be substituted for this table.

## 1. The student-list index does not match its full sort

### Finding

The route sorts by `createdAt` and `_id`, but existing role/program/batch sort indexes stop at `createdAt`. The actual page query returned 20 students after examining 5,133 records and keys. A temporary index `{ role: 1, createdAt: -1, _id: -1 }` returned the same page while examining 20 records and keys. It was removed after the experiment. Sources: [models/User.ts:103](models/User.ts#L103) and [app/api/admin/students/route.ts:211](app/api/admin/students/route.ts#L211). [Query experiment](.local-bench/dashboard-audit-2026-10-09/index-experiment.json).

### Issue caused

A small page can require reading and sorting the complete student list. The first explain showed a blocking sort. The measured current endpoint p95 was 181.07 ms in the larger-fixture timing pass.

### Proposed Fix

Update the existing default student sort index to include `_id`; validate the first and cursor-following pages and identical ordering. Check the program/batch index variants with their actual filters before changing those too. Build the replacement through the existing index deployment process, verify it, then remove redundant old indexes. No production index was changed.

### Other solutions researched that were not the optimal possible solution

Increasing page size does not remove the full scan. A larger database pool does not fix the missing sort order. Replacing the route with a larger aggregation is unnecessary for this query. Adding every possible compound index would increase write/storage cost without evidence.

### Very Simple English, Non Technical Wording explanation of above three

The portal reads thousands of students to show 20. A better-organized database index let the same query read only those 20. This is the clearest small fix found.

## 2. Student status filtering joins the whole student list before returning one page

### Finding

The status branch joins projects before filtering/counting/paging students. At scale, it read 5,133 student records; its lookup stage examined 5,131 project records using `members_1`. This is one aggregation command with substantial internal work. Current p95: 1,139.73 ms. Source: [app/api/admin/students/route.ts:143](app/api/admin/students/route.ts#L143). [Explain evidence](.local-bench/dashboard-audit-2026-10-09/explain.json).

### Issue caused

Every status-filtered page repeats the join for the matching student population, including work needed to calculate the exact total. A small response hides a large database cost.

### Proposed Fix

First remove the repeated global metadata reads described below. Then benchmark a project-first selection for assigned statuses, using existing status/member indexes and the same student filters/cursor ordering. Keep the missing-project logic for Unassigned. Adopt a replacement only after verifying exact totals, inactive users, missing projects and duplicate-membership handling; the current lookup chooses one canonical project, so a naive reverse join can change results. No simpler replacement has yet passed that equivalence benchmark.

### Other solutions researched that were not the optimal possible solution

Putting a limit before the status filter can omit valid students and give wrong pages. Keeping a second student-status field creates synchronization work. Caching all student pages complicates invalidation after assignment, reset and admin changes. A shorter-looking query is not evidence of a faster correct query.

### Very Simple English, Non Technical Wording explanation of above three

Filtering students by project status checks almost everyone first. That is slow. We should narrow the work earlier, but the replacement must still show the right students and totals.

## 3. Reports join every student to a project, including for unrelated report data

### Finding

`/api/admin/reports` joins students to projects before a shared facet builds all reports. At scale it examined 5,133 students and 5,131 project records in the lookup; its separate project aggregation examined 2,628 projects. It returned only about 6.2 KB. Current p95: 1,170.11 ms. Source: [app/api/admin/reports/route.ts:109](app/api/admin/reports/route.ts#L109). [Explain evidence](.local-bench/dashboard-audit-2026-10-09/explain.json).

### Issue caused

Opening reports performs assignment-related work even if the user only wants program, activity or fine information. Few network calls do not imply little database work.

### Proposed Fix

Keep the current shared join for reports that genuinely need canonical assignment. Add a narrow report-selection option only for reports that can use direct user/project aggregates without that join, and have those selections request their own data on demand. Compare the common one-report journey and the multi-report journey before adopting it. The default students-per-supervisor report still needs assignment data; this proposal is not a proven speedup for that default.

### Other solutions researched that were not the optimal possible solution

Moving the lookup into every facet can repeat the same expensive join. Fetching all raw users/projects into Node increases data transfer and application memory. A permanent materialized report requires write-time maintenance and freshness policy. Splitting every report into a different endpoint adds unnecessary structure.

### Very Simple English, Non Technical Wording explanation of above three

The portal prepares many reports even when you want one. Some reports need team information and some do not. Fetching only what that report needs could save work; fetching everything as raw records would make things worse.

## 4. Admin Home loads two management lists it does not display

### Finding

Admin Home uses the summary's numbers, yet student and supervisor hooks fetch their full lists on mount. Browser reload fetched 6,166 bytes of students and 6,289 bytes of supervisors alongside a 64-byte summary. The list endpoints contribute seven and three read commands respectively in isolated reads. Sources: [components/dashboards/AdminDashboard.tsx:97](components/dashboards/AdminDashboard.tsx#L97) and [components/dashboards/AdminDashboard.tsx:277](components/dashboards/AdminDashboard.tsx#L277).

### Issue caused

Admin Home downloads and queries management data before the administrator opens either table.

### Proposed Fix

Load each list on its first relevant section opening, retain the existing local state after that, and keep explicit mutation refreshes. Use summary data for Home and supervisor badge counts. Preserve student badge meaning: the summary currently counts active students, while the student page total includes inactive students. If the badge must retain the all-student count, return active/all totals from one small user aggregation in the summary rather than downloading table rows. Verify first visit, revisit, badges and management mutations.

### Other solutions researched that were not the optimal possible solution

Combining the same full lists into one bootstrap call saves HTTP overhead but retains their database/payload cost. Removing the summary would require loading tables merely to calculate Home counts. A new global cache/store is unnecessary for first-open loading.

### Very Simple English, Non Technical Wording explanation of above three

Admin Home asks for student and supervisor tables even though it only shows totals. Wait until those tables are opened, and keep the numbers correct.

## 5. Each student page repeats two global metadata reads

### Finding

Ordinary first and second student pages each used seven reads: authentication/access checks plus row/status/total work, an active-student count and a global batch list. The active count and batch choices are returned again on later pages. Source: [app/api/admin/students/route.ts:133](app/api/admin/students/route.ts#L133). Current code does not contain the optional metadata behavior described in an older local handoff.

### Issue caused

Changing pages repeats whole-list work unrelated to those 20 rows. The active count also repeats information used by Home.

### Proposed Fix

Include global active count and batch options on initial load, relevant filter resets and explicit refresh after changes. Omit them on ordinary later-page navigation and retain the previous metadata in client state. Keep filtered total and row/status data correct. This removes two read commands from those requests; it does not remove an HTTP call. Verify page 2+, empty results, returning to page 1 and mutations.

### Other solutions researched that were not the optimal possible solution

Combining the two values in another facet still recomputes global data on every page. Dropping exact filtered totals changes pagination behavior. A long-lived shared cache introduces invalidation work that a simple optional metadata flag avoids.

### Very Simple English, Non Technical Wording explanation of above three

The portal recounts all active students and reloads all batch names every time you turn a page. Keep those values and refresh them when needed.

## 6. Assigned students download all supervisors on Home

### Finding

`useStudentDashboardData` starts the supervisor catalogue alongside headline and dashboard data. This also happens for already-assigned students. Browser reload downloaded 3,886 catalogue bytes for 26 supervisors. The catalogue supports assignment/change controls, not the normal assigned Home view. Source: [components/student/hooks/useStudentDashboardData.ts:102](components/student/hooks/useStudentDashboardData.ts#L102).

### Issue caused

An unnecessary request and payload is paid on every dashboard opening. Server caching can avoid a database read, but does not eliminate this browser request/download.

### Proposed Fix

Load supervisors when the student opens assignment/change controls, with a loading state. Reuse the successful list during that dashboard session and refresh after capacity-changing actions. Keep server-side slot reservation authoritative. Verify unassigned students, changing supervisors, failed loads and capacity conflicts.

### Other solutions researched that were not the optimal possible solution

Adding the catalogue to the student-dashboard response still sends unused data to assigned students. Raising cache duration does not remove the request and may leave availability older. Adding a client-data library for one lazy list is unnecessary.

### Very Simple English, Non Technical Wording explanation of above three

Students already assigned to a supervisor still download the entire supervisor list. Load it when they actually need to choose or change one.

## 7. Some student saves wait for two independent refreshes in sequence

### Finding

Academic update, supervisor assignment/change and team leave await dashboard refresh and then catalogue refresh. They are independent after the successful mutation and required draft cleanup. Sources: [components/student/hooks/useStudentAcademicUpdate.ts:83](components/student/hooks/useStudentAcademicUpdate.ts#L83), [components/student/hooks/useStudentSupervisorActions.ts:84](components/student/hooks/useStudentSupervisorActions.ts#L84), [components/student/hooks/useStudentTeamActions.ts:77](components/student/hooks/useStudentTeamActions.ts#L77).

### Issue caused

The completion message waits for both fetch durations added together. This sequencing was traced in source; no application before/after timing is claimed.

### Proposed Fix

After mutation and necessary draft cleanup, run the required dashboard/catalogue refreshes together with the existing Promise utilities. With lazy catalogue loading, skip its refresh until needed when it has never been loaded. Keep failures visible and do not move dependent cleanup after the refresh.

### Other solutions researched that were not the optimal possible solution

Combining both entire payloads into a new endpoint changes more code and still sends an unnecessary catalogue when it is unused. Dropping all refreshes can leave team/capacity data wrong. Fire-and-forget refreshes can hide failures.

### Very Simple English, Non Technical Wording explanation of above three

After some saves, the portal finishes one refresh before starting another that could run at the same time. Start the required refreshes together.

## 8. Admin email changes refresh both people lists

### Finding

The email callback patches the returned email locally, then concurrently reloads both students and supervisors. An email change affects one account type. Source: [components/admin/hooks/useAdminEmailUpdate.ts:51](components/admin/hooks/useAdminEmailUpdate.ts#L51).

### Issue caused

One unrelated list is downloaded and queried after every successful email edit. The refresh pair is concurrent, so deleting one does not automatically halve elapsed time.

### Proposed Fix

Refresh only the affected account list, using the role already known by the invoking section. Preserve email-search/filter membership; a local row patch alone is not enough when the changed address should leave the current search result. Verify student/supervisor edits and email-filtered tables.

### Other solutions researched that were not the optimal possible solution

Removing both refreshes without checking filters can leave a row in the wrong search result. A shared event bus/cache invalidation layer is excessive. Combining the unrelated lists into one response preserves the unnecessary work.

### Very Simple English, Non Technical Wording explanation of above three

Changing one student’s email also reloads the supervisor table, and vice versa. Refresh the list that actually changed.

## 9. Viva setup still downloads the full catalogue and operational tabs refetch shared data

### Finding

The existing catalogue split works: at scale setup returned 807,358 bytes for 2,628 teams; operational mode returned 3,633 bytes for three teams and six examiners. Setup still reads all projects/members, and operational mode scopes to projects selected across all rounds rather than just one chosen round. Browser Panels → Schedule → setup → Panels caused fresh endpoint calls. Source: [lib/vivaRoundAdmin.ts:397](lib/vivaRoundAdmin.ts#L397) and [components/admin/AdminVivaSection.tsx:302](components/admin/AdminVivaSection.tsx#L302).

### Issue caused

Setup payload and mapping grow with the complete project catalogue. Tab switches repeat data already held in the Viva component.

### Proposed Fix

Keep operational mode. Load catalogue data only for setup selection, retain it while that Viva workspace stays open, and provide a clear refresh path after relevant changes. Reuse freshly loaded operational data for immediate panel/schedule navigation; scope operational reads to the selected round if historical rounds make the payload grow. If catalogue growth remains expensive, add server search/pages while preserving bulk quotas and selected IDs independently of the visible page. Compare complete setup/quota workflows before changing selection behavior.

### Other solutions researched that were not the optimal possible solution

Removing the catalogue breaks team selection and quotas. Arbitrarily limiting it silently hides eligible teams. Combining setup and operational mode reverses the measured payload saving. New realtime infrastructure is unnecessary for navigation reuse.

### Very Simple English, Non Technical Wording explanation of above three

Viva already has a lighter operational view. Keep it. The setup screen still downloads every team, and tab switches fetch some of the same information again.

## 10. Supervisor Home asks for the full Viva workspace to show three short entries

### Finding

Home fetches the same full Viva endpoint used by the workspace, then keeps the first three upcoming sessions. It displays title/date and needs ID/phase for selection/filtering; the full response also contains people, descriptions, panels and grade scales. A one-session response was 1,264 bytes. Returning to Home and opening Viva each issue their own GET. Source: [components/supervisor/SupervisorOverviewSection.tsx:26](components/supervisor/SupervisorOverviewSection.tsx#L26).

### Issue caused

Preview cost grows with assigned sessions and carries fields the Home view never uses. This is a smaller proven payload mismatch, not the dominant measured bottleneck.

### Proposed Fix

Add a preview mode to the existing endpoint only if a populated supervisor fixture confirms useful savings: return up to three upcoming sessions with the fields Home displays, taking titles from live projects for scheduled sessions and snapshots for running sessions. Keep the full workspace endpoint behavior for Viva. Alternatively share just-loaded full data between Home and Viva if removing the immediate duplicate fetch is enough. Benchmark those two small choices before adding another persistent cache.

### Other solutions researched that were not the optimal possible solution

Deleting the preview removes a visible feature. Fetching a separate endpoint for each session creates an N+1 problem. A long-lived cache needs invalidation during grading, requeueing and scheduling.

### Very Simple English, Non Technical Wording explanation of above three

Home only shows a few titles and times but asks for complete Viva details. A small preview could be enough; the full details should still load when Viva is opened.

## 11. Student responses repeat broadcast fields and some mutation reads load whole documents

### Finding

The student service reads supervisor broadcast fields and returns them both in the supervisor object and the separate `supervisorBroadcast` object. Student UI consumes the separate broadcast representation. Several mutation reads omit a narrow projection, although schema-hidden security fields remain excluded. Sources: [lib/features/student/dashboard.ts:41](lib/features/student/dashboard.ts#L41), [lib/features/student/dashboard.ts:125](lib/features/student/dashboard.ts#L125) and [app/api/dashboard/student/route.ts:500](app/api/dashboard/student/route.ts#L500).

### Issue caused

Repeated broadcast text adds response bytes when a broadcast exists. Whole-document reads can transfer unrelated message/broadcast fields into mutations. These are source-derived trim opportunities; their populated worst-case bandwidth saving has not been measured.

### Proposed Fix

Return only supervisor identity/contact fields in the supervisor object while retaining the separate broadcast object. Narrow read-only mutation lookups to fields actually consumed. Preserve full documents and rechecks where validation, atomic updates or transaction decisions need them; do not blindly add `lean()` to save paths. Test text/audio broadcasts and mutation authorization before retaining changes.

### Other solutions researched that were not the optimal possible solution

Changing all response shapes together causes unnecessary client churn. Blindly using `lean()` prevents document saves/validation. Removing transaction rechecks trades correctness for lower counts. Compression can reduce bytes but does not remove duplicate data.

### Very Simple English, Non Technical Wording explanation of above three

Some information is sent twice, and some saves read more of an account than they need. Trim those fields carefully, without removing the checks that keep saves safe.

## Work already kept simple / no justified removal

- Student dashboard reuses its executed project query for Viva schedule fallback. The empty fallback stops before fetching unrelated rounds/panels. Removing all fallback work would break older schedules.
- Supervisor project loading batches member IDs and reads students once; it does not query once per project. Viva scheduled-session context is also loaded in batches. Snapshot-backed sessions avoid unnecessary live context reads.
- Public headline, policy and supervisor data already use the platform cache. Portal-pause reads already share an in-flight request and a short cache. These caches mean browser call count and database count are different.
- Fines and staff acknowledgement/reply success paths already update local rows/settings. They do not blindly refetch the complete dashboard after every action.
- Supervisor Viva start/save/complete already return the updated workspace and patch local state. Requeue returns a refreshed list. A new client cache framework is not required to obtain that behavior.
- Templates are loaded on demand and reused for the current stage. Report HTML/CSV and supervisor PDF generation use already loaded data locally.
- Staff inbox reads and supervisor project lists are unpaginated in source. This is a growth concern, but the observed functional inboxes were empty or small. Do not silently add a hard limit: that would hide messages/projects and can break filters/exports. Measure a representative busy inbox before choosing pagination; preserve all-row export behavior if pagination becomes necessary.
- Authorization, portal/Viva locks, version checks, slot reservations, transactions, durable activity logging, storage reservations, signature checks and cleanup queues are required behavior. They are not waste merely because they add reads or writes.

## Storage calls and data sizes

Each new upload uses an application reservation call, a direct browser/client storage PUT, and an application finalization call. Finalization's actual server-side storage commands were **one HEAD, one ranged GET for signature validation, and one COPY** in each of the three PDF/student-audio/broadcast-audio/staff-audio trials. They are not three browser API calls. Direct PUT and final browser GET are additional storage requests.

Synthetic files were deliberately tiny: PDF 33 bytes, WebM-signature payload 8 bytes in functional storage scenarios. They validate authorization/protocol paths, not realistic PDF bandwidth or playable media. The server signature read is eight bytes. Copy transfers the object within storage; it does not download the complete file through the application. Signed read authorization returns a 307 and the client fetches the object directly.

Deleting audio or resetting a project with a PDF queued deletion work in MongoDB. The request did not immediately issue a storage DELETE. The independent cleanup worker's eventual costs are outside these per-dashboard counts; queued work must not be described as removed storage work.

Actual command evidence: [storage-commands.jsonl](.local-bench/dashboard-audit-2026-10-09/storage-commands.jsonl). Transfer outcomes and bytes: [storage-complete.jsonl](.local-bench/dashboard-audit-2026-10-09/storage-complete.jsonl). Query, write and transaction details are in [mongo.jsonl](.local-bench/dashboard-audit-2026-10-09/mongo.jsonl).

## Per-action measured database and payload inventory

All rows below have three samples. R/W are database read/write commands, G is cursor continuation, T is transaction commit/abort. Values are ranges when cache state or execution changes the count. Administrative collection/index creation is recorded separately in `summary.json`, not silently counted as an application write. No transient retry was forced, so these are observed counts rather than a worst-case upper bound. Record counts and database-reply JSON estimates are also in that summary.

The payload size is the endpoint JSON representation. Redirect/file bodies, browser-generated exports and storage object bytes are separate. Each row is one endpoint request, not the entire source-derived UI sequence above.

| Measured variant | HTTP | R | W | G | T | Request bytes | Response bytes | Median ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `read:student:/api/dashboard/student` | GET 200 | 9 | 0 | 0 | 0 | 0 | 1584 | 31.81 |
| `read:student:/api/supervisors` | GET 200 | 0–1 | 0 | 0 | 0 | 0 | 3892 | 16.47 |
| `read:student:/api/headline` | GET 200 | 0–1 | 0 | 0 | 0 | 0 | 17 | 13.08 |
| `read:student:/api/templates?stage=PROPOSAL` | GET 200 | 3 | 0 | 0 | 0 | 0 | 3053 | 19.07 |
| `read:student:/api/dashboard/student/message` | GET 200 | 3 | 0 | 0 | 0 | 0 | 16 | 18.51 |
| `read:student:/api/dashboard/viva-access` | GET 200 | 2 | 0 | 0 | 0 | 0 | 20 | 13.88 |
| `read:student:/api/registration-policy` | GET 200 | 0–1 | 0 | 0 | 0 | 0 | 600 | 11.10 |
| `read:student:/api/portal-status` | GET 200 | 0 | 0 | 0 | 0 | 0 | 111 | 12.75 |
| `read:supervisor:/api/dashboard/supervisor` | GET 200 | 4 | 0 | 0 | 0 | 0 | 4597 | 25.32 |
| `read:supervisor:/api/dashboard/messages` | GET 200 | 3 | 0 | 0 | 0 | 0 | 15 | 17.01 |
| `read:supervisor:/api/dashboard/supervisor/viva` | GET 200 | 3 | 0 | 0 | 0 | 0 | 15 | 14.40 |
| `read:examiner:/api/dashboard/supervisor/viva` | GET 200 | 7 | 0 | 0 | 0 | 0 | 1264 | 35.05 |
| `read:admin:/api/admin/students?page=1&limit=20` | GET 200 | 7 | 0 | 0 | 0 | 0 | 6166 | 35.26 |
| `read:admin:students-page2` | GET 200 | 7 | 0 | 0 | 0 | 0 | 6141 | 35.21 |
| `read:admin:/api/admin/students?page=1&limit=20&status=Pending` | GET 200 | 5 | 0 | 0 | 0 | 0 | 6165 | 60.52 |
| `read:admin:/api/admin/students?page=1&limit=20&search=HTTP` | GET 200 | 7 | 0 | 0 | 0 | 0 | 6166 | 30.49 |
| `read:admin:/api/admin/students?page=1&limit=20&search=NoMatch` | GET 200 | 6 | 0 | 0 | 0 | 0 | 150 | 27.24 |
| `read:admin:/api/admin/supervisors` | GET 200 | 3 | 0 | 0 | 0 | 0 | 6935 | 21.68 |
| `read:admin:/api/admin/summary` | GET 200 | 6 | 0 | 0 | 0 | 0 | 64 | 26.62 |
| `read:admin:/api/admin/reports` | GET 200 | 5 | 0 | 0 | 0 | 0 | 5983 | 55.34 |
| `read:admin:/api/admin/project-reviews` | GET 200 | 5 | 0 | 0 | 0 | 0 | 123 | 17.38 |
| `read:admin:/api/admin/fines` | GET 200 | 4 | 0 | 0 | 0 | 0 | 335 | 27.27 |
| `read:admin:/api/admin/fines?q=HTTP` | GET 200 | 3 | 0 | 0 | 0 | 0 | 42 | 21.94 |
| `read:admin:/api/admin/activity-logs?page=1` | GET 200 | 3 | 0 | 0 | 0 | 0 | 2762 | 22.05 |
| `read:admin:/api/admin/registration-policy` | GET 200 | 3 | 0 | 0 | 0 | 0 | 600 | 21.21 |
| `read:admin:/api/admin/project-ratings-export?round=proposal&projectIdea=0&technicalMerit=0&documentationQuality=0` | GET 200 | 3 | 0 | 0 | 0 | 0 | 64 | 19.22 |
| `read:admin:/api/admin/viva?catalogue=1` | GET 200 | 8 | 0 | 2 | 0 | 0 | 30688 | 57.36 |
| `read:admin:/api/admin/viva?catalogue=0` | GET 200 | 8 | 0 | 0 | 0 | 0 | 3633 | 31.40 |
| `read:admin:/api/dashboard/messages` | GET 200 | 3 | 0 | 0 | 0 | 0 | 15 | 20.19 |
| `action:student-name` | POST 200 | 3 | 2 | 0 | 0 | 54 | 98 | 28.94 |
| `action:student-academic` | POST 200 | 6–7 | 5 | 0 | 1 | 100 | 98 | 52.92 |
| `action:student-reset` | POST 200 | 3 | 2 | 0 | 1 | 25 | 137 | 26.11 |
| `action:student-leave` | POST 200 | 4 | 4 | 0 | 1 | 2 | 168 | 36.22 |
| `action:student-join` | POST 200 | 8 | 6 | 0 | 1 | 29 | 43 | 69.60 |
| `action:student-change-supervisor` | POST 200 | 7 | 5 | 0 | 1 | 103 | 110 | 67.55 |
| `action:student-assign-supervisor` | POST 200 | 5 | 3 | 0 | 1 | 103 | 60 | 32.73 |
| `action:admin-headline` | POST 200 | 2 | 3 | 0 | 0 | 29 | 44 | 28.55 |
| `action:admin-student-deactivate` | POST 200 | 2 | 2 | 0 | 0 | 57 | 54 | 22.66 |
| `action:admin-program` | POST 200 | 6 | 5 | 0 | 1 | 63 | 100 | 42.74 |
| `action:admin-batch` | POST 200 | 6 | 5 | 0 | 1 | 68 | 100 | 38.88 |
| `action:admin-promote` | POST 200 | 2 | 2 | 0 | 0 | 27 | 78 | 31.62 |
| `action:admin-email` | POST 200 | 3 | 2 | 0 | 0 | 79 | 163 | 27.12 |
| `action:admin-supervisor-slots` | POST 200 | 2 | 2 | 0 | 0 | 58 | 190 | 26.97 |
| `action:admin-supervisor-notifications` | POST 200 | 2 | 2 | 0 | 0 | 49 | 43 | 22.30 |
| `action:admin-supervisor-create` | POST 201 | 2 | 2 | 0 | 0 | 156 | 44 | 142.95 |
| `action:admin-supervisor-delete` | POST 200 | 2 | 3 | 0 | 1 | 33 | 45 | 29.12 |
| `action:admin-portal-pause` | PUT 200 | 2 | 1 | 0 | 0 | 43 | 43 | 23.71 |
| `action:admin-portal-resume` | PUT 200 | 2 | 1 | 0 | 0 | 28 | 111 | 16.35 |
| `action:admin-registration-save` | PUT 200 | 3 | 2 | 0 | 0 | 128 | 583 | 32.34 |
| `action:fine-clearAllFines` | PATCH 200 | 2 | 2 | 0 | 0 | 232 | 137 | 39.74 |
| `action:fine-eraseFineHistory` | PATCH 200 | 2 | 2 | 0 | 0 | 235 | 127 | 42.98 |
| `action:fine-setNewRegistrationFines` | PATCH 200 | 2 | 2 | 0 | 0 | 242 | 257 | 25.90 |
| `action:fine-pauseAccrual` | PATCH 200 | 3 | 2 | 0 | 0 | 231 | 249 | 24.79 |
| `action:fine-resumeAccrual` | PATCH 200 | 3 | 0 | 0 | 0 | 232 | 250 | 21.26 |
| `action:fine-updatePaymentDetails` | PATCH 200 | 2 | 2 | 0 | 0 | 239 | 151 | 26.31 |
| `action:fine-setFineRestriction` | PATCH 200 | 2 | 2 | 0 | 0 | 237 | 116 | 20.53 |
| `action:fine-clearRestriction` | PATCH 200 | 3 | 2 | 0 | 0 | 235 | 137 | 31.82 |
| `action:supervisor-expand` | POST 200 | 2–3 | 2 | 0 | 0 | 62 | 51 | 26.77 |
| `action:supervisor-remove` | POST 200 | 4 | 3 | 0 | 1 | 65 | 40 | 38.81 |
| `action:supervisor-migrate` | POST 200 | 5 | 4 | 0 | 1 | 91 | 88 | 43.96 |
| `action:supervisor-status` | POST 200 | 6 | 3 | 0 | 1 | 165 | 39 | 47.60 |
| `action:supervisor-broadcast-text` | POST 200 | 3 | 2 | 0 | 1 | 61 | 47 | 27.18 |
| `action:supervisor-broadcast-delete` | DELETE 200 | 4 | 1 | 0 | 1 | 2 | 32 | 38.85 |
| `action:student-message-text-admin` | POST 201 | 4 | 2 | 0 | 1 | 61 | 224 | 43.19 |
| `action:student-message-text-supervisor` | POST 201 | 6 | 2 | 0 | 1 | 66 | 259 | 44.57 |
| `action:message-status` | GET 200 | 3–4 | 0 | 0 | 0 | 0 | 226 | 14.59 |
| `action:message-ack` | PATCH 200 | 3 | 1 | 0 | 0 | 100 | 45 | 20.89 |
| `action:message-delete` | DELETE 200 | 3 | 2 | 0 | 1 | 61 | 16 | 33.95 |
| `action:viva-start` | POST 200 | 7 | 3 | 0 | 1 | 57 | 1296 | 46.50 |
| `action:restricted-dashboard` | GET 401 | 2 | 0 | 0 | 0 | 0 | 41 | 17.67 |
| `read:running-snapshot` | GET 200 | 4 | 0 | 0 | 0 | 0 | 1284 | 21.63 |
| `action:viva-grade` | POST 200 | 2 | 2 | 0 | 1 | 86 | 1306 | 29.36 |
| `action:viva-complete` | POST 200 | 2 | 3 | 0 | 1 | 72 | 1405 | 31.25 |
| `read:student-results` | GET 200 | 8 | 0 | 0 | 0 | 0 | 2929 | 29.94 |
| `action:viva-requeue` | POST 200 | 15 | 4 | 0 | 1 | 79 | 1264 | 57.43 |
| `action:round-create` | POST 201 | 5 | 2 | 0 | 1 | 362 | 555 | 31.24 |
| `action:round-update` | PUT 200 | 7 | 2 | 0 | 1 | 407 | 563 | 32.27 |
| `action:panels-generate` | POST 200 | 4 | 0 | 0 | 0 | 83 | 372 | 27.52 |
| `action:panels-save` | PATCH 200 | 5 | 6 | 0 | 1 | 409 | 636 | 38.63 |
| `action:schedule-preview` | POST 200 | 9 | 0 | 0 | 0 | 198 | 822 | 29.09 |
| `action:schedule-apply` | PATCH 201 | 9 | 6 | 0 | 1 | 751 | 954 | 49.19 |
| `action:round-confirm` | PATCH 200 | 7 | 3 | 0 | 1 | 63 | 585 | 43.48 |
| `action:round-delete` | DELETE 200 | 5 | 4 | 0 | 1 | 0 | 45 | 39.83 |
| `action:session-cancel` | PATCH 200 | 3 | 3 | 0 | 1 | 157 | 343 | 29.21 |
| `action:session-swap` | PATCH 200 | 21 | 3 | 0 | 1 | 192 | 641 | 65.54 |
| `action:admin-review` | POST 200 | 6 | 3 | 0 | 1 | 167 | 39 | 40.39 |
| `action:admin-progress` | POST 200 | 6 | 3 | 0 | 1 | 213 | 96 | 34.93 |
| `action:supervisor-review` | POST 200 | 6 | 3 | 0 | 1 | 167 | 39 | 37.77 |
| `action:supervisor-progress` | POST 200 | 6 | 3 | 0 | 1 | 213 | 96 | 38.42 |
| `action:supervisor-rating` | POST 200 | 3 | 1 | 0 | 0 | 186 | 187 | 18.15 |
| `action:submissions-close` | PATCH 200 | 2 | 2 | 0 | 0 | 32 | 93 | 27.28 |
| `action:submissions-open` | PATCH 200 | 2 | 2 | 0 | 0 | 31 | 73 | 26.64 |
| `read:student-no-project` | GET 200 | 6 | 0 | 0 | 0 | 0 | 894 | 17.97 |
| `read:student-fined` | GET 200 | 9 | 0 | 0 | 0 | 0 | 1962 | 21.38 |
| `read:fines-populated` | GET 200 | 5 | 0 | 0 | 0 | 0 | 617 | 34.88 |
| `action:student-email-request` | POST 503 | 2 | 0 | 0 | 0 | 102 | 58 | 16.69 |
| `action:pdf-reserve` | POST 200 | 9 | 3 | 0 | 1 | 129 | 628 | 54.75 |
| `action:pdf-submit` | POST 200 | 13 | 7 | 0 | 1 | 272 | 32 | 93.66 |
| `action:student-audio-reserve` | POST 200 | 6 | 3 | 0 | 1 | 133 | 694 | 39.83 |
| `action:student-audio-finalize` | POST 201 | 7 | 5 | 0 | 1 | 136 | 295 | 68.44 |
| `action:broadcast-audio-reserve` | POST 200 | 4 | 3 | 0 | 1 | 129 | 656 | 37.77 |
| `action:broadcast-audio-finalize` | POST 200 | 6 | 5 | 0 | 1 | 119 | 47 | 73.96 |
| `action:reply-audio-reserve` | POST 200 | 6 | 3 | 0 | 1 | 131 | 694 | 34.80 |
| `action:reply-audio-finalize` | POST 201 | 6 | 5 | 0 | 1 | 215 | 25 | 72.02 |
| `read:admin-inbox-populated` | GET 200 | 3 | 0 | 0 | 0 | 0 | 368 | 22.99 |
| `action:admin-ack` | PATCH 200 | 3 | 1 | 0 | 0 | 100 | 45 | 24.50 |
| `action:admin-text-reply` | POST 201 | 3 | 2 | 0 | 1 | 143 | 25 | 26.48 |
| `read:supervisor-inbox-populated` | GET 200 | 4 | 0 | 0 | 0 | 0 | 479 | 17.61 |
| `action:supervisor-ack` | PATCH 200 | 4 | 1 | 0 | 0 | 130 | 45 | 26.74 |
| `action:supervisor-text-reply` | POST 201 | 4 | 2 | 0 | 1 | 173 | 25 | 36.13 |
| `read:reviews-populated` | GET 200 | 6 | 0 | 0 | 0 | 0 | 14634 | 27.59 |
| `read:reviews-page2` | GET 200 | 6 | 0 | 0 | 0 | 0 | 4242 | 23.24 |
| `read:reviews-search-program` | GET 200 | 9 | 0 | 0 | 0 | 0 | 14634 | 45.86 |
| `read:students-program-batch` | GET 200 | 7 | 0 | 0 | 0 | 0 | 6166 | 44.81 |
| `read:students-unassigned` | GET 200 | 5 | 0 | 0 | 0 | 0 | 742 | 64.17 |
| `read:ratings-export-populated` | GET 200 | 4 | 0 | 0 | 0 | 0 | 705 | 20.34 |
| `action:student-audio-delete` | DELETE 200 | 9–10 | 3 | 0 | 1 | 61 | 16 | 65.24 |
| `action:broadcast-audio-delete` | DELETE 200 | 9 | 3 | 0 | 1 | 0 | 32 | 49.53 |
| `action:pdf-project-reset` | POST 200 | 9 | 3 | 0 | 1 | 25 | 138 | 51.74 |
| `read:unauthorized-file` | GET 404 | 3 | 0 | 0 | 0 | 0 | 42 | 15.27 |

## Priority and acceptance checks for future fixes

1. **Change the proven student sort index.** Same rows/cursor ordering, matching query plan, no duplicate equivalent index left behind.
2. **Delay unused admin/student catalogues and stop repeating student-page metadata.** Preserve badge meanings, initial/repeat navigation, filtered totals and capacity changes. Measure whole-dashboard calls/bytes, not only the endpoint changed.
3. **Run independent student refreshes together and avoid refreshing unrelated admin tables.** Verify errors, drafts, filtered rows and final visible state.
4. **Reduce the status/report join cost through measured, equivalent queries.** Check missing projects, inactive users, canonical memberships, counts and all report definitions before replacing the current joins.
5. **Reduce Viva catalogue/refetch/preview work where a populated fixture justifies it.** Preserve setup quotas, all selected teams, scheduled/live/snapshot behavior and refresh correctness.
6. **Trim unused fields last.** Confirm consumers and keep changes small. Do not introduce a new dependency, generic repository layer, event bus or caching framework for these tasks.

For any implemented fix, compare the same fixture and request sequence before/after. Record calls, bytes, database commands, documents/keys examined and median/p95 together. Keep a change only if functionality stays correct and its intended work actually falls. A lower HTTP or query count alone is insufficient.

## Research and alternatives

The installed Next.js 16.3.5 data-fetching guide was read from `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`. Server-component fetch memoization does not deduplicate these independent client-side requests and Mongoose calls automatically.

Primary references checked during this audit:

- [MongoDB Node driver command monitoring](https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/monitoring/) — measure actual commands rather than counting source query expressions.
- [MongoDB explain results](https://www.mongodb.com/docs/manual/reference/explain-results/) — separate returned records from examined documents/keys and inspect lookup stages.
- [MongoDB facet behavior](https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/) — shared aggregation can reduce duplicated processing, but a single command can still perform substantial work.
- [Playwright request sizes](https://playwright.dev/docs/api/class-request#request-sizes) — record request/response body and header sizes separately.
- [Mongoose lean queries](https://mongoosejs.com/docs/tutorials/lean.html) — lean avoids document hydration for read-only results; it does not reduce the JSON payload automatically and does not support document save behavior.

A larger connection pool, weaker password checks, Redis, a different ORM/database, a global client state library and a full backend rewrite are not supported fixes for the demonstrated problems. Native indexes, existing hooks and smaller fetch scopes address the clear cases with less maintenance. The best replacement for the expensive joins still needs an equivalence/performance experiment; this report does not pretend that research alone proves one.

## Limitations and unfinished verification

- Playwright request routing blocked external traffic and disabled the browser HTTP cache. These reload measurements therefore do not represent a normal warm browser asset cache; application/server caches remained active.

- Successful email request/delivery/confirmation is **blocked** by intentionally absent mail configuration. The measured valid request returned 503. No real email was sent.
- Backend mutations were executed through authenticated HTTP with disposable data. Their browser callback chains were traced, but every dialog/confirmation was not clicked end to end. Source-derived chain counts are labelled accordingly.
- Every possible browser-only clipboard/microphone interaction, local draft edge case and generated PDF/HTML/CSV content was not verified. Existing-file PDF resubmission and every activity-log page do not have distinct runtime scenarios. These remain explicit coverage gaps, not inferred successes.
- Empty, populated, inactive/fined/restricted, scheduled legacy and running/completed snapshot paths were included where listed. Every data corruption shape, transaction retry, browser range-request pattern and full-day workload was not tested.
- The synthetic dataset has timestamp ties that expose the missing `_id` sort index. The matching index is still appropriate for the route's specified ordering, but production execution plans and gains must be verified on deployment data.
- Thirty local samples per selected endpoint do not establish production capacity, a reliable p99 or a promised percentage improvement. No deployment-matched network, 50%-headroom load test, full-day soak or before/after application benchmark was part of this report-only audit.
- Source-only trim/growth findings are labelled. Some proposals deliberately remain conditional because no correct faster replacement has been demonstrated yet.
- The temporary transaction profiler originally filtered out commands sent to MongoDB's admin database. Canonical `complete:` runs corrected that filter and include commit/abort counts. Earlier `verified:`/`final:` runs are not the canonical transaction evidence.
- One supplemental command was initially blocked because automatic approval review hit a usage limit. It was later retried through normal approval and completed; that approval failure leaves no pending audit command.

## Cleanup and source integrity

Cleanup and source-hash verification results are recorded in [cleanup.json](.local-bench/dashboard-audit-2026-10-09/cleanup.json) and [source-integrity.json](.local-bench/dashboard-audit-2026-10-09/source-integrity.json). Cleanup succeeded: the disposable database and bucket are absent, 99 audit objects were deleted, three audit servers were stopped, and the temporary application copy was removed. All 405 tracked baseline files match their original hashes. Application source, authentication/password-reset code, dependency manifests and deployed services were not changed. Only `Findings.md` is intended as a tracked deliverable.

Suggested commit message: `docs: record dashboard performance audit and measured findings`

## Implementation and test progress — 9 October 2026

Scope approved: findings **1 and 4–8**. Findings 2–3 and 9–11 remain deferred. The audit above describes the original baseline; implementation status is tracked here separately.

| Finding | Status | Implementation / remaining verification |
| --- | --- | --- |
| 1 — Student sort index | Runtime check passed on disposable local data | The actual guarded script built `{ role, createdAt, _id }`, dropped `{ role, createdAt }`, and the scratch DB was removed. On 5,000 copied student rows, both first/cursor pages matched; explain examined 5,000 docs/keys before and 20 after. The canonical `fyp_local` index audit still reports this index missing (plus a pre-existing unrelated Viva index); no index was applied to `fyp_local`. |
| 4 — Lazy admin lists | Browser check passed | Admin Home made no student/supervisor list request; each list loaded when opened and Supervisors loaded once across a revisit. Returning Home refreshed summary. Student/supervisor badges matched summary totals (5,000/500); both list retry prompts recovered after injected 503 responses. |
| 5 — Student-page metadata | Browser check passed | Page 2 sent `metadata=0`, returned no global metadata, and retained batch options in the UI. |
| 6 — Lazy student supervisors | Browser check passed | Assigned student Home made no catalogue request. The change dialog recovered after an injected 503; retry loaded the catalogue and left the dialog usable. |
| 7 — Concurrent refreshes | Partially runtime checked | Student assignment could not be exercised: the seeded unassigned account login returned 401. Mutation, draft cleanup, parallel refresh timing, and post-save failures still need a working authenticated fixture. |
| 8 — Email refresh scope | Browser check passed on disposable clone | Student and supervisor email edits returned 200. The student row disappeared from its old email search; student edit made no supervisor-list request, and supervisor edit made no student-list request. The clone was dropped. An initial 401 was resolved by matching the local browser/server host. |

Validation: four focused API/navigation test files passed, including the metadata-query check. Lint, TypeScript, both index-script syntax checks, and `git diff --check` passed. A local Webpack production build compiled, passed TypeScript, generated all static pages, and completed successfully; only the test build temporarily used the system font instead of downloading the configured Google font.

Portal checks used Playwright against loopback. Admin Home skipped both management lists; opening each fetched it, student page 2 omitted global metadata while retaining batch options, and revisiting Supervisors did not refetch. For an assigned student, Home skipped the supervisor catalogue and the change dialog recovered from a simulated catalogue 503. Student and supervisor email edit callbacks passed on the scratch clone. The unassigned student account used for the assignment callback returned 401 at login, so that workflow remains unverified.

The local storage PUT/HEAD/GET/DELETE smoke test passed and removed its temporary object. The bucket returned to 1,000 objects. The disposable index and email databases were removed, the test portal was stopped, and canonical `fyp_local` counts remained 5,501 users, 2,500 projects and 500 sessions with a 69,000-byte storage ledger and 0 reserved bytes. No index was applied to canonical `fyp_local`.

One diagnostic browser run reached the application's configured Sentry endpoint; later browser runs blocked all non-loopback traffic. The rendered screenshot used the test-only system-font fallback, so font appearance was not assessed.


Implementation choices: reused the existing hooks, local component state and guarded index deployment script. No dependencies, cache framework or new endpoint were added. The default sort index follows [MongoDB's compound sort-index guidance](https://www.mongodb.com/docs/manual/tutorial/sort-results-with-indexes/); program/batch indexes remain unchanged pending evidence.

Remaining runtime checks:

- The isolated index migration and query-plan check passed. Before applying to canonical `fyp_local`, review its read-only audit: it also has one unrelated missing Viva index.
- Check empty/filtered admin pages and active/inactive badge behavior with a fixture containing inactive students. Badge totals and list-load retries already passed for the current all-active fixture.
- Use a working unassigned student fixture to verify assignment, draft cleanup, concurrent refreshes, and refresh failures. No whole-portal performance gain is certified yet.

Suggested implementation commit message: `perf: defer dashboard lists and reduce redundant refresh work`

## Remaining findings implementation — 9 October 2026

Findings **2–3 and 9–11** are now implemented in source. The audit measurements above remain the original baseline. A disposable local fixture run was completed after the requested model switch; the canonical local database was read-only and unchanged. The fixture results are recorded in the gitignored [remaining-findings-results.json](.local-bench/dashboard-audit-2026-10-09/remaining-findings-results.json).

| Finding | Implementation | Verification still required after the model switch |
| --- | --- | --- |
| 2 — Status-filtered students | Assigned statuses start from matching projects, group member IDs to avoid duplicate counts, apply student filters, and recheck each candidate through the canonical-project lookup. Unassigned retains the user-first lookup, including students with no project. | **Passed equivalence checks** for Pending, Approved, Unassigned, program/batch filters, exact-prefix search, first pages and cursor pages against the original user-first aggregation. Totals and returned rows matched on a 1,300-student/637-project disposable fixture with inactive users, no-project students and duplicate memberships. Nine HTTP samples per case; timings are fixture-only (median 78.94–210.67 ms). |
| 3 — Report selection | The endpoint accepts a validated `report` option; scoped reads retain summary cards and the selected report, omit unrelated detail facets, and skip canonical assignment joins for independent reports. The UI caches successful selections, cancels superseded reads, and clears cache on refresh. | **Passed:** all 11 scoped reports returned rows and summary totals equivalent to the full report on the populated fixture, including fines and duplicate memberships. Browser/API selector behavior beyond this comparison was not separately exercised. |
| 9 — Viva navigation | Setup loads the full catalogue once per mounted workspace; panel/schedule navigation reuses it. Operational reloads retain the catalogue; explicit setup reload fetches it again. | **Passed browser check:** admin dashboard made no eager student/supervisor list calls; opening Viva fetched once, and switching Panels/Schedule/Round setup did not add fetches. Broader setup/quota and mutation workflows remain untested. |
| 10 — Supervisor Home preview | Home requests `preview=1`; preview omits completed sessions and returns at most three entries with ID, phase, date and title while using existing live/snapshot validation. | **Passed:** preview contained one running snapshot session (152 bytes versus 2,566 bytes for the full two-session payload), preserved its snapshot title, and excluded the completed session. Supervisor browser Home rendered the title and fetched the preview (twice under development Strict Mode). |
| 11 — Student payload/read trimming | The supervisor response contains identity/contact fields; text/audio broadcasts remain in `supervisorBroadcast`. Narrow read projections preserve existing validation and transaction checks. | **Passed:** text and audio student dashboard payloads exposed no broadcast fields on the supervisor object and retained the broadcast payload separately. **Assignment mutation remains unresolved:** the student POST returned 401 despite a valid session and successful read-only student GET; no mutation was recorded. Submission/change-supervisor mutation paths and file upload/delete flows were not exercised. |

Storage smoke testing passed against the disposable MinIO bucket (PUT/GET/DELETE); a final bucket audit found zero objects, and the bucket was removed. Browser tests were confined to localhost. The dedicated scratch database and temporary portal copy were removed after testing; the original local database still has 5,501 users, 2,500 projects and 500 Viva sessions. Build and lint were not run, as requested. The assignment 401 is still to be investigated; it is reported as a test failure/limitation rather than a successful mutation check.

Implementation reuses the current routes, Mongoose pipelines, React hooks and native `Map`/`AbortController`; no dependency, global store or new endpoint was added. Narrowing the candidate set while retaining the canonical membership check avoids the incorrect totals of a naive reverse join. Retaining the setup catalogue preserves bulk quotas without introducing pagination state before its benefit has been measured. Query design follows [MongoDB aggregation optimization guidance](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/), and superseded report requests are cancelled following [React's guidance on fetch race conditions](https://react.dev/reference/react/useEffect).

Implementation checks: **29 focused checks passed** across the admin API/navigation, backend structure, report selector/export and new remaining-findings tests. TypeScript, changed-file ESLint and whitespace checks had been run before the user's instruction to begin testing. For this testing request, build and lint were not run. Local timing numbers are fixture measurements, not production performance claims.

Suggested commit message: `perf: scope dashboard reports and reuse viva data`

</details>

<a id="audit-2026-11-22"></a>

## Independent verification on the current portal — 22 November 2026

**Single-user findings.** A student editing a reviewed proposal could not save a description change with the existing PDF. On a fresh application process, opening Student Home triggered 43 collection and index setup commands for a database that was already prepared. Both occurred with one user. The five-user sign-in/dashboard smoke completed every request. The November 21 burst remains the evidence for actual connection timeouts.

### Problems in plain English, smallest fixes, and checks

| Priority | What went wrong | Smallest fix and how to tell it worked |
| --- | --- | --- |
| 1. Editing a proposal can force an unnecessary upload | A student uploaded a 65,552-byte PDF and saved it. The supervisor requested changes. The student sent a revised description with the current PDF, as the form promises. The server returned **404, “Upload reservation not found.”** The description and project version stayed unchanged. The form sends the permanent file key. The server looks it up as a temporary upload reservation. | For a text-only revision, use the existing submission logic in a transaction and keep the PDF already attached to the authenticated student's project. Verify the current key, membership, editable stage, review state, fines, policy and project version. A teammate can own the original upload. Keep the replacement-file path for a new file. Repeat the review/revision sequence and require the revised text, one version increment, the same PDF and zero storage operations. [Form](components/student/StudentProjectSubmissionSection.tsx) · [Submission handler](app/api/dashboard/student/route.ts) · [Upload finalization](lib/storageProtocol.ts) |
| 2. The first student request does database setup | A fresh server's first Student Home GET issued **33 createIndexes, 10 create and 10 find commands** during its 268 ms request. The fixture had already created the collections and indexes. Later GETs used 10 reads. A second fresh server using the same build and prepared fixture, with Mongoose automatic creation disabled for that process, issued **10 finds and zero setup commands** on first access (222 ms). These counts are attempts, including checks for existing indexes. | Create and verify collections and indexes in the release process, then set production connection options `autoCreate: false` and `autoIndex: false`. Extend the existing guarded index tooling to cover every model first, particularly uniqueness, partial and TTL indexes. Test both a blank database and an upgrade before switching. The acceptance measure is zero schema commands during serving. The two individual timings do not establish a latency percentage. [Connection](lib/mongodb.ts) · [Index audit](scripts/audit-refactor-indexes.mjs) · [Mongoose options](https://mongoosejs.com/docs/guide.html#autoIndex) |
| 3. A retry can send a file twice or record a submission twice | Each click with a selected file generates a fresh reservation key and uploads the whole file. Yet replaying the **identical save** with its original staging key returned 200 with the same project version and no new upload. That replay still issued an update to the activity log. The route ignores the finalizer's `finalizedNow` result. | Keep the staged key and exact submission inputs in the mounted form after the PUT. On an uncertain response reconcile the dashboard first, then allow an explicit retry of that same operation. Invalidate on file, project or input change, expiry or terminal cancellation. Record the submission activity only when finalization actually commits a new submission. Test a lost success response and an edited draft separately. Acceptance is one PUT, one project change, one activity entry and no false confirmation of edited inputs. [Form handler](components/student/hooks/useStudentProjectSubmission.ts) · [Upload client](components/student/api/studentDashboardApi.ts) · [Route](app/api/dashboard/student/route.ts) |
| 4. A temporary database shortage becomes a generic failure | The previous mixed burst logged checkout timeouts for all 81 failed Viva starts. The current checkout still has one pool of 10 per application process and a five-second wait for a connection. The Viva route handles expected participant conflicts, but its generic catch returns 500 for a driver checkout timeout. Authorization also runs outside that catch. The submission catch logs a fixed string, losing the failure category. | Handle the driver's specific wait-queue timeout around the whole affected request, including authorization. Return 503 for a known temporary capacity failure and log route, phase, elapsed checkout wait and outcome without credentials. For an uncertain commit, reconcile the result before repeating a mutation. Keep participant conflicts distinct. Test the mapping on both authorization and transaction paths. This improves recovery and diagnosis. Removing work in rows 2, 3 and 5 reduces demand on the same pool. [Viva route](app/api/dashboard/supervisor/viva/route.ts) · [MongoDB pool behavior](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/) |
| 5. Student Home fetches Viva details used only on another screen | On six assigned-student Home reads, the database did a result lookup, a schedule snapshot lookup and a fallback schedule lookup. They produced two empty arrays, costing just **35 decoded JSON bytes** but three database commands per refresh. Home separately checks whether a grade locks the project. Only the Viva workspace renders the two detail lists. | Add a scoped read to the existing authenticated student route. Request the overview on Home and fetch the lists on opening Viva. Retain the current full response for existing callers, the grade lock on Home, and the access restriction on both paths. Check empty, legacy scheduled and completed snapshot fixtures. This fixture should save three reads per Home refresh and show identical lists on entering Viva. [Dashboard queries](lib/features/student/dashboard.ts) · [Workspace consumer](components/dashboards/StudentDashboard.tsx) |
| 6. File verification makes two storage reads for the same object information | During a successful save the handler performed HEAD, an eight-byte range GET, and COPY. On the same object, the range GET alone returned HTTP 206, the correct signature, content type, matching ETag and `Content-Range: bytes 0-7/65552`. Its Content-Length was **8**, not the file size. | Validate total size from Content-Range, type, signature and ETag from that one bounded GET, then condition the existing copy on that ETag. Reject absent/inconsistent metadata and handle valid short files with their actual range end. Check PDF and both audio paths before rollout. Each successful verification then saves one sequential Class B request. [Verifier](lib/storageProtocol.ts) · [R2 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) · [GET response fields](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html) |
| 8. The portal fetches registration settings for screens that do not use them | A login through Student Home fetched the public registration policy. Focusing the signed-in student page fetched it again alongside portal status and Viva access. The policy response used 639 browser-reported body bytes. The root page passes this policy to registration and Admin. Student Home gets its own authorized policy fields. | Load and refresh the public registration policy when registration or Admin needs it. When entering registration, wait for current policy before enabling submission or loading supervisors. Keep portal-pause and Viva checks on focus. Verify zero public-policy requests on student login/focus and correct open/closed behavior when registering. [Page effect and consumers](app/page.tsx) |
| 9. Admin Home reads project documents just to count them | All four summary requests performed a collection scan for the exact project count. On the same data, the current count examined **9 documents**. Hinting the existing ID index examined **0 documents and 10 index keys**. Both counts were 9. | Use `Project.countDocuments({}).hint('_id_')` for the unfiltered total. Keep the separate review-queue filter. This uses the existing index and preserves an exact count. At nine projects both explain timings rounded to zero milliseconds. The gain demonstrated here is avoiding document reads. [Summary handler](app/api/admin/summary/route.ts) · [MongoDB count guidance](https://www.mongodb.com/docs/manual/reference/method/db.collection.countDocuments/) |
| 10. Changing a name reads the same account twice before updating | The successful profile POST touched MongoDB five times. Authentication already returned the student's name. The handler fetched it again solely to compare the submitted text, before the guarded update and activity write. | Reuse the name for the early comparison where normalization agrees, and keep role, cooldown and a stored-name difference predicate in the atomic update. On a no-match, distinguish a concurrent same-name change, cooldown and missing user. The normal success path should save one read. Retest the concurrent profile-update fixture and existing same-name behavior. [Authenticated fields](lib/security/auth.ts) · [Name change](app/api/dashboard/student/route.ts) |

### How much data moves together

In one fresh Brave sign-in through an assigned student's Home, **10 API responses** carried **4,588 body bytes and 8,169 response-header bytes** as reported by Playwright. There were two groups with a peak of **three overlapping API requests**. The opening session, portal-status and registration-policy responses carried 773 body bytes together. The post-login headline, Viva-access and student-dashboard responses carried **3,308 bytes** together (135 + 31 + 3,142). These sums describe the bodies of requests whose lifetimes overlapped. Static assets are outside those totals. The browser used request interception to block external traffic, which disables its HTTP cache.

The following measurements used authenticated HTTP with one caller. Response bytes are decoded HTTP body sizes. MongoDB operations are per-collection profiler records, including writes, excluding admin-database transaction commands and schema setup. DB reply bytes sum available profiler response lengths in the final sample, including command envelopes. MongoDB omits lengths on some write records, so these figures are partial for mutations. Timings are client elapsed times with profiling enabled.

| Action | Samples | Median ms | HTTP body B | Collection operations | Recorded DB reply B |
| --- | ---: | ---: | ---: | ---: | ---: |
| Assigned student Home | 6 | 40.0 | 1,887 | 10 | 4,920 |
| Change student name | 1 | 41.9 | 100 | 5 | 1,138 |
| Reserve PDF | 1 | 222.1 | 609 | 11 | 3,801 |
| Save PDF after direct PUT | 1 | 140.7 | 32 | 19 | 5,097 |
| Supervisor dashboard | 4 | 24.2 | 1,690 | 4–5 | 2,472 |
| Admin summary | 4 | 27.8 | 79 | 6 | 1,607 |
| Admin students, first page | 4 | 28.6 | 5,300 | 7 | 7,024 |
| Admin project reviews | 4 | 28.0 | 1,899 | 6 | 4,384 |
| Program report with summary | 4 | 27.1 | 315 | 5 | 2,732 |
| Admin Viva operational data | 4 | 35.1 | 2,859 | 8 | 4,754 |
| Admin Viva with setup catalogue | 4 | 29.7 | 4,026 | 8 | 6,330 |

The proposal's 65,552 file bytes went directly to the object store. The server logged 12 MongoDB commands for reservation and 20 for save, including transaction completion. The save spent 42 ms in MongoDB commands and 41 ms in storage SDK operations during 137 ms of server time. The 32-byte success response gives little indication of that work. The supervisor dashboard batched the team members in one query. The smaller Viva response was slower than the larger one in this sample, so the byte difference alone cannot establish a latency bottleneck.

### Why requests slow down and fail

**Fresh concurrency check.** On one warmed-up application process after launcher readiness, run order was 1, 5, 5, 1 virtual users. Each user signed in, verified the session, read the dashboard and checked the session again. All **60/60 HTTP requests** completed with successful checks. Per-run mixed-endpoint p95 was 266, 354, 296 and 150 ms respectively. The first run also loaded routes. There are too few observations for a capacity estimate. Across the five-user runs, median time in the server's password-verification phase was 202 ms, compared with the two single-user measurements of 158 and 152 ms. During the two five-user bursts, one-second samples showed Next at 194% and 135% CPU and MongoDB at 8% and 6% respectively (100% = one logical CPU). This launcher was unpinned. Password verification is necessary work and includes worker wait. The data supports reducing competing requests while preserving password verification strength.

**Burst failure evidence.** In the earlier mixed wave every object PUT reached storage, yet 57 proposal saves returned 500. All 81 Viva 500s had a MongoDB checkout timeout. The ten-connection pool was shared across work. Incoming requests could wait for a socket before their query even started. A separate historical unpaced prefill saw 47 save failures and 47 process-wide checkout timeouts. That strengthens the case for contention on saves but cannot assign a cause to each original failure. The 14 mixed-login 401s also remain unattributed. An expected Viva participant conflict is a business rejection and should be counted separately from overload. [November timings and faults](#faults-and-what-to-optimize)

**What helped under contention.** An earlier comparison build paced the clients to eight login flows and four upload/save flows in flight. The peak five-second checkout p95 fell from 3.930 s to 0.033 s and successful Viva-start p95 fell from 20.46 s to 1.61 s. Total mixed-wave completion was similar, 47.71 s unpaced vs 48.49 s paced. This establishes that arrival timing affected which users waited. It does not establish a safe global queue size on Vercel. That comparison included experimental 503 handling absent from the audited checkout. The existing shared-write queue serializes selected transactions per process. Password work, dashboard reads and Viva starts still share resources, while storage verification and promotion occur before commit admission. Avoiding needless queries, repeat uploads and cold-start setup addresses those costs without raising the pool ceiling. [Historical comparison](testing/reports/viva-overload-comparison.md) · [Shared queue](lib/transaction.ts) · [Finalizer](lib/storageProtocol.ts)

For these hosting tiers, reducing work before increasing concurrency matters. Atlas Free documents throughput and connection ceilings, and each warm function process can own a pool. The smoke host used more than one CPU core in the five-user bursts. The local storage test established which headers and operations the code needs. Internet latency, actual billed usage, production index state and sustainable hosted concurrency remain unmeasured. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) · [Vercel function limits](https://vercel.com/docs/functions/limitations) · [R2 operation pricing](https://developers.cloudflare.com/r2/pricing/)

### Reproduction and scope

- Tested source `d1d8a05`, Node 24.22.0. First ran `npm run test:load:portal -- smoke api` on the existing test build. Its three public requests succeeded. Every measurement above under **fresh** testing came from a separate Webpack production build of the current checkout, build ID `fs5J5n4IepoMcRhahfcvs`, using the local test font. The launcher used a fresh replica set, object store, mailbox, four libuv workers and synthetic accounts. The functional seed had 22 users, nine projects, three Viva sessions and one stored object before the launcher's extra admin. The workflow smoke additionally seeded the existing 500-account load fixture.
- The retained local probes and command logs live under the ignored `testing/reports/` directory. From the repository root run `bash testing/reports/audit22-launch.sh bash testing/reports/audit22-measure.sh` for per-request profiling, the count comparison, storage headers and Brave measurements. The probe tests F26-0012, E26-0001 and A26-0001 through their normal routes. [Probe](testing/reports/audit22.mjs) · [Measurements](testing/reports/audit22-evidence.log) · [Server timings](testing/reports/portal.Sx4JJ3/next.log)
- Run `bash testing/reports/audit22-launch.sh bash testing/reports/audit22-concurrency.sh` for four sequential k6 smoke runs. It seeds each actor once and runs the repository's `smoke workflow` scenario with `SMOKE_VUS` set to 1, 5, 5, then 1. Run `bash testing/reports/audit22-launch.sh node testing/reports/audit22-resubmit.mjs` for first submission, replay, supervisor review and existing-file revision (F26-0013 and E26-0001). The last probe intentionally asserts the current 404 and verifies project fields after it. [Concurrency sampler](testing/reports/metrics.9gFglI/processes.txt) · [Login phases](testing/reports/portal.IBAwDv/next.log) · [Revision results](testing/reports/audit22-resubmit.log)
- For the schema comparison, run `node testing/reports/audit22-cold.mjs` as the child command under `audit22-launch.sh` and then `audit22-schema-launch.sh` from the same directory of scripts, invoking the launchers from the repository root. Only the test server in the second launcher disables automatic collection/index creation. Match the first GET's timestamp and duration in the Next log to command names in the MongoDB log. [Baseline](testing/reports/portal.06aMNh/next.log) · [Control](testing/reports/portal.YsELXM/next.log) · [Test-only setting](testing/reports/audit22-schema-fixture.cjs)
- Coverage includes public reads, all three roles, real reads and updates, proposal upload/verification/review/replay, browser sign-in and focus. The older audits cover additional actions. This run used a small functional fixture, one Brave worker and at most five virtual users. High-load failures above come from the labeled historical runs. Hosted services, larger bursts and a full mutation-by-mutation regression suite were outside this run. The fixes are documented for implementation. Only the isolated schema settings, indexed count and range metadata alternatives were exercised directly.

<a id="backend-load"></a>

## Backend bottlenecks under load — 25 November follow-up

**The two fixes with direct server-side comparisons are limiting simultaneous password checks per process and coordinating project resets that write the same policy record.** Both comparisons used real authenticated requests and the same database rules. Upload completion and Viva start have additional bottlenecks with different failure signatures.

| Symptom | Measured cause | Smallest targeted change |
| --- | --- | --- |
| Sign-ins slow down and already signed-in users wait | On one pinned core, five credential callbacks submitted together had a median of 699 ms versus 160 ms in the sequential control wave. The previous 301-login run spent 23.71 s of its average 27.43 s authorization time in password verification including its wait. In a fresh alternating comparison, four sign-ins submitted their scrypt work before a fifth, already-authenticated user read the dashboard. With four hashes allowed to run together, the dashboard's first native key-derivation callback took 519–573 ms. With one hash admitted at a time it took 0.3–5.4 ms. The same dashboard GET fell from a median **665 ms to 63 ms**. | Bound the number of active scrypt verifications in the password helper. Use one active verification as the tested starting point for a single-core instance, with a bounded wait and a distinct temporary-busy result. Keep the hash parameters, account checks and rate limits. The four-login waves took 817–893 ms normally and 786–997 ms with admission. The demonstrated benefit is protecting other requests while completing the password work. [Password helper](lib/security/password.ts) · [Alternating trials](testing/reports/backend-hash.log) · [Native callback timings](testing/reports/portal.7MkV3h/next.log) |
| Viva starts return 500 under mixed load | The November 21 baseline recorded a MongoDB connection checkout timeout for **all 81 failed starts**. A successful fresh start used 11 commands including the participant locks, session update, audit and commit. Five disjoint panels started concurrently. A sixth overlapping panel correctly returned 400. In the retained large comparison, pacing competing logins and upload saves reduced peak interval checkout p95 from 3.930 s to 0.033 s and successful start p95 from 20.46 s to 1.61 s. Both comparisons reached all 50 eligible starts. | Limit incoming heavy work before it consumes the shared pool. Give upload saves a bounded per-process admission point before database preflight, and preserve the atomic participant locks. Handle a driver checkout timeout across the whole route, including authorization, as temporary overload. Changing the status to 503 alone recovers no capacity. The large pacing experiment used client limits, so a production admission width still needs a mixed-load comparison. [Pool configuration](lib/mongodb.ts) · [Viva start](lib/vivaSessionDashboard.ts) · [Large comparison](testing/reports/viva-overload-comparison.md) |
| A file reaches storage but its proposal fails or takes seconds to save | All 201 file PUTs succeeded in the original mixed wave. In a separate retained upload-only prefill, **each of the 47 failed saves** had completed six MongoDB commands and recorded zero storage calls during finalization. All 47 finished in the interval with 47 checkout timeouts. The fresh first-save trace puts the reservation read sixth and the ledger readiness read seventh. This localizes those failures to database preflight, with checkout for the ledger read the leading explanation. For successful replacements, five simultaneous saves spent a median **89–96 ms just waiting for the shared transaction**, versus about 0.1 ms sequentially. Each concurrent wave committed in one attempt per project. | Bound preflight concurrency independently of the existing one-at-a-time quota commit. An outer admission limit must use a separate permit to avoid waiting on itself. Preserve direct PUT, object verification, quota and atomic updates. To shorten the commit, profile the five sequential shared-file reference queries on replacements before changing their indexes or moving deletion work. Record preflight checkout, commit-queue wait and commit duration separately. The original 57 mixed failures lack individual error causes. [Prefill log](testing/reports/portal.sSfOBh/next.log) · [Storage finalizer](lib/storageProtocol.ts) · [Reference queries](lib/storageReferenceSafety.ts) |
| Dashboard project resets take longer when unrelated teams act together | Every reset increments the same registration-policy document inside its transaction. Across three waves of five teams, **15 successful resets required 46 transaction attempts**. All 31 write conflicts occurred on the policy update. A test-only control queued just the reset transactions before they began. The same 15 resets took 15 attempts, with median server response falling from **173 to 124 ms**, including queue time. | Coordinate reset transactions per process before opening them, retaining the in-transaction admin policy check. The experiment used a reset-only queue. Sharing an existing queue with file commits also introduces competition with uploads and needs a mixed test. MongoDB still enforces correctness across instances. For dashboard reads, the password comparison above identifies a separate delay before the database work. [Reset handler](app/api/dashboard/student/route.ts) · [Per-request transaction and conflict trace](testing/reports/portal.5pl8sa/next.log) |

**Reproduction.** From the repository root run `bash testing/reports/backend-launch.sh node testing/reports/backend-smoke.mjs`, then repeat with `testing/reports/backend-hash.mjs` as the child script. Both use the November 22 production test build, a fresh loopback replica set and object store, 80 synthetic students, 16 supervisors, four libuv workers, one pinned app core and at most five concurrent actors. The hash experiment alternated the two settings over eight waves. Its clock starts the dashboard probe after all four verifications have been submitted. The reset comparison uses different projects with no attached PDF. The upload comparison reserves and transfers 64 KiB before timing each save. All source changes used for admission comparisons were test-process instrumentation. Historical burst measurements used separate builds and are labeled above. [Launcher](testing/reports/backend-launch.sh) · [Isolation probes](testing/reports/backend-smoke.mjs) · [Timing instrumentation](testing/reports/backend-trace.cjs) · [Wave results](testing/reports/backend-smoke.log)

Production capacity, cross-instance contention and the causes of individual historical login 401s remain unverified. The measured effects apply to the specified local profiles.

### Backend changes applied, awaiting testing

Each server process now runs one password verification at a time, admits four proposal saves before their first database read, and runs one student project reset transaction at a time. These three limits have independent queues. Each queue holds up to 16 waiting requests for up to five seconds. A full queue or expired wait returns a temporary-busy error. The four-save limit and waiting limits are initial settings pending measurement. Password strength, direct file transfer, storage quota checks, and Viva participant locks are preserved.

Supervisor Viva reads and actions now return HTTP 503 when MongoDB times out waiting for a connection, including during authorization. This lets callers distinguish temporary overload from participant conflicts. The existing database connection ceiling still applies. This implementation has not been tested or measured.

### Local verification of the backend changes

Built the modified checkout with Webpack and the existing offline font fixture. Ran the portal on a single pinned CPU with a 1,536 MiB Node old-generation heap setting and its existing ten-connection MongoDB pool. The database was a disposable local replica set with a 256 MiB WiredTiger cache. Uploads went to a disposable local S3-compatible store and email went to a local mailbox. The heap setting approximates part of the Vercel Hobby memory budget. Atlas throughput throttling, deployed network latency and R2 monthly quotas were outside the simulation.

| Check | Result |
| --- | --- |
| Unit suite and production build | All 85 unit-test files passed after two route fixtures were updated to load the admission helper. Production compilation and TypeScript passed. |
| Public API smoke | Three requests succeeded. The reported p95 was 15.47 ms. |
| Five simultaneous sign-ins | Both waves succeeded. Each took 1.13–1.24 seconds to finish. A dashboard read sharing a wave with four sign-ins took 142–173 ms. Standalone dashboard reads took 30–306 ms. |
| Five simultaneous project resets | Ten resets across two waves succeeded. Each wave finished in 201–217 ms. |
| Proposal uploads and finalization | All 26 direct 64 KiB PUTs and saves succeeded across sequential, concurrent and mixed waves. The two five-save concurrent waves finished in 451–578 ms. |
| Mixed burst | A proposal save, sign-in, dashboard read, project reset and Viva start all succeeded in the same wave (393 ms total). |
| Viva participant rules | Four further disjoint Viva sessions started concurrently in 123 ms. An overlapping participant correctly received HTTP 400. No database checkout timeout or HTTP 503 was observed in the mixed probe. |
| Initial Brave and portal suite | Seven of eight passed, covering the browser launch, browser sign-in and sign-out, session isolation, profile update, PDF workflow, password recovery, announcements and Viva access. Registration timed out waiting for the form button. |

Reproduce the mixed run with `bash testing/reports/admission-launch.sh node testing/reports/admission-smoke.mjs` after building into `testing/reports/next-build`. [Mixed wave timings](testing/reports/admission-mixed.log) · [Portal logs](testing/reports/portal.w1EvRr/next.log) · [Browser suite](testing/reports/admission-browser.log) · [Build](testing/reports/admission-webpack.log)

The smoke profile exercised five simultaneous actors. The current measurements establish that these workflows completed together on this local setup. A matched before/after run and hosted capacity measurements are still pending.

The registration test passed on a fresh retry, including duplicate rejection. Separate five-user k6 runs completed every iteration for dashboard workflow (25 requests, 1,349 ms p95), upload (25 requests, 1,347 ms p95) and password recovery (50 requests, 902 ms p95). These percentiles combine the different requests in each workload. A focused regression check also verified HTTP 503 when a MongoDB checkout timeout occurs during Viva authorization or mutation. [Registration retry](testing/reports/admission-registration-retry.log) · [Dashboard workflow](testing/reports/admission-k6-workflow.log) · [Upload](testing/reports/admission-k6-upload.log) · [Password recovery](testing/reports/admission-k6-password.log)

### Matched old-versus-new portal benchmark

Ran the November 22 production build (`d1d8a05`, build `fs5J5n4IepoMcRhahfcvs`) and the updated production build (`OXiCP-m0gHYROhNEav9--`) in old, new, new, old order. Each run used the same five-user probe, one pinned portal CPU, a 1,536 MiB Node old-generation heap setting, a fresh local MongoDB replica set, and disposable local storage. The fixture contained 80 students, 16 supervisors, 40 projects, and six Viva sessions. These were loopback runs of the real production builds. A hosted preview wired to isolated local backends was unavailable.

| Client-observed median | Old | New | Samples per build |
| --- | ---: | ---: | ---: |
| Individual login during a five-login burst | 1,082 ms | 792 ms | 20 |
| Time for all five logins in a burst | 1,185 ms | 1,247 ms | 4 |
| Dashboard read with four logins in flight | 213 ms | 176 ms | 6 |
| Individual project reset during five simultaneous resets | 193 ms | 144 ms | 20 |
| Individual proposal save during five simultaneous saves | 341 ms | 370 ms | 20 |
| Time for all five saves in a burst | 450 ms | 469 ms | 4 |
| Five-action mixed wave | 463 ms | 451 ms | 2 |
| Viva start during the mixed wave | 296 ms | 300 ms | 2 |
| Individual Viva start with four starts in flight | 105 ms | 120 ms | 8 |

Typical sign-in, dashboard read during logins, and reset times improved by 27%, 17%, and 26% respectively. The full login burst took about 5% longer at the median and varied between runs. Proposal saves and standalone concurrent Viva starts were slower in this sample. Mixed-wave completion varied enough that the small median difference is inconclusive. Both builds completed every expected-success request and rejected the deliberately overlapping Viva start. No checkout timeout or HTTP 503 was recorded. The earlier large mixed burst produced failures at a different load level, so this smoke comparison establishes no change in failure rate under that heavier load.

Reproduction uses [the same probe](testing/reports/admission-smoke.mjs), [baseline launcher](testing/reports/admission-baseline-launch.sh), [updated launcher](testing/reports/admission-launch.sh), and [median calculation](testing/reports/admission-compare-summary.mjs). Raw runs are [old first](testing/reports/admission-compare-old1.log), [new first](testing/reports/admission-compare-new1.log), [new second](testing/reports/admission-compare-new2.log), and [old second](testing/reports/admission-compare-old2.log).
