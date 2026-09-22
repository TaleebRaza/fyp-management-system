# Security and Performance Remediation Plan

Date: 2026-09-21

## Outcome and scope

This plan is based on a review of 42 API route files exposing 60 handlers, authentication, MongoDB models and query shapes, Cloudflare R2 uploads, background jobs, monitoring configuration, client data loading, dependencies, and 41,913 lines of TypeScript/TSX/MJS under `app`, `components`, `lib`, `models`, `scripts`, and `tests`.

The working tree already contained unrelated edits. The audit did not modify those files. Invasive checks ran against an isolated copy under `/tmp` with `.git` and environment files excluded.

The findings below are ordered by the sequence in which they should be fixed. “Minimal fix” means the smallest safe containment, not necessarily the complete target design.

## Evidence collected

- Manual trust-boundary and data-flow review: login, role checks, CSRF/origin checks, upload authorization/finalization, cron authorization, email delivery, and dashboard queries.
- Authorization inventory: all 42 API route files and all 60 exported HTTP handlers were checked for handler-level authorization. Sensitive handlers generally re-check the live user in MongoDB, which is a strong existing control.
- Secret scan: no committed environment file, private key, cloud key, or database credential was found. `.env.local` exists but is ignored and was not read.
- Password attack: two distinct passwords sharing the same first 72 UTF-8 bytes both matched one bcrypt hash. `bcrypt.truncates()` confirmed truncation.
- Upload-signing attack: locally generated URLs showed that the current `PutObjectCommand` signs only `host`; adding `ContentLength` changes the signed headers to `content-length;host`.
- Dependency denial-of-service attack: the locked `nodemailer@7.0.13` parser took approximately 64 ms at 7 KB, 238 ms at 14 KB, 876 ms at 28 KB, 3.47 s at 56 KB, and 14.73 s at 112 KB. This is the expected quadratic growth. Current application email validation limits the reachable address to 254 characters, which substantially reduces immediate exploitability through known routes.
- Static checks: ESLint passed. TypeScript `tsc --noEmit` passed.
- Unit suite: 64 of 66 test files passed. Two source-shape tests are stale and fail for unrelated existing changes: the ratings test still expects “Download Excel” while the UI produces PDF, and the storage workflow test expects a removed `student.domains = []` assignment.
- Production build: not verified. Turbopack and webpack builds both failed because the sandbox prevented worker processes from binding a local port; neither failure was a project compilation error. TypeScript passed independently.
- MongoDB performance suite: not executed because the sandbox denied the local MongoDB connection. Existing database-backed performance tests therefore remain unverified in this audit.
- Full `npm audit`: not run because the environment denied sending the private dependency manifest to the npm registry. Direct production dependencies were checked against public maintainer advisories instead.

## Standards and engineering basis

The proposed decisions were rechecked against primary or maintainer-owned sources:

- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html) requires the full password to be verified, recommends allowing at least 64 characters, and requires throttling.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) prefers Argon2id, accepts scrypt as the next choice, and documents bcrypt’s 72-byte ceiling.
- [bcrypt.js security notes](https://github.com/dcodeIO/bcrypt.js/) explicitly state that inputs over 72 UTF-8 bytes are truncated and that callers must check `bcrypt.truncates()`.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) recommends login throttling while warning that account lockout can become a denial-of-service mechanism.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) requires server-side expiration/invalidation and reauthentication after high-risk events.
- [NextAuth v4 options](https://next-auth.js.org/configuration/options) document the default 30-day session/JWT age and warn that custom cookie handling can introduce security flaws.
- [Next.js Proxy guidance](https://nextjs.org/docs/app/getting-started/proxy) says Proxy is not intended for slow data fetching and that fetch cache options have no effect there. The [authentication guide](https://nextjs.org/docs/app/guides/authentication) recommends only optimistic cookie checks in Proxy.
- [Cloudflare R2 presigned URL guidance](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) states that upload URLs are bearer tokens and can be reused until expiry.
- [Cloudflare R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) confirms that `CopyObject` supports source `If-Match`, which allows promotion to bind the copy to the ETag that was verified.
- [MongoDB query optimization guidance](https://www.mongodb.com/docs/manual/core/query-optimization/) recommends projections, limits, query-selective indexes, and `explain()` verification rather than speculative indexing.
- [Nodemailer GHSA-v53p-9fqp-m79j](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j) marks versions through 10.0.5 as affected by a high-severity quadratic parser denial of service and fixes it in 10.0.6.

The senior-engineering rules applied here are deliberately plain: repair the trust boundary once, retain backward compatibility only for a bounded migration, prefer a standard-library primitive over another dependency, measure database plans before adding indexes, and delete misleading custom behavior once the supported framework configuration can express the policy.

## Priority summary

| Order | ID | Severity | Root issue |
| --- | --- | --- | --- |
| 1 | SEC-01 | High | Reusable, size-unbound presigned upload URLs leave stored objects mutable after finalization |
| 2 | SEC-03 | Medium | Passwords up to 128 characters are accepted but bcrypt verifies only the first 72 UTF-8 bytes |
| 3 | SEC-04 | Medium | Nominal browser sessions contain 30-day JWTs and depend on response-cookie rewriting |
| 4 | SEC-05 | Medium | Account-only fixed login lockout enables targeted denial of service and is not cleared by success |
| 5 | SEC-06 | High advisory, low current reachability | `nodemailer@7.0.13` contains known parser vulnerabilities, including proven quadratic behavior |
| 6 | SEC-07 | Medium, state-dependent | Legacy plaintext-password acceptance has no retirement boundary |
| 7 | SEC-08 | Medium | Edge monitoring sends default PII and samples all traces |
| 8 | PERF-01 | High | Proxy performs a recursive HTTP status fetch for nearly every non-admin API request |
| 9 | PERF-02 | Medium | Admin status filtering materializes an unbounded project/member set before pagination |
| 10 | OPS-01 | Medium | Correct indexes and migration-code uniqueness depend on a manual, undocumented deployment step |
| 11 | PERF-03 | Low | Every dashboard performs an unnecessary third-party quote request, sometimes twice |
| 12 | MAINT-01 | Medium | Stale tests and production dependencies reduce confidence and expand the deployment surface |
| 13 | SEC-09 | Low to medium | Request-size and trusted-client-IP assumptions are deployment-specific and not enforced in one place |

## 1. SEC-01: Presigned uploads are mutable and not size-bound

### Issue

`app/api/upload/route.ts` and `app/api/voice/upload/route.ts` accept a client-declared size but do not put `ContentLength` in `PutObjectCommand`. The resulting signature does not bind the body length. `lib/storageProtocol.ts` validates size, content type, and a short magic prefix only when the client later finalizes the upload.

The same object key is then stored as the durable proposal/audio key. R2 documents that a presigned URL can be reused until it expires. A client can therefore:

1. reserve a small object and upload a much larger body, consuming storage beyond the reservation ledger;
2. upload a valid object, finalize it, then reuse the still-valid URL to overwrite the finalized key;
3. skip finalization and leave oversized objects until the daily cleanup job reaches them.

This is a storage-cost and academic-record-integrity failure. Final verification does not make a still-authorized key immutable.

### Proposed solution

Use two keys and make promotion the trust boundary:

- Sign an exact `Content-Length` and `Content-Type` for a short-lived staging key.
- On finalize, verify length, type, file signature, and the reservation state.
- Capture the verified staging object’s ETag, then server-side copy it with `CopySourceIfMatch` to a new, unguessable final key that was never exposed in a write-capable URL. If the staging object changes between verification and copy, the copy must fail.
- Persist only the final key in project/message/broadcast records.
- Queue deletion of the staging key in the same durable cleanup protocol.
- Treat final keys as immutable. Replacements create a new final key and atomically switch the database reference.
- Add a concurrency test proving that overwriting the staging key after promotion cannot alter the referenced final object.

### Other solutions considered and not selected

- **Trust the declared size and verify later:** rejected because the untrusted upload happens before verification and can exceed the ledger.
- **Add only `ContentLength`:** useful containment, but the URL remains reusable and can overwrite the finalized object with a same-size body.
- **Wait for the URL to expire before finalizing:** rejected because it adds a 60–120 second user delay and still has a race at expiry.
- **Proxy every upload through the Next.js function:** gives full control, but the 4 MiB PDF ceiling is close to common serverless request limits and doubles application bandwidth. It remains a fallback if R2 copy semantics are unsuitable.
- **Presigned POST with `content-length-range`:** R2 does not currently support presigned POST form uploads.

### Most minimal safe fix

Immediately add `ContentLength: expectedBytes` to both `PutObjectCommand` instances, require the browser to send the exact `Content-Length`, reduce URL lifetime to the shortest usable duration, and test that different lengths fail signature validation. This closes the oversized-body path but must be labeled containment until staging-to-final promotion removes the overwrite window.

### Stale code to remove

- Assumptions that `reservation.key` is both a temporary upload target and a permanent immutable object.
- Response fields and tests that expose or persist the staging key as the final key.
- Comments claiming that a short expiry makes a URL “self-destruct”; expiry prevents future authorization but does not undo reuse before expiry.

### Performance effect

- Exact-length signing has negligible CPU or latency cost.
- Promotion adds one object-store copy and one staging deletion per accepted upload. Files are bounded to 4 MiB and 1 MiB, so this is a predictable cost.
- The change prevents potentially multi-gigabyte single-part uploads, ledger drift, cleanup pressure, and surprise storage charges.

## 2. SEC-03: bcrypt silently truncates accepted passwords

### Issue

`validatePassword()` accepts 10–128 JavaScript characters. bcrypt uses only the first 72 UTF-8 bytes. The local proof showed that two different accepted passwords with the same first 72 bytes authenticate as the same secret. Multibyte Unicode reaches the limit before 72 characters.

This violates the UI/API contract and NIST’s requirement to verify the entire password.

### Proposed solution

Use a versioned password-hash format and Node’s built-in asynchronous `crypto.scrypt` for new registrations and password changes. Keep bcrypt verification only for existing bcrypt rows; after a successful bcrypt login, rehash the supplied full password with scrypt and save the new versioned hash. Benchmark parameters on the deployed function and keep verification below the application’s latency budget while meeting OWASP’s memory-cost guidance as closely as the platform permits.

This is preferred over a new Argon2 package because scrypt is already in the Node standard library, avoids native-binary deployment risk, and is OWASP’s recommended fallback when Argon2id is unavailable.

### Other solutions considered and not selected

- **Keep bcrypt and accept only 72 characters:** safe if the limit is measured in bytes, but it prevents the advertised 128-character passphrases and gives Unicode users a shorter limit.
- **Pre-hash then bcrypt:** rejected because OWASP documents password-shucking and null/encoding pitfalls.
- **Add Argon2id now:** cryptographically preferred, but it adds a native dependency and deployment complexity. Reconsider only if a deployment-tested package is justified.

### Most minimal safe fix

Before every bcrypt hash or compare, reject values for which `bcrypt.truncates(password)` is true; update client/server copy to say “maximum 72 UTF-8 bytes”; add a regression test with multibyte characters and two equal-prefix passwords. This must land before any longer migration.

### Stale code to remove

- The 128-character promise while bcrypt is the only hasher.
- Direct `bcrypt.hash(..., 10)` calls spread across registration, supervisor creation, and legacy migration; route them through one password module.
- Comments calling the current verifier “smart” or “secure” without expressing the byte-length invariant.

### Performance effect

- The immediate truncation check is negligible.
- scrypt is intentionally more memory-intensive and may reduce authentication throughput. Benchmark and cap concurrent verification work; do not lower parameters without measurement.
- Opportunistic rehash adds one hash/write only on the first successful login of each legacy bcrypt account.

## 3. SEC-04: Session policy relies on cookie rewriting while JWTs default to 30 days

### Issue

The NextAuth session sets `strategy: "jwt"` but no `maxAge`, so the documented default is 30 days. `enforceBrowserSession()` strips `Expires` and `Max-Age`, but that changes cookie persistence, not the JWT’s server-verified expiry. Browser session restore can also restore session cookies.

`getCurrentUser()` checks active status and current role but does not compare the token with a server-controlled session version. This limits immediate revocation for high-risk account events.

### Proposed solution

- Set an explicit absolute session age appropriate for the portal, initially 8 hours unless product requirements justify another value.
- Add `sessionVersion` to the user. Put it in the JWT at login and compare it with the live user in `getCurrentUser()`.
- Atomically increment `sessionVersion` on admin deactivation, credential changes, and “sign out everywhere.”
- Use supported NextAuth cookie/session options and delete response-cookie rewriting.
- Add tests using a token issued before and after a version increment.

### Other solutions considered and not selected

- **Rely on closing the browser:** rejected because it is client behavior and does not revoke the token.
- **Use only a shorter JWT lifetime:** reduces exposure but does not immediately revoke a compromised session after a high-risk account event.
- **Move all sessions to a new database adapter:** provides revocation but is a larger schema and operational change than the live-user read already performed on every API request.

### Most minimal safe fix

Set `session.maxAge` explicitly and remove `Max-Age`/`Expires` rewriting. A numeric session version is the cleaner final design for immediate revocation.

### Stale code to remove

- `enforceBrowserSession()` and its “TRUE BROWSER SESSION” claims.
- The commented-out two-hour `maxAge` note.

### Performance effect

- Comparing a version or timestamp is free within the user lookup already performed.
- A shorter session increases login frequency slightly.
- No additional database query is required.

## 4. SEC-05: Login throttling can be weaponized against an account

### Issue

Five failed attempts block the account identifier for two hours. The counter is not cleared on successful login. There is no independent network/device dimension in the login flow, and the existing test explicitly enforces that absence. An attacker who knows a roll number can repeatedly deny that user access; four old failures plus one later failure can lock an account even after a successful login.

The user-facing message says one or two hours depending on the route while all `RateLimit` documents use the same two-hour TTL.

### Proposed solution

- Replace the generic TTL counter with an explicit login-attempt record containing window start, consecutive failures, and `lockedUntil`.
- Reset consecutive failures after a successful login.
- Use short exponential delays/lock periods for the account, plus a separately bounded trusted-IP dimension for broad spraying.
- Keep responses generic and record security telemetry without roll numbers or raw IPs.
- Define the proxy contract: on Vercel use the platform-overwritten forwarded address; when self-hosted, accept a client IP only from a trusted reverse proxy that strips incoming forwarding headers.

### Other solutions considered and not selected

- **IP-only throttling:** rejected because botnets and shared campus networks make it both bypassable and disruptive.
- **Permanent account lock after N failures:** rejected because it is an easy denial-of-service primitive.
- **CAPTCHA on every login:** rejected as accessibility/UX cost; it can be a later defense after suspicious thresholds.
- **Keep the current fixed two-hour TTL and refund one count:** rejected because partial refund preserves stale failures and does not fix targeted lockout.

### Most minimal safe fix

Delete/reset the account’s failed-login counter after successful authentication, align all messages with the real window, and shorten the fixed lock duration while the progressive model is implemented. Add tests for counter clearing after success, lock expiry, concurrent increments, and trusted-header behavior.

### Stale code to remove

- The test assertion that login must not use any additional rate-limit dimension.
- Generic `RateLimit` comments claiming the identifier is only email/IP when it stores multiple scoped keys.
- Hard-coded one-hour messages for a two-hour TTL.

### Performance effect

- Successful login adds one small delete/update, replacing the current two login-counter writes only if the monthly metric is retained.
- Exponential locks reduce bcrypt CPU under attack.
- Avoid adding Redis until MongoDB contention or cross-region latency is measured; the existing database can enforce this atomically at current scale.

## 5. SEC-06: Vulnerable Nodemailer version

### Issue

The lockfile resolves `nodemailer@7.0.13`. The maintainer advisory marks versions through 10.0.5 vulnerable to quadratic address parsing. The local benchmark reproduced the curve. Other 2026 Nodemailer advisories also affect old major versions.

Known application paths cap stored email addresses at 254 characters, so the demonstrated large-input denial of service is constrained. However, remaining on an affected release keeps vulnerable parser paths in production and future code may make them reachable.

### Proposed solution

- Upgrade to a patched Nodemailer release, currently at least 10.0.9 to include the September 12 follow-up fix, after reviewing its major-version migration notes.
- Upgrade `@types/nodemailer` consistently or remove it if Nodemailer’s bundled types cover the use.
- Tighten address validation to the application’s actual policy and reject comments, control characters, display-name syntax, and multiple recipients. The portal needs one mailbox, not the full RFC 5322 language.
- Keep `to`, `from`, and `replyTo` as separately validated mailbox values; never accept raw MIME or untrusted attachment URLs/paths.

### Other solutions considered and not selected

- **Rely only on the 254-character cap:** limits this PoC but does not remove other affected parser behavior.
- **Patch `node_modules`:** rejected because it is non-reproducible and disappears on install.
- **Replace email entirely:** unnecessary; upgrading the existing small integration is lower risk.

### Most minimal safe fix

Upgrade Nodemailer in a dedicated compatibility change and add one mailer test for the exact message shape. Until then, preserve the 254-character boundary and reject any email containing parentheses, quotes, commas, angle brackets, CR, or LF.

### Stale code to remove

- The separate `@types/nodemailer` package if the upgraded package supplies complete types.
- Any compatibility branch required only by Nodemailer 7 after the upgrade.

### Performance effect

- The patched parser restores linear behavior for adversarial strings.
- Normal transactional email performance should be unchanged.

## 6. SEC-07: Plaintext-password fallback has no retirement boundary

### Issue

`verifyPassword()` treats every non-bcrypt database value as a plaintext password and upgrades it only after a successful login. Any never-returning legacy account remains plaintext indefinitely, and malformed/corrupted hash values silently enter the plaintext path.

### Proposed solution

- Run a read-only census of password formats.
- In a controlled one-time migration, hash known plaintext rows into the selected versioned format, or expire them and require an administrator-issued credential change.
- After verifying that zero plaintext rows remain, remove direct string comparison and reject unknown hash prefixes.
- Record only counts during migration, never password values.

### Other solutions considered and not selected

- **Leave login-time migration forever:** rejected because dormant accounts never migrate and a corrupted hash becomes a plaintext credential.
- **Assume every unknown value is plaintext:** rejected because it fails open on malformed data.
- **Delete legacy accounts:** only acceptable if product owners confirm they are obsolete.

### Most minimal safe fix

Add a deployment metric/count for unknown password formats and an explicit temporary legacy-format marker. Reject unmarked unknown values. Set a removal date.

### Stale code to remove

- Plaintext comparison and the `isLegacy` branch after migration.
- “Backward-compatible” comments after the compatibility window closes.

### Performance effect

- Migrated accounts pay the normal password-hash verification cost rather than a cheap string comparison. That intentional cost improves offline-attack resistance.
- Removing the branch simplifies login and eliminates a database write on first post-migration login.

## 7. SEC-08: Edge monitoring enables default PII and 100% trace sampling

### Issue

`sentry.edge.config.ts` sets `sendDefaultPii: true` and `tracesSampleRate: 1`, while server and browser configs use `false` and `0.2`. The edge config also lacks the server’s cookie/authorization scrubbing. This creates inconsistent privacy behavior and avoidable telemetry volume on a request-wide boundary.

### Proposed solution

- Set `sendDefaultPii: false` everywhere.
- Apply one shared `beforeSend` scrubber for cookies, authorization credentials, signed storage URLs, email addresses, roll numbers, and request bodies.
- Use an environment-driven trace sampler with a low production baseline and 100% sampling only for explicitly selected diagnostics.
- Verify Sentry project-side IP storage settings as a second layer.

### Other solutions considered and not selected

- **Disable Sentry entirely:** rejected because actionable error telemetry is valuable.
- **Trust SDK defaults:** rejected because the current files already demonstrate divergent defaults.
- **Scrub only cookies and authorization:** insufficient for query strings and structured bodies containing signed URLs or identifiers.

### Most minimal safe fix

Change the edge config to `sendDefaultPii: false`, match the 0.2 sampler, and reuse the server header scrubber.

### Stale code to remove

- Contradictory “SECURE”/PII comments across the three configurations.
- Duplicate scrubber implementations after extracting one small shared function.

### Performance effect

- Reduces outbound telemetry, serialization work, and quota use.
- Scrubbing adds a small per-event cost, not a per-request cost when no event is sent.

## 8. PERF-01: Proxy creates an internal HTTP request for API requests

### Issue

`proxy.ts` calls `/api/portal-status` before almost every non-admin API request. That nested request executes routing and may connect to MongoDB, while the original handler still performs its own authentication and database work. Next.js explicitly says Proxy is not intended for slow data fetching and that fetch cache options do not work there.

On serverless infrastructure, in-memory caching is per warm instance, so the five-second module cache does not reliably remove the extra invocation. One external request can become two application requests.

### Proposed solution

- Keep Proxy limited to CSP headers and optimistic JWT/role routing.
- Move authoritative portal-pause enforcement into a shared server-side guard called by route handlers.
- Have `requireCurrentUser()` return a discriminated authorization result, including paused/restricted/unauthenticated, instead of collapsing every condition into `null`.
- Apply a small wrapper to public routes that must also honor pause. Exempt status, sign-in, and the admin control route explicitly.
- Continue the five-second single-flight database cache as an optimization inside the application process, not a correctness boundary.

### Other solutions considered and not selected

- **Connect to MongoDB directly from Proxy:** rejected by Next.js guidance and adds latency on the universal request boundary.
- **Keep the self-fetch but increase cache duration:** fetch caching has no effect in Proxy, and a longer per-instance cache delays pause changes.
- **Encode pause state in an unsigned client cookie:** rejected because the client could bypass it.
- **Add Redis solely for portal pause:** unnecessary until multi-region consistency requirements justify the service.

### Most minimal safe fix

Remove the Proxy self-fetch. Enforce pause in `requireCurrentUser()` for authenticated non-admin handlers and call the same guard directly in the few public handlers that should stop while paused.

### Stale code to remove

- `shouldEnforcePortalPause()` and its Proxy-only tests.
- The nested `/api/portal-status` fetch path.
- `cache: 'no-store'` on that Proxy fetch, which Next.js documents as ineffective there.

### Performance effect

- Removes one HTTP/function hop from nearly every non-admin API call.
- Reduces cold-start multiplication and duplicate status parsing.
- A direct cached guard may add a MongoDB read on a cache miss, but it replaces a whole nested request that performed the same read.

## 9. PERF-02: Admin status filtering is unbounded before pagination

### Issue

`app/api/admin/students/route.ts` loads all projects matching a status, materializes every member ID in Node, then applies a large `$in` or `$nin` to the student query before returning 20 rows. The work and response memory grow with the entire collection, not the requested page. MongoDB also warns that `$nin` is often non-selective.

Other important query indexes, including `projects.supervisorId`, live in `scripts/refactor-indexes.mjs` rather than the model and may or may not exist in a deployment.

### Proposed solution

- Capture `explain('executionStats')` for All, Approved, Pending, Unassigned, program, batch, and prefix-search cases against production-like cardinalities.
- Replace the two-query materialization with one bounded aggregation: start from students, `$lookup` the canonical project, derive status, apply status filters, sort, and cursor-limit within MongoDB.
- Return metadata/counts separately or cache slow-changing filter metadata; do not make every page request recompute all counts if measurements show they dominate.
- Add only the indexes demonstrated by explain plans. Verify `projects.supervisorId`, role/sort compounds, and cleanup indexes through the existing index audit.
- Set performance budgets for documents examined, response bytes, and p95 latency.

### Other solutions considered and not selected

- **Add an index without explain evidence:** rejected because indexes increase write cost and the existing deployment already has an index migration layer.
- **Denormalize project status onto User immediately:** rejected because the repository has already moved toward Project as canonical state; duplicating status reintroduces drift.
- **Load all students into the browser:** rejected because it moves the scaling problem and leaks more data.
- **Broad dashboard rewrite:** rejected; only the status-filter query is demonstrably unbounded.

### Most minimal safe fix

Add a hard cap and explicit failure/diagnostic when the intermediate project-member set exceeds a safe bound, then replace the path with a cursor-limited aggregation. Run `npm run indexes:refactor:audit` and record its output before proposing any new index.

### Stale code to remove

- The `statusProjects` full materialization and `statusProjectMemberIds` arrays.
- Page-number state that exists only to accompany cursor pagination, if the UI can use next/previous cursors directly.
- Any duplicate legacy user-side project/status fields discovered by `project:drift-audit`; do not preserve two sources of truth.

### Performance effect

- Work becomes proportional to the matching page and indexed lookup rather than all matching projects/members.
- `$lookup` has a cost, but it stays in the database and avoids large application allocations/network transfer.
- New indexes consume disk and add write amplification, so they must be justified by explain stats.

## 10. OPS-01: Index and migration-code guarantees are deployment-dependent

### Issue

The model does not declare `migrationCode` unique or index `Project.supervisorId`, while `scripts/refactor-indexes.mjs` defines both. Package scripts expose audit/apply commands, but README does not document running them. If the deployment step was missed, duplicate migration codes can route a migration to an arbitrary matching supervisor and common project reads can scan the collection.

This is an unverified deployment risk, not a confirmed production state because the audit had no database access.

### Proposed solution

- Make index application an explicit, idempotent deployment/migration stage with read-only audit first.
- Fail deployment health checks when required indexes are absent.
- Before adding the unique migration-code index, report and resolve duplicates deterministically.
- Keep one authoritative index manifest. Either declare owned indexes in schemas and use `syncIndexes` only in controlled migration tooling, or keep the manifest script and generate/assert schema documentation from it.

### Other solutions considered and not selected

- **Enable Mongoose automatic index builds in every production process:** rejected because builds can contend with live traffic and every instance may attempt them.
- **Assume the script was previously run:** rejected because there is no deployment evidence in the repository.
- **Validate uniqueness only in application code:** race-prone; the database must own the invariant.

### Most minimal safe fix

Run the existing read-only index audit against the deployment, document it in the release checklist, and block migration-code creation until the unique partial index is confirmed.

### Stale code to remove

- Duplicate index declarations between models and `refactor-indexes.mjs` after one source of truth is chosen.
- Error messages promising migration-code uniqueness when the database invariant is absent.

### Performance effect

- Correct indexes reduce collection scans for supervisor dashboards, migration lookup, and cleanup.
- Index builds and ongoing indexes cost disk, RAM, and write throughput; schedule builds and remove unused indexes based on `$indexStats`.

## 11. PERF-03: Dashboard quote adds third-party latency and privacy exposure

### Issue

Every dashboard mount requests `dummyjson.com`, and repeats the request when the quote ID matches the previous one. The feature is decorative, silently fails, sends user IP/metadata to an unrelated third party, and requires broad `connect-src https:` CSP permission.

### Proposed solution

Remove the network feature. If quotes are desired, ship a small local static list and select one locally per session.

### Other solutions considered and not selected

- **Server-side proxy/cache:** turns a decorative feature into owned infrastructure and another failure path.
- **Longer browser cache:** the endpoint is random and the feature still leaks requests to a third party.
- **Keep it because failure is hidden:** hidden failure still spends connection, battery, and privacy budget.

### Most minimal safe fix

Delete `DashboardQuote` from `DashboardShell`. No replacement is required.

### Stale code to remove

- `DashboardQuote.tsx`, `dashboardQuote.ts`, exports, tests, and the external domain allowance if no other HTTPS connection requires it.

### Performance effect

- Removes one or two DNS/TLS/HTTP requests per dashboard load and one client effect/state update.
- Slightly reduces the client bundle and eliminates third-party availability from dashboard rendering.

## 12. MAINT-01: Stale tests and unnecessary production dependency

### Issue

The unit command currently fails two stale source-shape tests. Structure-regex tests can report failure after a correct refactor and can also pass while behavior is broken. `repomix` is in production dependencies but has no runtime import. This expands production installation and supply-chain surface without application value.

The database-backed suites are skipped without an explicit local replica-set URI, so the normal `npm test` result does not prove transaction, index, or performance behavior.

### Proposed solution

- Fix or replace the two stale tests with behavior-level assertions.
- Make the default CI workflow visibly run unit, type-check, lint, build, and the required local-replica integration suites.
- Keep source-shape assertions only for a real architectural invariant that cannot be tested through behavior.
- Move `repomix` to `devDependencies`, or remove it if no maintained script/CI task uses it.
- Add a dependency advisory job in CI so checks run in an approved environment and do not depend on an interactive audit workstation’s egress policy.

### Other solutions considered and not selected

- **Delete all structure tests:** rejected because a few enforce useful boundaries; replace only brittle implementation assertions.
- **Treat skipped integration tests as passing:** rejected because they are the only checks for transactions and query plans.
- **Add another test framework:** unnecessary; Node’s built-in runner is already sufficient.

### Most minimal safe fix

Update the PDF label expectation, delete the obsolete `student.domains` assertion, and move/remove `repomix`. Then make `npm test` fail clearly when CI omits required integration configuration.

### Stale code to remove

- The two obsolete assertions.
- Unused `repomix` runtime installation.
- “NEW”, “OPTIMIZATION”, “ARCHITECT-AI”, and “replace entire file” comments that narrate change history instead of invariants.

### Performance effect

- No runtime regression.
- Smaller production install, fewer packages to scan, faster clean deployment, and less supply-chain exposure.
- Broader CI takes longer but prevents performance/security regressions from reaching production.

## 13. SEC-09: Request-size and client-IP trust are implicit

### Issue

Unauthenticated registration handlers parse JSON before applying rate limits. Application-level body limits are not explicit. The rate limiter trusts `x-vercel-forwarded-for`, then `x-real-ip`, and finally collapses every unknown client into one `unknown` bucket. This is safe only if the deployment overwrites forwarding headers exactly as assumed.

### Proposed solution

- Enforce small route-specific body limits at the reverse proxy/platform boundary and reject oversized `Content-Length` before parsing when present.
- Document the trusted proxy chain. Never trust a forwarding header sent directly by the public client.
- Fail closed or use a deployment-provided remote address when the trusted header is absent; do not globally group legitimate clients under `unknown` without an explicit policy.
- Hash IP-derived rate-limit keys as today and define retention.

### Other solutions considered and not selected

- **Read the whole body and check length afterward:** too late for memory/CPU protection.
- **Trust every common forwarding header:** allows spoofing outside the exact managed platform.
- **Reject all requests with no IP header:** can break local development and internal health checks; make the environment contract explicit instead.

### Most minimal safe fix

Add a shared `Content-Length` ceiling for the small JSON endpoints and accept only the Vercel-provided header in production. Add tests for spoofed `x-real-ip`, missing trusted headers, and oversized requests.

### Stale code to remove

- Generic `getTrustedClientIp()` fallback behavior once deployment-specific adapters exist.
- Duplicate route-level JSON error handling after a small shared boundary parser is adopted.

### Performance effect

- Rejects oversized requests before JSON allocation and database work.
- Header checks are negligible.

## Implementation order

### Phase 0: immediate containment

1. Bind R2 upload signatures to exact `Content-Length` and shorten expiry.
2. Reject bcrypt-truncated inputs everywhere.
3. Align Sentry edge privacy/sampling with server policy.
4. Reset failed-login state on successful authentication and align lockout messages.

### Phase 1: root security fixes

1. Implement immutable staging-to-final object promotion.
2. Add server-side session revocation and explicit session age; remove cookie surgery.
3. Introduce versioned scrypt hashes and migrate bcrypt/plaintext rows safely.
4. Upgrade Nodemailer and tighten the mailbox grammar.

### Phase 2: measured performance work

1. Remove the Proxy self-fetch and enforce pause inside handlers.
2. Run the existing index audit against the real deployment.
3. Capture explain plans and cardinalities for admin student filters.
4. Replace the unbounded status-member materialization with a bounded aggregation.
5. Run the 50-session Viva performance suite against a disposable local replica set and save p50/p95/query-count results.

### Phase 3: cleanup and confidence

1. Remove the external quote request.
2. Repair stale tests and require database integration checks in CI.
3. Remove/move `repomix` and retire migration-only code/comments.
4. Document the index migration, cron frequency, proxy trust, session policy, and dependency audit process.

## Definition of done

- A finalized object cannot be modified with any URL ever given to a client, and an upload larger than its reservation is rejected by storage before bytes are accepted.
- Every accepted password is verified in full; regression tests cover more than 72 bytes and Unicode.
- Login throttling resists both distributed guessing and targeted lockout; successful authentication clears stale failures.
- No deployed password row is plaintext or has an unknown hash format.
- The locked mail dependency is outside all known affected ranges used by the application.
- Sentry configurations share one tested PII scrubber and an intentional sampling policy.
- One external API call maps to one application handler for portal-pause enforcement.
- Admin status listing has a recorded explain plan, bounded documents examined, bounded intermediate memory, and a p95 budget.
- Required database indexes are audited during deployment and uniqueness is enforced by MongoDB.
- `npm run lint`, TypeScript, production build, unit tests, transaction tests, storage tests, and the performance suite all pass in CI with zero unexplained skips.
