# FYP Portal Installer: Implementation Plan and Milestone Tracker

## 1. Target and fixed decisions

Deliver this workflow:

**Download release → extract → run `sudo ./install` → complete browser wizard → portal available over HTTPS.**

This file is the implementation specification and single progress tracker. The current authorized work (2026-09-06) is limited to updating this document. Application, installer, infrastructure, and release implementation have not started.

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
| M00 | Baseline and deployment contract | In progress | None |
| M01 | Runtime configuration and SMTP | Not started | M00 |
| M02 | Generic object storage | Not started | M01 |
| M03 | University branding | Not started | M01 |
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

M00 is partially complete because the plan has been replaced and two baseline checks were run before work was narrowed to documentation. It is not marked Done. All subsequent milestones remain unstarted.

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
- [ ] Inventory runtime/build-time configuration, scheduled jobs, persistent state, and existing maintenance scripts.
- [ ] Record the current lint, unit-test, and build results.
- [ ] Define configuration ownership, installed directories, service boundaries, and supported platform.

**Done when:** Every installer input maps to an application or deployment setting; existing failures are documented; no application behavior changes.

**Validation record (2026-09-06):**

- `npm run lint`: exited 0, with 0 errors and 5 existing warnings in maintenance scripts.
- `npm run test:unit`: exited 1; 44 of 46 test-file entries passed. Failures were `tests/project-rating-ui.test.mjs` and `tests/storage-workflow-structure.test.mjs`. Causes have not been diagnosed.
- `npm run build`: not run; the user limited the task to `plan.md` before this check started.
- The lint and unit checks ran before the document edit. They are baseline observations, not evidence that any implementation milestone is complete.

**Blockers / remaining work:** Configuration inventory, deployment contract, build baseline, and investigation of the two existing test failures remain outstanding. Go, Docker, GitHub CLI, and Nix were not found on the current shell PATH; verify tool availability before milestones that require them.

**Completion date:** Not completed.

**Suggested commit:** `docs: define installer milestones and record baseline progress`

### M01: Runtime configuration and SMTP

**Implement**

- [ ] Centralize validated runtime configuration without requiring production secrets during image build.
- [ ] Add generic SMTP with explicit TLS modes, optional authentication, sender identity, and connection/test-email operations.
- [ ] Preserve Gmail configuration through a complete legacy fallback.
- [ ] Make developer-specific monitoring configuration optional.

**Done when:** Generic SMTP and legacy Gmail configurations work; malformed or incomplete settings fail clearly; secrets never appear in public responses or logs; tests cover email failure behavior.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `feat: add validated runtime configuration and SMTP support`


### M02: Generic object storage

**Implement**

- [ ] Replace R2-specific configuration with generic S3 configuration and explicit legacy fallback.
- [ ] Separate internal service access from the endpoint used for browser-signed URLs.
- [ ] Make storage quota configurable.
- [ ] Preserve existing object keys, authorization, reservations, accounting, and deletion workflows.

**Done when:** Upload, finalization, download, and deletion work against R2-compatible and local test storage; existing keys remain usable; storage regression tests pass.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

**Completion date:** Not completed.

**Suggested commit:** `refactor: support generic S3 storage and browser endpoints`


### M03: University branding

**Implement**

- [ ] Add persisted university name and primary/accent theme settings.
- [ ] Apply branding to shared portal UI, metadata, and email identity.
- [ ] Serve a persistent logo through a public read-only endpoint.
- [ ] Validate theme inputs and preserve existing default colors, dark mode, and readable text.
- [ ] Define the PNG validation contract for the installer.

**Done when:** Branding changes require no rebuild; settings survive application replacement; missing settings retain existing appearance; invalid values are rejected; representative student, supervisor, and administrator screens are visually verified.

**Validation record:** Not run; implementation has not started.

**Blockers / remaining work:** Prerequisite milestones are incomplete; reassess environment requirements when starting.

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
