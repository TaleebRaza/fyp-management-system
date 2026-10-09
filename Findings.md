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
