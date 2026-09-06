# FYP Portal Installer: Implementation Plan and Milestone Tracker

## 1. Target and fixed decisions

Deliver this workflow:

**Download release → extract → run `sudo ./install` → complete browser wizard → portal available over HTTPS.**

This file is the implementation specification and single progress tracker. The current authorized work (2026-09-06) is M02 only. Installer, infrastructure, and release implementation have not started.

V1 decisions:

- Ubuntu 24.04 LTS, x86_64, internet-connected server.
- Installer installs Docker Engine and Compose when missing.
- Compiled Go installer with an embedded browser wizard accessed through an SSH tunnel.
- Next.js standalone application, Docker Compose, and Caddy.
- Local authenticated MongoDB replica set or external transaction-capable MongoDB.
- Local SeaweedFS object storage or external S3-compatible storage.
- Public GitHub release assets and GHCR application images.
- IT initiates updates; maintenance is allowed.
- Offline installation, database/storage migration tools, high availability, and broad academic-settings changes are deferred.

The wizard collects domain, database choice, storage choice, cleanup schedule/categories, university name, optional theme colors, required PNG logo, SMTP details, first administrator, and backup preferences.

Defaults:

| Setting | Default |
|---|---|
| Theme | Existing navy and amber palette |
| Logo | Required PNG, maximum 2 MiB and 2048×2048 pixels |
| Database/storage | Local |
| Required background processing | Every minute |
| Optional retention schedule | Daily at 02:00 in the selected timezone |
| Played project voice notes | Delete after seven days |
| Unplayed notes and broadcasts | Age-based deletion disabled |
| Unused PDF cleanup | Enabled, seven-day grace period |
| Attached PDFs | Preserved regardless of age |
| Backups | Manual and mandatory before updates; scheduled backups optional |

Existing installations retain their current behavior until explicitly configured or migrated. New-install defaults must not silently change retention on an existing database.

## 2. Progress tracking and milestone rules

Maintain this single tracker:

| ID | Milestone | Status | Depends on |
|---|---|---|---|
| M00 | Baseline and deployment contract | Done | None |
| M01 | Runtime configuration and SMTP | Done | M00 |
| M02 | Generic object storage | Done | M01 |
| M03 | University branding | In progress | M01 |
| M04 | Application container and MongoDB | Not started | M02, M03 |
| M05 | Local storage and HTTPS gateway | Not started | M04 |
| M06 | Operations CLI and secure bootstrap | Not started | M05 |
| M07 | Background processing and retention | Not started | M06 |
| M08 | Maintenance, backup, and restore | Not started | M07 |
| M09 | Resumable installation engine | Not started | M08 |
| M10 | Browser installation wizard | Not started | M09 |
| M11 | Release packaging and publishing | Not started | M10 |
| M12 | Updates and failure recovery | Not started | M11 |
| M13 | Clean-server acceptance and handoff | Not started | M12 |

M00 through M02 are complete. M03 implementation is complete and awaiting the plan-required visual verification. M00 records the current application baseline and the deployment contract that later milestones must follow. M04 and later milestones remain unstarted.

Use four statuses: **Not started, In progress, Blocked, Done**.

Each milestone records:

- Implementation checklist.
- Validation commands and actual results.
- Remaining blockers.
- Completion date and suggested commit message.
- Actual commit reference only when a commit exists.

A milestone is **Done** only when its implementation, relevant tests, documentation, and final diff review are complete. Missing validation keeps the milestone incomplete.

Implement milestones in order, keeping each change cohesive and independently reviewable. Do not combine unfinished milestones into a broad rewrite. Milestone boundaries are checkpoints, not automatic requests for renewed permission. Follow the user's currently authorized scope; this document does not authorize continuing beyond a request limited to documentation or a named milestone.

After every response involving file changes, include a suggested commit message. Do not create commits automatically.

## 3. Milestones and definitions of done

### M00: Baseline and deployment contract

**Implement**

- [x] Replace the existing plan and initialize the tracker.
- [x] Inventory runtime/build-time configuration, scheduled jobs, persistent state, and existing maintenance scripts.
- [x] Record the current lint, unit-test, and build results.
- [x] Define configuration ownership, installed directories, service boundaries, and supported platform.

**Baseline inventory and deployment contract (2026-09-06):**

Current deployment is a Vercel-configured Next.js application. There are no Docker, Compose, Caddy, systemd, installer, release, or persistent-local-volume artifacts in the repository yet.

**Runtime and build configuration**

| Setting | Current owner and consumer | V1 ownership |
|---|---|---|
| `MONGODB_URI` | Runtime environment, `lib/mongodb.ts`; also maintenance scripts | Root-owned deployment secret, validated in M01. |
| `NEXTAUTH_SECRET` | Runtime environment, NextAuth and auth middleware | Root-owned deployment secret, validated in M01. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Runtime environment, `lib/s3-client.ts` and storage audit | Replaced by generic S3 configuration in M02, with this legacy R2 shape retained as a fallback. |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` | Runtime environment, Gmail-only `lib/mailer.ts` | Migrated to generic SMTP plus the complete Gmail fallback in M01. |
| `CRON_SECRET` | Runtime environment, both authenticated cron routes | Root-owned deployment secret. M07 moves scheduling to systemd timers. |
| `CI`, `NODE_ENV`, `NEXT_RUNTIME` | Build/framework owned | Not installer inputs. |
| Sentry DSN and Next/Sentry options | Source and build configuration | Monitoring remains optional and must not be required for a production image. |
| Capacity, voice limits, late-registration policy, programs, project domains, ratings | Source under `config/` | Existing code-owned settings remain unchanged. Only the scoped university/retention settings become installer-managed in later milestones. |

The only tracked scheduler configuration is `vercel.json`, which calls `GET /api/cron/voice-cleanup` daily at `00:00` (UTC). The current route deletes voice notes after 24 hours or 10 minutes after playback, supervisor audio broadcasts after 72 hours, expires upload reservations, processes storage-deletion work, and dispatches the email outbox. `GET /api/cron/storage-cleanup` exists but is not scheduled by `vercel.json`; it expires reservations and processes storage deletion work. Both require `Authorization: Bearer <CRON_SECRET>`.

MongoDB is the persistent source of truth for users, projects, voice notes, registration policy, system configuration, activity logs, rate limits, roll-number claims, upload reservations, storage-deletion work, email outbox work, and voice-note quotas. PDFs and audio are persistent objects in the configured R2 bucket, referenced by object key in MongoDB. Browser draft data is local IndexedDB only and is not server-backed. Build output, Next caches, and in-memory MongoDB connection state are disposable.

Tracked maintenance commands are exposed through `package.json`: supervisor-capacity reconciliation, project-drift audit, storage-key and integrity audits, storage-ledger repair, refactor-index audit/apply, and rate-limit TTL update. They require `MONGODB_URI` (and the storage audit also requires the R2 settings); mutations require an explicit flag and confirmation environment variable. Six one-off migration/cleanup scripts are present locally but ignored by `.gitignore`; they are not release inputs and must not be relied on by the installer.

**V1 configuration, filesystem, and service contract**

The installer is supported only on an internet-connected, single-node Ubuntu 24.04 LTS x86_64 server. It installs Docker Engine and Compose when missing. Offline installation, HA, and other operating systems remain out of scope.

| Path | Owner and purpose |
|---|---|
| `/opt/fyp-portal/releases/<version>` | Root-owned, immutable extracted release and Compose definitions. |
| `/opt/fyp-portal/current` | Root-owned symlink to the active release. |
| `/etc/fyp-portal/portal.env` | Root-owned `0600` runtime secret/configuration file. It is the sole secret source for containers and `fypctl`; releases never contain secrets. |
| `/var/lib/fyp-portal/mongodb` | Docker-managed local MongoDB data when local database mode is selected. |
| `/var/lib/fyp-portal/seaweedfs` | Docker-managed local SeaweedFS data when local storage mode is selected. |
| `/var/lib/fyp-portal/branding` | Root-owned installer upload staging and branding-asset backup material. Live branding settings and logo bytes are persisted in MongoDB by M03. |
| `/var/lib/fyp-portal/backups` | Backup archives and manifests. |
| `/var/lib/fyp-portal/state` | Root-owned operation lock, resumable-install state, and non-secret version metadata. |

Later milestones must preserve these boundaries: Caddy is the sole public service (ports 80/443); the application is reachable only through Caddy on the Compose network; MongoDB and SeaweedFS have no published ports; `fypctl` and `install` run as root and access configuration/state without exposing secrets; external MongoDB and S3-compatible services are accessed only by the application and explicitly configured maintenance operations.

| Wizard input | Destination and owning milestone |
|---|---|
| Domain | Caddy site address and application public URL, M05. |
| Database choice | Local MongoDB volume or external transaction-capable `MONGODB_URI`, M04. |
| Storage choice | Local SeaweedFS or generic S3 configuration, M02 and M05. |
| Cleanup schedule and categories | Persisted retention policy and systemd timer configuration, M07. |
| University name, optional theme colors, required PNG logo | Persisted institution settings and branding asset, M03. |
| SMTP details | Validated mail configuration in the protected runtime configuration, M01. |
| First administrator | One-time transactional bootstrap input, never retained in configuration, M06. |
| Backup preferences | Persisted backup policy plus backup destination configuration, M08. |

**Done when:** Every installer input maps to an application or deployment setting; existing failures are documented; no application behavior changes.

**Validation record (2026-09-06):**

- `npm run lint`: exited 0 with no diagnostics.
- `npm run test:unit`: exited 1; 44 of 46 test-file entries passed. `tests/project-rating-ui.test.mjs` expects a `Download Excel` label, while the current export component says `Download PDF`. `tests/storage-workflow-structure.test.mjs` expects the academic reset code to clear legacy `student.domains`, while the current code creates a canonical project with `domains: []`. Neither mismatch was changed in M00.
- `npm run build`: initially exited 1 in the sandbox because Turbopack could not bind a local port (`Operation not permitted`). The same command was rerun outside the sandbox and exited 0: compilation, TypeScript, page data collection, and static generation completed successfully.
- These checks are baseline observations, not evidence that a later implementation milestone is complete.

**Blockers / remaining work:** The two unit-test expectation mismatches need an explicitly scoped decision before their affected feature areas change. Go, Docker, Docker Compose, GitHub CLI, and Nix were not found on the current shell PATH; verify tool availability before the milestones that require them. No M00 blocker remains.

**Completion date:** 2026-09-06.

**Suggested commit:** `docs: complete installer baseline and deployment contract`

### M01: Runtime configuration and SMTP

**Implement**

- [x] Centralize validated runtime configuration without requiring production secrets during image build.
- [x] Add generic SMTP with explicit TLS modes, optional authentication, sender identity, and connection/test-email operations.
- [x] Preserve Gmail configuration through a complete legacy fallback.
- [x] Make developer-specific monitoring configuration optional.

`lib/runtimeConfig.ts` now validates configuration only when the relevant database, authentication, storage, cron, or mail subsystem runs. This keeps `next build` independent of production secrets. `.env.example` defines the required settings, generic `SMTP_*` configuration, the legacy `EMAIL_*` Gmail fallback, and optional Sentry settings.

Generic SMTP requires host, port, explicit `none`, `starttls`, or `tls` mode, and a sender address. Authentication is optional, but a username and password must be supplied together. Generic and Gmail settings cannot be mixed. `verifyEmailConnection()` and `sendTestEmail()` are available from the mailer boundary for later installer/operations integration. Missing mail settings safely disable delivery; invalid partial settings fail without exposing values. Mongo connection failures, mail operations, and Sentry initialization do not log secrets. Sentry DSNs, project identifiers, and upload credentials are optional environment configuration rather than source values.

**Done when:** Generic SMTP and legacy Gmail configurations work; malformed or incomplete settings fail clearly; secrets never appear in public responses or logs; tests cover email failure behavior.

**Validation record (2026-09-06):**

- `node --test tests/runtime-config.test.mjs`: exited 0; covers MongoDB/auth validation, generic SMTP validation, Gmail fallback, configuration conflicts, and no-configuration mail failure behavior.
- `npx tsc --noEmit`: exited 0.
- `npm run lint`: exited 0 with 5 existing warnings in ignored one-off maintenance scripts.
- `npm run test:unit`: exited 1; 45 of 47 test-file entries passed. The only failures remain the M00 baseline mismatches in `tests/project-rating-ui.test.mjs` and `tests/storage-workflow-structure.test.mjs`; `tests/runtime-config.test.mjs` passed.
- `npm run build`: exited 0 outside the sandbox. The sandbox blocks Turbopack's local port binding.
- A live SMTP connection and test delivery were not run because no external mail server or recipient was authorized for this milestone.

**Blockers / remaining work:** No M01 blocker remains. The documented baseline unit-test mismatches are outside M01; M02 is the next milestone.

**Completion date:** 2026-09-06.

**Suggested commit:** `feat: add validated runtime configuration and SMTP support`


### M02: Generic object storage

**Implement**

- [x] Replace R2-specific configuration with generic S3 configuration and explicit legacy fallback.
- [x] Separate internal service access from the endpoint used for browser-signed URLs.
- [x] Make storage quota configurable.
- [x] Preserve existing object keys, authorization, reservations, accounting, and deletion workflows.

`S3_ENDPOINT`, `S3_BROWSER_ENDPOINT`, `S3_REGION`, credentials, bucket, and path-style mode now configure generic S3-compatible storage. The internal client uses `S3_ENDPOINT` for upload verification and cleanup; every browser upload/download URL is signed with `S3_BROWSER_ENDPOINT`. Generic and legacy R2 settings are mutually exclusive, and the complete legacy R2 group remains a fallback for existing deployments. `STORAGE_QUOTA_BYTES` is validated at runtime and defaults to the previous 9.5 GiB limit.

Existing object keys and the authorization, reservation, accounting, finalization, and deletion workflows remain unchanged. The storage integrity audit accepts the same generic settings. `.env.example` documents both configuration shapes and the browser-endpoint contract.

**Done when:** Upload, finalization, download, and deletion work against R2-compatible and local test storage; existing keys remain usable; storage regression tests pass.

**Validation record (2026-09-06):**

- `node --test tests/runtime-config.test.mjs tests/s3-client.test.mjs`: exited 0, 8 tests passed. The local S3-compatible test server performed PUT, HEAD, GET, and DELETE through the internal client; signed browser URLs used the separate public endpoint.
- `npx tsc --noEmit`: exited 0.
- `npm run lint`: exited 0 with five existing warnings in ignored one-off maintenance scripts.
- `npm run test:unit`: exited 1, with 155 of 157 tests passing. The only failures remain the M00 baseline mismatches in `tests/project-rating-ui.test.mjs` and `tests/storage-workflow-structure.test.mjs`; all storage tests, including the new generic S3 test, passed.
- `npm run build`: exited 0 outside the sandbox. The sandbox blocks the local port required by this build.

**Blockers / remaining work:** No M02 blocker remains. The documented baseline unit-test mismatches are outside M02; M03 is the next milestone.

**Completion date:** 2026-09-06.

**Suggested commit:** `refactor: support generic S3 storage and browser endpoints`


### M03: University branding

**Implement**

- [x] Add persisted university name and primary/accent theme settings.
- [x] Apply branding to shared portal UI, metadata, and email identity.
- [x] Serve a persistent logo through a public read-only endpoint.
- [x] Validate theme inputs and preserve existing default colors, dark mode, and readable text.
- [x] Define the PNG validation contract for the installer.

Branding is stored in the existing `SystemConfig` collection under the dedicated `branding` key, so it survives application replacement with the database. Missing or malformed stored values resolve to the existing University of Haripur, navy, amber, and `/logo.png` appearance. Administrator-only controls in the existing dashboard save the university name, colors, and optional logo through `PUT /api/admin/branding`; no new settings framework or dependency was added.

The public `GET /api/branding` response is cached for 60 seconds and exposes the resolved name, colors, contrast-safe foreground colors, and logo URL. `GET /api/branding/logo` is public and read-only, falls back to `/logo.png`, and streams only validated PNG bytes. Custom logo data is kept with the branding record so the app does not depend on a release-directory asset. The planned installer must create the same record and enforce the same contract: PNG content type and signature, at most 2 MiB, and width and height from 1 to 2048 pixels.

Root CSS variables carry configured colors through the existing light and dark palettes. Primary and accent foreground colors are selected from luminance, so configured colors remain legible. The shared dashboard shell, login, intro, public navigation, metadata, and outbound email sender/template identity use the resolved branding. The administrator control updates the current browser session immediately; server-rendered metadata and new requests pick up the persisted values without a rebuild.

**Done when:** Branding changes require no rebuild; settings survive application replacement; missing settings retain existing appearance; invalid values are rejected; representative student, supervisor, and administrator screens are visually verified.

**Validation record (2026-09-06):**

- `node --test tests/branding.test.mjs`: exited 0; covers default preservation, invalid values, contrast-safe serialization, malformed stored-value fallback, logo versioning, and PNG bounds.
- `npx tsc --noEmit`: exited 0.
- `npm run lint`: exited 0.
- `npm run test:unit`: exited 1; 46 of 49 test-file entries passed. `tests/project-rating-ui.test.mjs` and `tests/storage-workflow-structure.test.mjs` remain the documented M00 baseline expectation mismatches. The sandboxed `tests/s3-client.test.mjs` cannot complete its loopback server test, but `node --test tests/s3-client.test.mjs` exited 0 with host networking.
- `npm run build`: exited 0 with host networking, including the new branding routes. The sandbox blocks Turbopack local-port use during builds.
- Local endpoint checks confirmed the public logo endpoint falls back with a `307` redirect to `/logo.png` when no custom logo exists, and unauthenticated access to the administrator endpoint is redirected to the authentication flow without changing data.
- Visual verification could not run: the available browser-control runtime reported no connected browser. No representative student, supervisor, or administrator screenshots were taken.

**Blockers / remaining work:** M03 remains in progress solely because its definition of done requires visual verification of representative student, supervisor, and administrator screens. Re-run that inspection when a browser connection is available. M04 must not start until M03 is marked Done.

**Completion date:** Not completed.

**Suggested commit:** `feat: add persistent university branding`


### M04: Application container and MongoDB

**Implement**

- [ ] Add standalone output and a multi-stage application image.
- [ ] Package necessary maintenance/bootstrap commands in the runtime.
- [ ] Add Compose with authenticated local MongoDB, replica-set initialization, persistent volumes, and restart policies.
- [ ] Add liveness/readiness endpoints with appropriate middleware exclusions.
- [ ] Validate external MongoDB connectivity and transaction support.

**Done when:** A containerized portal starts from configuration alone; transaction commit/rollback tests pass; restart preserves data; readiness detects unavailable dependencies; database ports are not publicly exposed.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `deploy: containerize portal with authenticated MongoDB replica set`


### M05: Local storage and HTTPS gateway

**Implement**

- [ ] Add pinned SeaweedFS configuration, persistent metadata/object storage, credentials, and idempotent bucket initialization.
- [ ] Add Caddy-managed HTTPS and an internal gateway mode for an existing institutional proxy.
- [ ] Route the local bucket through `/fyp-uploads/*`, preserving signed host, path, and query.
- [ ] Validate external storage browser access and CORS.
- [ ] Keep storage management interfaces private.

**Done when:** Real browser PDF/audio uploads and downloads succeed through HTTPS in both proxy modes; unsigned private-object access fails; restart preserves files; the selected image versions and digests are recorded.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `deploy: add local object storage and HTTPS gateway`


### M06: Operations CLI and secure bootstrap

**Implement**

- [ ] Introduce the shared Go implementation for `install` and `fypctl`.
- [ ] Add `status`, `doctor`, `logs`, and `version`.
- [ ] Implement protected configuration files, operation locking, and atomic state writes.
- [ ] Add a private bootstrap command that transactionally creates institution settings and the first administrator.
- [ ] Make bootstrap safely repeatable without changing existing credentials or creating duplicates.

**Done when:** IT can inspect the installation without Docker commands; diagnostics redact secrets; concurrent operations are rejected; interrupted or repeated bootstrap cannot create duplicate administrators.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat(installer): add operations CLI and secure bootstrap`


### M07: Background processing and retention

**Implement**

- [ ] Separate essential email/reservation/deletion processing from optional content retention.
- [ ] Install systemd timers invoking authenticated internal application operations.
- [ ] Add persisted retention policies, schedule selection, preview, and execution reporting.
- [ ] Use bounded batches and existing transactional deletion/accounting mechanisms.
- [ ] Preserve attached PDFs, shared references, branding, templates, and active reservations.
- [ ] Keep student/admin acknowledgment distinct from project voice playback.

**Done when:** Required processing continues with retention disabled; boundary tests prove correct eligibility; concurrent runs cannot double-delete or corrupt accounting; failures appear in diagnostics.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat: add scheduled processing and configurable retention`


### M08: Maintenance, backup, and restore

**Implement**

- [ ] Add operational maintenance that blocks all application writes, including administrator writes.
- [ ] Keep the gateway serving a maintenance page and HTTP 503 responses.
- [ ] Quiesce background jobs and account for outstanding uploads before taking a consistent backup.
- [ ] Back up MongoDB, owned objects, branding, configuration, protected recovery secrets, version metadata, and checksums.
- [ ] Add backup retention and optional scheduling.
- [ ] Implement confirmed restore with compatibility and integrity checks.

**Done when:** A backup restores successfully into a separate clean environment; restored records and files match; failed backups are never marked complete; backup failure cannot delete the last usable recovery point; write-blocking tests pass.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat: add consistent backup restore and operational maintenance`


### M09: Resumable installation engine

**Implement**

- [ ] Check OS, architecture, privileges, resources, ports, DNS, connectivity, and existing installations.
- [ ] Install missing Docker components from the official Ubuntu repository without automatically removing conflicting installations.
- [ ] Generate secrets and deployment configuration.
- [ ] Orchestrate the completed deployment/bootstrap operations.
- [ ] Persist installation progress and resume after interruption.
- [ ] Keep existing data and credentials outside replaceable release assets.

**Done when:** A clean supported VM installs using the engine; injected failures resume safely; rerunning cannot erase data; errors identify the failed step and recovery action.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat(installer): add resumable installation engine`


### M10: Browser installation wizard

**Implement**

- [ ] Embed the wizard in the Go binary.
- [ ] Bind to loopback and print an SSH forwarding command and setup URL.
- [ ] Add short-lived setup authentication, session protection, and origin checks.
- [ ] Implement all requested forms, connection tests, PNG decoding/re-encoding, review, progress, and completion screens.
- [ ] Add `fypctl configure` to reopen protected configuration for supported settings.
- [ ] Reject database/storage destination changes that would require data migration.

**Done when:** IT completes installation without editing files; keyboard navigation and validation work; malformed PNGs fail; setup shuts down after completion; revisiting bootstrap cannot recreate an administrator.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat(installer): add protected browser setup wizard`


### M11: Release packaging and publishing

**Implement**

- [ ] Produce a versioned installer archive, signed release manifest, checksums, documentation, and third-party notices.
- [ ] Record exact image digests, platform, configuration version, permitted upgrade paths, migrations, and rollback compatibility.
- [ ] Build application image and installer from the same source commit.
- [ ] Add GitHub Actions to test, build, and prepare release artifacts.
- [ ] Publish installer assets to a public distribution repository and images to public GHCR, using narrowly scoped publisher credentials.
- [ ] Upload assets to a draft release before immutable publication.

**Done when:** A release candidate is reproducibly packaged; manifest verification and anonymous downloads work; no secrets or unintended source files are included; the downloaded archive installs successfully.

GitHub Releases supplies the downloadable installer assets; GHCR supplies the container images. GitHub's automatically generated source archive is not the installer. See [GitHub Releases documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [GHCR documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), and [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `release: package and publish signed installer releases`


### M12: Updates and failure recovery

**Implement**

- [ ] Add `fypctl update --check`, `update`, and compatibility-gated `rollback`.
- [ ] Discover compatible stable releases and verify signatures/digests before execution.
- [ ] Download while the current portal remains available.
- [ ] Enter maintenance, create a verified backup, run recorded migrations, replace affected services, and verify readiness.
- [ ] Persist update progress for crash recovery.
- [ ] Restore the previous application/configuration automatically only when the database remains compatible.
- [ ] Require explicit recovery for database restoration; never silently overwrite data.

**Done when:** Successful upgrade, corrupt download, incompatible release, failed migration, readiness failure, and process interruption are tested; configuration and branding survive; users recover after deployment without silent mutation replay.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat(installer): add verified updates and failure recovery`


### M13: Clean-server acceptance and handoff

**Implement**

- [ ] Exercise local/external database and storage combinations.
- [ ] Test clean installation, reboot, reconfiguration, backup/restore, update, and recovery.
- [ ] Verify public-port exposure, secret handling, setup shutdown, and unauthorized access.
- [ ] Complete installation, operations, troubleshooting, release publishing, and recovery documentation.
- [ ] Measure installation and maintenance durations.

**Done when:** A release downloaded onto a clean Ubuntu server completes the documented workflow; all acceptance checks pass; another person can operate and recover the portal using the documentation; the tracker contains evidence for every completed milestone.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `test: verify clean-server deployment and document university handoff`


## 4. Cross-cutting interfaces and release gate

The implementation adds these supported interfaces:

- Runtime configuration for SMTP, storage, domain, and deployment secrets.
- Persisted branding and retention settings.
- Public minimal liveness/readiness responses and a read-only logo endpoint.
- Private bootstrap and background-operation entry points.
- Versioned deployment state, installation/update journals, backup manifests, and signed release manifests.
- `fypctl` commands for diagnostics, configuration, jobs, backup/restore, and updates.

Validation follows the repository's established npm scripts, with targeted tests first and `npm run verify:refactor` at application milestone boundaries. Go changes receive Go tests; infrastructure changes receive real container/VM checks. Tests must use disposable databases and storage.

V1 is releasable only after M00–M13 are complete. Availability claims remain limited to the tested design: downloads happen while the portal is live, while backup, migration, and service replacement can require maintenance.
