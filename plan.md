# FYP Management System — Self-Hosted Productization & Installer Plan

**Repository:** `https://github.com/TaleebRaza/fyp-management-system`  
**Plan purpose:** Turn the existing FYP Management System into a production-ready, self-hosted release that a university IT team can deploy with minimal technical steps.  
**Primary target:** Linux server, initially Ubuntu 24.04 LTS x86_64.  
**Development model:** Keep the application, deployment assets, installer, and operational CLI in the **same repository** until the product and release format are stable.  
**Last review basis:** Public `main` branch reviewed on 2026-09-06.

---

## 1. Target User Experience

The desired university IT installation experience is:

1. Download a versioned release such as `FYP-Portal-v1.0.0-linux-x64.zip`.
2. Extract it on the server.
3. Run one command:
   ```bash
   sudo ./install
   ```
4. The installer prints or opens a browser-based setup URL.
5. IT completes a guided installation wizard.
6. The installer validates the server, generates secrets, starts the services, initializes the database, configures storage, configures domain/HTTPS, creates the first administrator, configures backups, and performs health checks.
7. The final screen displays the live portal URL.

Target result:

```text
✓ Server prerequisites
✓ Database
✓ File storage
✓ FYP application
✓ Domain / reverse proxy
✓ HTTPS
✓ Email configuration
✓ Scheduled jobs
✓ Backups
✓ Initial administrator
✓ Health checks

FYP Management System is live:
https://fyp.example.edu
```

The production server must **not** require the university IT team to understand or manually configure Node.js, npm, Mongoose, MongoDB transactions, S3 SDK configuration, cron jobs, or Next.js internals.

---

# 2. Current Project Assessment

## 2.1 Overall rating

### As an FYP/student software project: **8.5 / 10**

Strengths include:

- Substantial role-based application rather than a basic CRUD project.
- Student, supervisor, and administrator workflows.
- Next.js/TypeScript architecture.
- MongoDB/Mongoose data layer.
- Authentication and authorization.
- File storage functionality.
- Storage quotas/accounting and integrity logic.
- File validation.
- Project lifecycle/state handling.
- Supervisor-capacity consistency logic.
- Rate limiting.
- Security headers/content-security-policy work.
- Portal maintenance/pause concepts.
- Audit/repair scripts.
- Unit tests.
- CI quality checks.
- Sentry integration.
- Email functionality.
- Scheduled cleanup functionality.

### As a university-deployable product today: **approximately 6 / 10**

The major gap is **productization and operations**, not application functionality.

The current project assumes too much infrastructure knowledge and contains deployment/provider-specific assumptions. The next phase should prioritize:

- configuration,
- containerization,
- installation,
- upgrades,
- backup,
- restore,
- diagnostics,
- portability,
- integration testing,
- operational documentation.

Do **not** prioritize adding unrelated application features until this plan is substantially complete.

---

# 3. Important Findings From the Repository Review

## 3.1 Current stack

At the time of review, `package.json` includes:

- Next.js 16.1.6
- React 19.2.3
- TypeScript
- Mongoose 9.2.4
- NextAuth 4.24.13
- Nodemailer
- AWS SDK S3 client
- Sentry
- bcryptjs
- unit/maintenance scripts

The repository already contains maintenance commands for items including:

- supervisor capacity reconciliation/repair,
- project drift audit,
- storage key audit,
- storage integrity audit/repair,
- index audit/apply,
- rate-limit TTL maintenance.

These scripts should eventually become part of installation validation, upgrade validation, diagnostics, and `fypctl`.

---

## 3.2 Next.js is not yet configured for standalone self-hosted output

`next.config.ts` does not currently contain:

```ts
output: "standalone"
```

This should be added so the application can produce a smaller production runtime suitable for a Docker image.

---

## 3.3 Institution-specific settings are compiled into source code

`config/appSettings.ts` currently contains values such as:

- maximum supervisor slots,
- late-registration enabled/disabled state,
- deadline date,
- timezone,
- daily fine amount,
- team-size defaults,
- university program codes/names.

Examples currently include values such as:

```text
MAX_SLOTS_PER_SUPERVISOR = 30
DEADLINE_DATE = 2026-07-13
TIME_ZONE = Asia/Karachi
FINE_PER_DAY = 10
```

and a fixed program list.

### Problem

These are not application constants. They are **institution configuration**.

A different university should not need to edit TypeScript and rebuild the application to change a program, deadline, timezone, fine, capacity, or academic setting.

### Required direction

Move institution-owned settings into database-backed configuration editable by authorized FYP administrators.

---

## 3.4 Storage is specifically coupled to Cloudflare R2

`lib/s3-client.ts` currently reads R2-specific values such as:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

and constructs the Cloudflare R2 endpoint itself.

The storage maximum is also connected to the current free-tier assumption.

### Problem

The university may want:

- local on-server object storage,
- another university storage server,
- AWS S3,
- Cloudflare R2,
- another S3-compatible service.

### Required direction

Make the application consume generic S3-compatible configuration:

```text
STORAGE_ENDPOINT
STORAGE_REGION
STORAGE_BUCKET
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_FORCE_PATH_STYLE
STORAGE_MAX_BYTES
```

Keep provider-specific presets in the installer, not in application business logic.

The existing storage accounting, validation, reservation, integrity, and cleanup logic should be preserved.

---

## 3.5 Email is Gmail-specific

`lib/mailer.ts` currently creates a Nodemailer transporter using:

```text
service: gmail
EMAIL_USER
EMAIL_APP_PASSWORD
```

### Problem

University IT will commonly provide a normal SMTP server.

### Required direction

Support generic SMTP:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
SMTP_FROM_NAME
SMTP_REPLY_TO
```

The installer should provide a **Test Email** button before continuing.

A Gmail preset can still be supported.

---

## 3.6 MongoDB transactions affect the deployment architecture

The application uses transactional workflows.

A standalone MongoDB server is not sufficient for MongoDB multi-document transactions.

### Required deployment default

Use a **single-node MongoDB replica set** for the normal one-server deployment.

Example:

```text
Replica set: rs0

rs0
└── mongo1
```

This satisfies the transaction requirement.

Important:

> A single-node replica set enables transaction functionality. It does not provide database high availability.

The installer should also allow an advanced external MongoDB option and validate that the supplied database supports transactions.

---

## 3.7 Scheduled work currently depends on hosting-specific behavior

Any Vercel cron/scheduled cleanup behavior must become part of the self-hosted package.

IT should not have to configure cron manually.

Scheduled work should run as a packaged service/container and be visible through diagnostics.

---

## 3.8 Backups must include more than MongoDB

The full system state consists of at least:

```text
MongoDB data
+
uploaded/object files
+
deployment configuration
+
secrets required for recovery
```

A MongoDB-only backup is incomplete.

A valid backup package should include:

```text
backup-YYYY-MM-DD-HHMM/
├── database/
├── objects/
├── config/
├── manifest.json
└── checksums.sha256
```

A backup is not considered reliable until an automated or documented restore test succeeds.

---

## 3.9 Existing maintenance mode is valuable

The existing portal pause/maintenance concepts should be reused for:

- backups when required,
- data migrations,
- database moves,
- storage migrations,
- upgrades,
- emergency maintenance.

---

## 3.10 Infrastructure changes are not simple environment-variable edits

Changing:

```text
MONGODB_URI=A
```

to:

```text
MONGODB_URI=B
```

does not migrate existing data.

Likewise, switching object storage does not move existing files.

The final product needs explicit migration workflows for these operations.

---

# 4. Recommended Final Architecture

```text
                                USERS
                                  │
                              HTTPS :443
                                  │
                         ┌────────▼────────┐
                         │      Caddy      │
                         │ TLS + proxy     │
                         └────────┬────────┘
                                  │
                        private Docker network
                                  │
              ┌───────────────────▼──────────────────┐
              │        FYP Portal / Next.js          │
              │         standalone runtime           │
              └──────────┬──────────────────┬─────────┘
                         │                  │
              ┌──────────▼──────┐   ┌───────▼────────────┐
              │    MongoDB      │   │ S3-compatible     │
              │ single-node     │   │ object storage    │
              │ replica set     │   │ local or external │
              └─────────────────┘   └────────────────────┘

              ┌─────────────────┐   ┌────────────────────┐
              │ Scheduler       │   │ Backup service     │
              │ maintenance     │   │ local + optional   │
              │ jobs            │   │ remote destination │
              └─────────────────┘   └────────────────────┘
```

Only the reverse proxy should normally expose public ports.

Database and object storage should be private to the Docker network unless an explicit advanced configuration requires otherwise.

---

# 5. Recommended Repository Strategy

## Use the existing repository

**Do not create a separate installer repository yet.**

The installer is tightly coupled to:

- application environment variables,
- application health checks,
- database initialization,
- version compatibility,
- storage configuration,
- upgrade migrations,
- release image tags.

Keeping everything together makes it much easier for an AI coding agent to understand and safely update both sides.

Create a feature branch:

```bash
git switch -c feat/self-hosted-installer
```

Recommended future repository structure:

```text
fyp-management-system/
│
├── app/
├── components/
├── config/
├── lib/
├── models/
├── public/
├── scripts/
├── tests/
│
├── deploy/
│   ├── compose.yml
│   ├── compose.dev.yml
│   ├── Caddyfile.template
│   ├── env.example
│   ├── mongo/
│   │   └── init-replica-set.sh
│   ├── backup/
│   └── scheduler/
│
├── installer/
│   ├── go.mod
│   ├── cmd/
│   │   ├── installer/
│   │   └── fypctl/
│   ├── internal/
│   └── web/
│
├── release/
│   └── scripts/
│
├── docs/
│   ├── INSTALL.md
│   ├── ADMIN.md
│   ├── BACKUP-RESTORE.md
│   ├── UPGRADE.md
│   └── TROUBLESHOOTING.md
│
├── Dockerfile
├── PLAN.md
└── ...
```

A separate installer repository can be considered later only if:

- the installer becomes useful for multiple products,
- releases need independent versioning,
- separate teams maintain it,
- or the main repository becomes operationally difficult to manage.

---

# 6. Configuration Ownership Model

Separate configuration into three categories.

## 6.1 Infrastructure configuration

Owned by university IT.

Examples:

```text
domain
MongoDB connection
database credentials
object-storage credentials
SMTP credentials
backup paths
reverse-proxy mode
TLS mode
application secrets
```

Store these in protected server files/secrets, not normal database documents.

---

## 6.2 Institution/application configuration

Owned by the FYP administrator/coordinator.

Examples:

```text
institution name
short name
logo
timezone
currency
programs
academic year
team-size rules
supervisor capacities
registration deadline
late-registration rules
fine policy
feature flags
```

Store these in MongoDB and edit them through the application's admin interface.

---

## 6.3 Deployment configuration

Owned by university IT.

Examples:

```text
installation directory
data directory
container image version
host ports
local vs external services
backup retention
secondary backup location
```

Managed by the installer and `fypctl`.

---

# 7. Local Developer Workstation Requirements

The exact commands depend on the operating system, but development should use Linux semantics because the university production server will most likely be Linux.

## Required

### 1. Git

Verify:

```bash
git --version
```

### 2. Node.js

Use a Node.js version supported by the current Next.js version. Next.js currently requires Node.js 20.9 or later.

Verify:

```bash
node --version
npm --version
```

### 3. Docker + Docker Compose

On Windows/macOS, the easiest development option is Docker Desktop.

Verify:

```bash
docker version
docker compose version
```

On a Linux production server, use Docker Engine and the Docker Compose plugin.

### 4. Go

Go is required to build the installer and `fypctl`.

Verify:

```bash
go version
```

### 5. VS Code

Continue using the current repository in VS Code.

Useful optional extensions:

- Docker
- Go
- ESLint
- GitHub Actions
- YAML

Do not make extensions a production dependency.

---

## Recommended for Windows

Use:

```text
Windows
+ WSL2
+ Ubuntu
+ Docker Desktop with WSL integration
+ VS Code Remote/WSL workflow
```

WSL can be installed from an administrator PowerShell with:

```powershell
wsl --install
```

After rebooting, open the repository from Ubuntu/WSL for the closest day-to-day experience to the Linux server.

For final acceptance testing, also use a **clean Ubuntu virtual machine**, not only Docker Desktop.

---

# 8. Rules for AI Agents Implementing This Plan

These rules are important.

## Work one milestone at a time

The AI must not attempt the complete installer in a single change.

For each milestone:

1. Read this `PLAN.md`.
2. Read the files relevant to the milestone.
3. Explain the intended change briefly.
4. Implement only that milestone.
5. Add or update tests.
6. Run the required verification.
7. Fix failures.
8. Summarize changed files.
9. Stop.

Do not automatically start the next milestone.

---

## Every milestone must preserve existing behavior unless explicitly changing it

Before a milestone:

```bash
npm run verify:refactor
```

or the closest currently valid project verification command.

After the milestone, run it again.

---

## Never put real secrets in Git

Forbidden:

```text
real MongoDB password
real SMTP password
real S3 key
NEXTAUTH_SECRET
CRON_SECRET
university production credentials
```

Use `.example` files containing dummy values.

---

## Pin production dependencies

Do not use floating production image tags such as:

```text
mongo:latest
caddy:latest
```

Use tested version tags.

Release builds must record the exact versions used.

---

## Prefer explicit health checks over sleeps

Bad:

```bash
sleep 30
```

Better:

```text
wait until Mongo responds
wait until replica set is primary
wait until object store responds
wait until /api/health/ready returns success
```

---

## Never silently destroy user data

Installer, restore, reset, migration, update, and uninstall code must use explicit destructive-operation safeguards.

---

# 9. Milestones

---

# Milestone 0 — Establish a Productization Baseline

## Goal

Create a safe starting point before deployment changes.

## Why

The installer project will touch application configuration, build behavior, infrastructure, and tests. A known-good baseline is required so failures can be attributed to new changes.

## Tasks

1. Create the branch:
   ```bash
   git switch -c feat/self-hosted-installer
   ```

2. Add this file to the repository root:
   ```text
   PLAN.md
   ```

3. Run:
   ```bash
   npm ci
   npm run lint
   npm run test:unit
   npm run build
   ```

4. Record any existing warnings/failures in:
   ```text
   docs/SELF-HOSTED-BASELINE.md
   ```

5. Record current required environment variables.

6. Search the repository for:
   ```text
   process.env
   R2_
   EMAIL_
   MONGODB_URI
   NEXTAUTH
   VERCEL
   CRON
   SENTRY
   ```

7. Create:
   ```text
   docs/CONFIG-INVENTORY.md
   ```

For each variable record:

```text
name
required/optional
secret/non-secret
runtime/build-time
owner: IT/admin/application
current usage files
planned replacement if applicable
```

## Verification

The project must behave exactly as before.

## Definition of done

- Baseline build status documented.
- Configuration inventory exists.
- No production behavior changed.
- Changes committed.

Suggested commit:

```text
docs: establish self-hosted productization baseline
```

---

# Milestone 1 — Define the Deployment Contract

## Goal

Define exactly what the application expects from its runtime before writing Docker or installer code.

## Why

Without a deployment contract, the installer and application will continually drift.

## Tasks

Create:

```text
docs/DEPLOYMENT-CONTRACT.md
```

Define:

### Application runtime inputs

Example:

```text
NODE_ENV
APP_BASE_URL
MONGODB_URI
NEXTAUTH_SECRET

SMTP_*

STORAGE_*

CRON_SECRET
SENTRY_*
```

### Application runtime outputs

- HTTP server port.
- health endpoints.
- expected persistent data locations.
- logs to stdout/stderr.
- exit behavior.

### External dependencies

- MongoDB replica set.
- S3-compatible object storage when storage is enabled.
- SMTP when email is enabled.

### Network model

```text
public:
80/443 -> Caddy

private:
Caddy -> app
app -> MongoDB
app -> object storage
scheduler -> app
backup -> database/object data
```

### File ownership

Define future host paths:

```text
/opt/fyp-portal
/etc/fyp-portal
/srv/fyp-portal
```

## Definition of done

Another developer can read the deployment contract and understand everything required to run the app without reading the installer code.

Suggested commit:

```text
docs: define self-hosted deployment contract
```

---

# Milestone 2 — Add Next.js Standalone Production Output

## Goal

Make the Next.js application produce a clean production runtime.

## Why

University production servers should not contain the complete development toolchain or run `npm install`.

## Implementation

Update `next.config.ts` to include:

```ts
output: "standalone"
```

Do not remove existing security/Sentry configuration.

Build:

```bash
npm run build
```

Confirm:

```text
.next/standalone/
.next/static/
public/
```

exist as expected.

Test the standalone server using the required environment variables.

## Tests

Existing lint, unit tests, and build must pass.

## Definition of done

The portal can start from the standalone build without using `next dev`.

Suggested commit:

```text
build: enable Next.js standalone output
```

---

# Milestone 3 — Containerize Only the Application

## Goal

Run the current FYP application in a production-style Docker container.

## Why

Before adding MongoDB, storage, proxy, or installer logic, prove the application image itself is reliable.

## Files

Create:

```text
Dockerfile
.dockerignore
```

## Dockerfile requirements

Use a multi-stage build:

```text
dependencies
builder
runtime
```

Runtime image requirements:

- production runtime only,
- non-root user,
- standalone Next.js output,
- copy `public`,
- copy `.next/static`,
- expose only the internal app port,
- no development dependencies,
- no source-control metadata,
- no secrets baked into image.

## Do not

- put `.env.local` inside the image,
- run as root unless technically unavoidable,
- install MongoDB in the same container.

## Test

Build:

```bash
docker build -t fyp-portal:dev .
```

Run with external current services/environment.

Verify:

```bash
curl http://localhost:3000
```

and login/basic application behavior.

## Definition of done

The application is reproducibly runnable as a container.

Suggested commit:

```text
build: add production application container
```

---

# Milestone 4 — Create the Docker Compose Skeleton

## Goal

Create the base orchestration definition.

## Why

Docker Compose will become the contract used by:

- development,
- installer,
- tests,
- production,
- upgrades.

## Files

Create:

```text
deploy/compose.yml
deploy/compose.dev.yml
deploy/env.example
```

Initially include:

```text
app
mongo
```

Do not add every service yet.

## MongoDB requirements

Configure MongoDB as a single-node replica set.

Use a persistent volume.

Do not publish MongoDB publicly by default.

Example conceptual command:

```text
mongod --replSet rs0 --bind_ip_all
```

Add a controlled initialization step which:

1. waits for MongoDB,
2. checks whether `rs0` is already initialized,
3. initializes only if necessary,
4. waits until a PRIMARY exists.

Make the initialization **idempotent**.

## App connection

Use a replica-set-aware MongoDB URI.

Do not store real credentials in Git.

## Test transaction support

Add a small test or script which:

1. connects to Mongo,
2. starts a session,
3. starts a transaction,
4. writes test data,
5. commits,
6. deletes the test data.

## Definition of done

```bash
docker compose -f deploy/compose.yml up -d
```

results in a working app + MongoDB replica-set environment.

Suggested commit:

```text
deploy: add compose app and Mongo replica set
```

---

# Milestone 5 — Create a Proper Institution Settings Model

## Goal

Remove institution-owned configuration from TypeScript constants.

## Why

A university must be able to configure its own portal without rebuilding the application.

## Files

Likely additions:

```text
models/InstitutionSettings.ts
lib/institutionSettings.ts
```

and admin APIs/UI.

## Suggested schema

```text
InstitutionSettings

institution:
  name
  shortName
  logoKey/logoUrl
  timezone
  currency

academic:
  currentAcademicYear

programs:
  - code
  - name
  - active

supervision:
  maxProjectsPerSupervisor

teams:
  defaultSize
  expandedSize
  allowedSizes

lateRegistration:
  enabled
  deadline
  finePerDay
  timezone

messaging:
  maxTextLength
  maxAudioSeconds
  maxAudioBytes
  maxVoiceNotesPerSender
```

Do not blindly move technical/security limits into editable settings. Decide which values genuinely belong to university admins.

## Migration strategy

1. Create defaults matching current behavior.
2. On first configuration, write the current values into MongoDB.
3. Replace direct reads of institution constants with a settings service.
4. Keep safe code defaults for bootstrap/failure behavior.
5. Add validation.
6. Add cache behavior if required.
7. Add invalidation after settings updates.

## Admin UI

Create an authorized settings screen.

Do not put infrastructure secrets on this screen.

## Tests

Test:

- missing settings -> safe defaults,
- valid settings,
- invalid settings rejected,
- program add/remove/deactivate,
- timezone handling,
- deadline handling,
- capacity changes.

## Definition of done

Changing a university program or FYP deadline no longer requires editing TypeScript/rebuilding the app.

Suggested commit:

```text
feat: move institution settings to database
```

---

# Milestone 6 — Generalize Email to SMTP

## Goal

Make email provider-independent.

## Why

University IT should be able to use institutional SMTP rather than Gmail.

## Replace

Current Gmail-specific assumptions.

## New environment contract

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
SMTP_FROM_NAME
SMTP_REPLY_TO
```

Allow authentication to be optional if a trusted internal relay requires it.

## Add

A server-side SMTP configuration validator/tester.

The installer will later call it.

Potential internal API behavior:

```text
connect
authenticate if configured
send one test email
return sanitized result
```

Never return SMTP passwords.

## Preserve

Current email call sites as much as practical.

Create one mail transport factory rather than provider logic spread across routes.

## Tests

- no SMTP configured,
- authenticated SMTP,
- non-auth relay configuration,
- secure/non-secure modes,
- invalid credentials handled cleanly.

## Definition of done

No normal mail code depends on Gmail-specific configuration.

Suggested commit:

```text
refactor: support provider-neutral SMTP
```

---

# Milestone 7 — Generalize S3-Compatible Storage

## Goal

Remove Cloudflare-specific configuration from the storage client.

## Why

The university needs local or external storage choice without source changes.

## New environment contract

```text
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=
STORAGE_REGION=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_FORCE_PATH_STYLE=true|false
STORAGE_MAX_BYTES=
```

Optional provider presets may exist in the installer:

```text
Local S3-compatible
Cloudflare R2
AWS S3
Custom S3-compatible
```

The application should receive normalized generic values.

## Refactor

Create something like:

```text
lib/storage/config.ts
lib/storage/client.ts
```

Keep existing storage protocol/accounting/cleanup behavior.

Move free-tier-specific quota assumptions out of code.

## Test against two configurations

At minimum:

1. the current Cloudflare R2 shape,
2. a local S3-compatible test service.

## Local object-store service

Add an S3-compatible object-storage service to Compose using a **pinned image version**.

Before final redistribution, review the selected storage server's license and distribution requirements.

Do not couple application code to its brand.

## Security

- no public object-store admin port by default,
- application uses private Docker networking,
- credentials generated during install,
- bucket initialization is idempotent.

## Definition of done

The same application image works with R2 or the local S3-compatible service by changing configuration only.

Suggested commit:

```text
refactor: make object storage S3-provider neutral
```

---

# Milestone 8 — Add Health and Readiness Endpoints

## Goal

Give Docker, the installer, updates, and IT a reliable way to know whether the system works.

## Endpoints

Add:

```text
GET /api/health/live
GET /api/health/ready
```

## `live`

Only answers whether the web application process is alive.

Example:

```json
{
  "status": "ok"
}
```

## `ready`

Checks required dependencies.

Possible output:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "storage": "ok",
    "configuration": "ok"
  }
}
```

Do not expose:

- credentials,
- internal connection strings,
- stack traces,
- secret values.

Decide whether detailed check results should only be available internally/admin-authenticated.

## Docker

Add health checks to relevant services.

## Definition of done

The installer can determine success by polling readiness rather than sleeping for a fixed time.

Suggested commit:

```text
feat: add deployment health and readiness checks
```

---

# Milestone 9 — Package Scheduled Maintenance

## Goal

Remove hosting-platform cron dependency.

## Why

The self-hosted install must be complete without manual cron configuration.

## Inventory

List all tasks that currently depend on:

- Vercel cron,
- manual scheduled scripts,
- expected periodic cleanup.

Create:

```text
docs/SCHEDULED-JOBS.md
```

For each job document:

```text
name
purpose
schedule
idempotency
required secret
failure behavior
logging
```

## Implementation

Add a dedicated scheduler service.

Keep it simple.

The scheduler must:

- run inside the private network,
- authenticate to protected maintenance endpoints,
- log success/failure,
- survive restarts,
- prevent overlapping execution where relevant.

## Definition of done

No required routine maintenance depends on Vercel.

Suggested commit:

```text
deploy: add self-hosted scheduled maintenance
```

---

# Milestone 10 — Build Backup and Restore Before the Installer UI

## Goal

Create reliable operational backup/restore commands.

## Why

Do not deploy institutional data before proving recovery is possible.

## Backup contents

At minimum:

```text
MongoDB
object files
deployment configuration needed for recovery
version metadata
manifest
checksums
```

Do not casually copy live MongoDB database files.

Use supported database backup tooling.

## Backup command

Create a script/service operation that:

1. validates free disk space,
2. creates a timestamped temporary directory,
3. performs the MongoDB dump,
4. backs up object data appropriately,
5. copies non-secret or safely protected recovery configuration,
6. writes application and schema version,
7. writes manifest,
8. calculates checksums,
9. atomically marks backup complete,
10. applies retention policy.

## Restore command

Restore into a controlled environment.

Requirements:

- explicit confirmation,
- pre-restore backup where possible,
- maintenance mode,
- checksum validation,
- version compatibility checks,
- database restore,
- object restore,
- integrity checks,
- application readiness check.

## Backup destinations

Support:

1. local server path,
2. optional second mounted path.

A mounted NFS/SMB university backup target can be treated as a filesystem path.

## Warning

Local backups on the same physical disk do not protect against complete disk/server loss.

## Test

Perform a destructive test using test data:

1. create records/files,
2. back up,
3. delete/change data,
4. restore,
5. verify application and files.

## Definition of done

Backup is only done when a documented restore test passes.

Suggested commit:

```text
feat: add full-system backup and restore
```

---

# Milestone 11 — Add Caddy and Reverse-Proxy Modes

## Goal

Provide simple domain + HTTPS deployment while supporting university-managed proxies.

## Mode A — Managed proxy

Installer runs Caddy.

IT provides:

```text
fyp.example.edu
```

Caddy proxies to the internal app.

Only:

```text
80
443
```

should be exposed publicly.

## Mode B — External proxy

For universities already using:

- Nginx,
- Apache,
- HAProxy,
- load balancers,
- institutional TLS termination.

Do not start Caddy.

Expose the app only on a configurable loopback/internal port such as:

```text
127.0.0.1:3080
```

Display the upstream address that university IT should use.

## Local testing

Support a no-public-domain mode:

```text
http://localhost
```

or a local development hostname without requiring public certificate issuance.

## Definition of done

Both deployment modes are tested.

Suggested commit:

```text
deploy: add managed and external reverse proxy modes
```

---

# Milestone 12 — Add Secure First-Run Bootstrap

## Goal

Create the initial administrator safely.

## Why

The installer must not require manually inserting database records.

## Requirements

Design a bootstrap mechanism that is:

- unavailable after initialization,
- protected by a one-time installer token,
- only reachable from appropriate setup context,
- audited,
- safe against replay.

Possible flow:

```text
installer generates token
        ↓
app starts in uninitialized state
        ↓
installer submits institution + first-admin bootstrap
        ↓
app validates token
        ↓
creates settings + administrator
        ↓
marks initialized
        ↓
bootstrap endpoint permanently refuses future calls
```

Do not keep a default administrator password.

## Definition of done

A fresh database can be securely initialized without direct DB editing.

Suggested commit:

```text
feat: add secure first-run bootstrap flow
```

---

# Milestone 13 — Create the Go Installer Core

## Goal

Build the installer engine before designing the full UI.

## Why Go

A compiled Go installer can be shipped as one executable and does not require Node, npm, Python, or another runtime on the university server.

## Location

```text
installer/
```

## Initial commands

```bash
installer preflight
installer generate-config
installer install
installer status
```

The UI will later call the same internal functions.

## Preflight checks

Check:

- supported OS,
- CPU architecture,
- root/sudo privileges where required,
- Docker availability,
- Docker Compose availability,
- disk space,
- memory,
- ports 80/443 when managed proxy selected,
- filesystem write permission,
- DNS resolution when domain mode selected,
- existing installation detection.

Represent results structurally:

```json
{
  "docker": {"status":"ok"},
  "compose": {"status":"ok"},
  "disk": {"status":"ok","freeBytes":123},
  "ports": {"status":"warning"}
}
```

## Config generation

Generate cryptographically secure random values for:

- database credentials,
- object-storage credentials,
- auth secret,
- cron secret,
- setup token,
- any internal service secret.

Never log secret values after saving them.

## Definition of done

A CLI-only installation can reach a running stack before the graphical wizard exists.

Suggested commit:

```text
feat(installer): add Go preflight and install engine
```

---

# Milestone 14 — Build the Installation Wizard UI

## Goal

Create the simple browser installation experience.

## Architecture

The Go installer:

1. starts a temporary local web server,
2. serves embedded HTML/CSS/JS assets,
3. exposes narrowly scoped installer APIs,
4. runs installation operations,
5. shuts down after successful installation.

Do not make the installer a second Next.js application.

## Pages/steps

### Step 1 — Welcome

Explain what will be installed.

### Step 2 — Server Check

Display:

```text
Docker
Compose
memory
disk
ports
permissions
architecture
```

### Step 3 — Institution

```text
institution name
short name
timezone
currency
```

### Step 4 — Domain

Options:

```text
managed domain + HTTPS
external reverse proxy
local/test mode
```

### Step 5 — Database

Options:

```text
Built-in database — Recommended
External MongoDB
```

For external DB:

- URI,
- test connectivity,
- verify replica-set/transaction support.

### Step 6 — File Storage

Options:

```text
Store files on this server — Recommended
External S3-compatible storage
Cloudflare R2 preset
AWS S3 preset
```

Provide **Test Storage**.

### Step 7 — Email

Fields:

```text
SMTP host
port
security
username
password
from
reply-to
```

Provide **Send Test Email**.

### Step 8 — Academic Defaults

Seed:

```text
programs
team sizes
supervisor capacity
deadline
fine
```

These become database institution settings.

### Step 9 — First Administrator

```text
name
email
initial password or secure activation flow
```

Prefer forcing a password change if an initial password is used.

### Step 10 — Backups

```text
schedule
local location
retention
optional secondary location
```

### Step 11 — Review

Never display complete secrets.

### Step 12 — Install

Show high-level progress:

```text
Preparing directories
Generating secrets
Starting database
Initializing replica set
Starting storage
Creating bucket
Starting application
Creating administrator
Starting scheduler
Configuring proxy
Configuring backups
Running health checks
```

### Step 13 — Complete

Display portal URL and next steps.

## Security

The installer must:

- use a random one-time setup token,
- bind to localhost by default,
- allow controlled LAN binding only when needed,
- stop after installation,
- refuse `/setup` after completion,
- store secrets with restrictive permissions.

## Definition of done

A clean server can be installed through the browser wizard without manually editing environment files.

Suggested commit:

```text
feat(installer): add guided browser setup wizard
```

---

# Milestone 15 — Build `fypctl`

## Goal

Give university IT one supported management command after installation.

## Install command

Place:

```text
/usr/local/bin/fypctl
```

or equivalent.

## Commands

Implement incrementally:

```bash
fypctl status
fypctl doctor
fypctl logs
fypctl restart
fypctl backup
fypctl restore
fypctl configure
fypctl version
```

Later:

```bash
fypctl update
fypctl rollback
fypctl migrate-database
fypctl migrate-storage
```

## `doctor`

Should validate:

- containers/services,
- database connectivity,
- replica-set state,
- storage access,
- writable data directories,
- application readiness,
- scheduled-job status,
- latest successful backup,
- disk capacity.

Never print credentials.

## `configure`

Temporarily launches the configuration UI with a fresh one-time token.

Do not leave a permanent privileged configuration website exposed.

## Definition of done

Normal university IT operations do not require direct Docker Compose editing.

Suggested commit:

```text
feat(installer): add fypctl operations CLI
```

---

# Milestone 16 — Add Safe Reconfiguration and Data Migration

## Goal

Allow infrastructure changes without pretending they are simple variable edits.

## Simple reconfiguration

Examples:

```text
domain
SMTP
backup schedule
secondary backup path
proxy mode
```

Can update configuration and restart only affected services.

## Database migration

Implement:

```bash
fypctl migrate-database
```

Flow:

1. validate new database,
2. verify transaction support,
3. create full backup,
4. enter maintenance mode,
5. export/copy data,
6. import new database,
7. verify counts/integrity,
8. switch application configuration,
9. restart,
10. readiness check,
11. exit maintenance mode,
12. retain rollback information.

## Storage migration

Implement:

```bash
fypctl migrate-storage
```

Flow:

1. test destination,
2. backup/maintenance safeguards,
3. enumerate object references,
4. copy objects,
5. verify counts/checksums where practical,
6. switch configuration,
7. run existing storage integrity audit,
8. readiness check.

## Definition of done

The product can safely move database or object storage with an explicit migration workflow.

Suggested commit:

```text
feat: add database and storage migration workflows
```

---

# Milestone 17 — Add Versioned Upgrades and Rollback

## Goal

Make future releases maintainable.

## Release metadata

Every release must define:

```text
application version
container image digest/tag
deployment schema version
minimum upgrade version
migration list
```

## Update flow

```text
fypctl update
```

should:

1. inspect current version,
2. check upgrade compatibility,
3. create backup,
4. enter maintenance mode if required,
5. pull/load target images,
6. run preflight/migrations,
7. recreate changed services,
8. wait for readiness,
9. run post-upgrade checks,
10. exit maintenance mode,
11. record success.

## Rollback

If readiness fails:

- stop new version,
- restore previous image/config,
- restore database only if a migration requires it and rollback is defined,
- report exact status.

Do not claim every database migration is automatically reversible.

## Definition of done

A v1.x test deployment can upgrade to a later test release and recover from a deliberately failed upgrade.

Suggested commit:

```text
feat: add safe update and rollback workflow
```

---

# Milestone 18 — Build an Offline Release Package

## Goal

Allow installation on a university server with restricted/no Internet access.

## Online release

Example:

```text
FYP-Portal-v1.0.0-linux-x64.zip
```

May pull pinned images from a registry.

## Offline release

Example:

```text
FYP-Portal-v1.0.0-offline-linux-x64.tar.zst
```

Contains:

```text
install
fypctl
deploy assets
container image archives
VERSION
MANIFEST
SHA256SUMS
documentation
third-party notices/licenses required for redistribution
```

Installer flow:

```text
load bundled images
verify checksums
install normally
```

No GitHub or container-registry access required.

## Security

Release process must generate SHA-256 checksums.

Prefer signed release artifacts when the process is mature.

## Definition of done

A fresh VM with network access disabled after copying the release file can install the portal.

Suggested commit:

```text
release: add offline self-hosted bundle
```

---

# Milestone 19 — Add Integration and End-to-End Deployment Tests

## Goal

Test real service behavior rather than only source structure.

## Integration environment

CI/local test environment should start:

```text
application
MongoDB replica set
S3-compatible object storage
mail test service if useful
```

## Integration tests

At minimum:

- database connection,
- transaction commit/rollback,
- registration,
- login,
- role authorization,
- supervisor capacity,
- project creation,
- project state transitions,
- file upload,
- file download,
- storage accounting,
- storage deletion,
- scheduled cleanup,
- email queue/send behavior,
- institution settings.

## Browser E2E

Add browser tests for critical journeys.

Recommended critical paths:

### Admin

- initialize/configure,
- log in,
- create/manage users or required admin workflow,
- change institution settings.

### Student

- register/login,
- create/join team as applicable,
- submit project/proposal,
- upload/download required file.

### Supervisor

- login,
- view assigned workflow,
- review/approve/reject as applicable.

## Definition of done

The release pipeline can prove a representative complete workflow on the same architecture used in production.

Suggested commit:

```text
test: add self-hosted integration and e2e coverage
```

---

# Milestone 20 — Clean-Machine Acceptance Testing

## Goal

Prove that the installer works for someone who has never developed the project.

## Test environments

At minimum:

### A. Developer convenience test

```text
Docker Desktop / WSL2 or local Linux
```

### B. Clean Linux VM

Recommended primary target:

```text
Ubuntu 24.04 LTS x86_64
```

Use a VM containing no:

```text
Node.js
npm
MongoDB
project source
Go
```

The release installer must not need them.

Docker can either be:

- prerequisite installed by IT,
- or later optionally installed by the installer after explicit approval.

For the first release, prefer making Docker a documented prerequisite instead of making your installer manage every Linux distribution's Docker installation.

## Acceptance test sequence

### Test 1 — Fresh online install

1. Create clean VM snapshot.
2. Install Docker/Compose only.
3. Copy release.
4. Run installer.
5. Complete wizard.
6. Verify login.
7. Verify file upload.
8. Verify email test.
9. Verify reboot persistence.
10. Verify `fypctl doctor`.

### Test 2 — Complete uninstall/reinstall from clean snapshot

Repeat without developer intervention.

Any undocumented manual step is a product bug.

### Test 3 — Backup and restore

1. create realistic test users/projects/files,
2. backup,
3. destroy test deployment data,
4. restore,
5. verify database + files.

### Test 4 — Server reboot

```bash
sudo reboot
```

All required services should return automatically.

### Test 5 — Update

Install old test version, add data, update to new version, verify.

### Test 6 — Failed update

Cause a controlled readiness failure and verify rollback/error reporting.

### Test 7 — Offline installation

Use release bundle with network disconnected.

### Test 8 — External database

Use a second test MongoDB replica set.

### Test 9 — External storage

Use another S3-compatible endpoint.

### Test 10 — External reverse proxy mode

Disable bundled Caddy and verify upstream deployment instructions.

## Definition of done

A person following only the release documentation can deploy, operate, back up, restore, and update the system.

Suggested commit:

```text
test: complete clean-machine installer acceptance suite
```

---

# Milestone 21 — Security and Operational Hardening

## Goal

Prepare the package for institutional use.

## Review

### Containers

- non-root where practical,
- read-only filesystems where practical,
- dropped capabilities where practical,
- no unnecessary ports,
- restart policies,
- pinned versions,
- resource considerations.

### Secrets

- restrictive file permissions,
- no secrets in Git,
- no secrets in Docker image layers,
- no secrets printed in logs,
- regenerated setup tokens.

### Database

- authentication enabled,
- private network,
- replica set initialized securely,
- external DB TLS support.

### Storage

- private network for local service,
- non-public bucket default,
- generated credentials,
- server-side access validation.

### Installer

- temporary privileged UI,
- one-time token,
- CSRF protection as relevant,
- safe command execution,
- strict input validation,
- no shell injection,
- no arbitrary file writes outside approved paths.

### Backups

- permissions,
- encryption strategy when required by institution,
- retention,
- off-server copy recommendation.

### Application

- close/verify stale security issues,
- add behavioral tests for authentication/rate-limit behavior,
- remove legacy plaintext-password compatibility after migration/reset strategy is complete.

## Definition of done

Security decisions are documented and tested.

Suggested commit:

```text
security: harden self-hosted deployment
```

---

# Milestone 22 — Documentation, Licensing, and University Handoff

## Goal

Create a package university IT can own.

## Documentation

Create/update:

```text
README.md
docs/INSTALL.md
docs/ADMIN.md
docs/BACKUP-RESTORE.md
docs/UPGRADE.md
docs/TROUBLESHOOTING.md
docs/ARCHITECTURE.md
docs/DISASTER-RECOVERY.md
docs/SECURITY.md
```

## INSTALL.md must answer

- supported OS,
- hardware guidance,
- ports,
- DNS requirements,
- Docker prerequisite,
- online install,
- offline install,
- external DB/storage options,
- reverse-proxy mode.

## TROUBLESHOOTING.md must include

```text
fypctl doctor
fypctl status
fypctl logs
```

and common failures.

## Ownership/license

Before university handoff:

- decide the application's license/ownership terms,
- align them with university requirements,
- include licenses/notices required by bundled third-party components,
- verify redistribution rights for every container/binary shipped in the offline package.

Do not leave this until after creating the final bundle.

## Repository presentation

Update stale README statements so documentation accurately reflects:

- self-hosted deployment,
- current author/project information,
- actual architecture,
- supported storage/email options,
- release installation process.

## Definition of done

The IT team can operate the application without needing the developer's private knowledge.

Suggested commit:

```text
docs: prepare university production handoff
```

---

# 10. Release Layout

The final release should resemble:

```text
FYP-Portal-v1.0.0/
│
├── install
├── fypctl
├── VERSION
├── MANIFEST.json
├── SHA256SUMS
│
├── deploy/
│   ├── compose.yml
│   ├── templates/
│   └── ...
│
├── images/                  # offline edition only
│   ├── fyp-portal.tar
│   ├── mongo.tar
│   ├── caddy.tar
│   └── object-storage.tar
│
└── docs/
    ├── INSTALL.md
    ├── BACKUP-RESTORE.md
    ├── UPGRADE.md
    └── TROUBLESHOOTING.md
```

The university should never need the application source tree for a normal production installation.

---

# 11. Installed Server Layout

Recommended:

```text
/opt/fyp-portal/
├── compose.yml
├── VERSION
└── release metadata

/etc/fyp-portal/
├── runtime.env
├── deployment.json
├── Caddyfile
└── secrets/

/srv/fyp-portal/
├── mongo/
├── objects/
└── backups/
```

Permissions must be restrictive.

Application upgrades should replace `/opt/fyp-portal` release assets without deleting `/srv/fyp-portal` data.

---

# 12. Suggested Installer Screens

## Server check

```text
┌─────────────────────────────────────────────┐
│ FYP Management System                      │
│ Installation                              │
├─────────────────────────────────────────────┤
│ ● Server Check                            │
│ ○ Institution                             │
│ ○ Domain                                  │
│ ○ Database                                │
│ ○ File Storage                            │
│ ○ Email                                   │
│ ○ Academic Settings                       │
│ ○ Administrator                           │
│ ○ Backups                                 │
│ ○ Review                                  │
│                                             │
│ ✓ Docker                                  │
│ ✓ Docker Compose                          │
│ ✓ Memory                                  │
│ ✓ Disk space                              │
│ ✓ Port 80                                 │
│ ✓ Port 443                                │
│                                             │
│                          [ Continue ]       │
└─────────────────────────────────────────────┘
```

## Database

```text
┌─────────────────────────────────────────────┐
│ Database                                   │
├─────────────────────────────────────────────┤
│                                             │
│ ● Keep database on this server             │
│   Recommended                              │
│                                             │
│   Data directory                           │
│   /srv/fyp-portal/mongo                    │
│                                             │
│ ○ Connect to external MongoDB              │
│                                             │
│                 [ Back ] [ Test & Continue ]│
└─────────────────────────────────────────────┘
```

---

# 13. How to Use This Plan With AI

## Recommended workflow

Keep `PLAN.md` open in VS Code.

Give the AI **one milestone only**.

Example prompt:

```text
Read PLAN.md and inspect the current repository.

Implement Milestone 2 only: Add Next.js standalone production output.

Requirements:
- do not start Milestone 3,
- preserve current behavior,
- run lint, unit tests, and production build,
- explain any failures,
- summarize changed files,
- stop when Milestone 2's definition of done is satisfied.
```

For a larger milestone:

```text
Read PLAN.md.

Work only on Milestone 7.

Before changing code:
1. inspect every current storage-related file,
2. identify all R2-specific assumptions,
3. propose the smallest refactor compatible with the milestone.

Then implement it, add tests, run verification, and stop.
Do not touch the installer UI yet.
```

## Commit after each milestone

Prefer one or a few reviewable commits per milestone.

Do not allow an AI agent to rewrite the entire project in one giant commit.

---

# 14. Recommended Development Order

Follow the milestones in order, but think of them in phases.

## Phase A — Make the application portable

```text
0 Baseline
1 Deployment contract
2 Standalone output
3 Application Docker image
4 Compose + Mongo replica set
5 Institution settings
6 SMTP
7 Generic storage
8 Health endpoints
9 Scheduled jobs
```

At the end of Phase A, the app should already be manually deployable in a professional self-hosted stack.

---

## Phase B — Make data safe

```text
10 Backup/restore
11 Reverse proxy
12 First-run bootstrap
```

Do not build the pretty installer before these foundations are reliable.

---

## Phase C — Make installation easy

```text
13 Go installer core
14 Installer UI
15 fypctl
```

At this point the target "extract -> run -> click through wizard -> live" experience exists.

---

## Phase D — Make it maintainable

```text
16 Reconfiguration/migrations
17 Upgrades/rollback
18 Offline package
```

---

## Phase E — Prove it

```text
19 Integration/E2E
20 Clean-machine acceptance
21 Security hardening
22 Documentation/handoff
```

---

# 15. Local Testing Strategy

Do not wait until the end to test the installer.

Use four levels.

## Level 1 — Normal application development

Continue:

```bash
npm run dev
```

Use this for application-feature work.

---

## Level 2 — Compose development

Regularly test:

```bash
docker compose -f deploy/compose.yml -f deploy/compose.dev.yml up --build
```

This validates:

```text
app
database
storage
networking
health checks
scheduled services
```

---

## Level 3 — Installer test on your own machine

Use a temporary deployment/data directory and non-production ports/domain mode.

The installer should have a test/dev mode if necessary, but it must exercise the same install engine as production.

Repeatedly test:

```text
fresh install
failed install
rerun/idempotency
configuration change
backup
restore
update
```

---

## Level 4 — Clean Ubuntu virtual machine

This is the most important final test.

Create a VM matching the intended server environment.

Suggested initial target:

```text
Ubuntu Server 24.04 LTS
2-4 CPUs
8 GB RAM for comfortable testing
adequate disk space
Docker Engine + Compose only
```

Take a snapshot called:

```text
clean-docker-host
```

For every release candidate:

1. restore the clean snapshot,
2. copy only the release archive,
3. install using the public instructions,
4. pretend you are university IT,
5. do not use your source repository,
6. do not manually fix configuration,
7. log every confusing/manual step as a bug.

This is the true installer test.

---

# 16. What Should Be Installed on the Developer Machine?

## Minimum

```text
Git
Node.js >= 20.9
npm
Docker + Docker Compose
Go
VS Code
```

## Windows recommendation

```text
WSL2 + Ubuntu
Docker Desktop
VS Code WSL integration
Go
Node.js
Git
```

You can keep the repository in the Linux/WSL filesystem for better Docker/Linux development behavior.

## Final-server testing

Also install one VM platform available on your system, or otherwise obtain a disposable Ubuntu VM.

The important part is not which VM product is used. The important part is testing against a genuinely clean Linux machine.

---

# 17. What the University Server Should Need

For v1, keep the prerequisite list small.

Recommended prerequisite:

```text
Supported Linux server
Docker Engine
Docker Compose plugin
DNS record if using a public domain
```

The production server should **not** require:

```text
Node.js
npm
Go
MongoDB installed directly
Caddy installed directly
application source code
VS Code
```

Those components are contained in the release/containers as appropriate.

Later, the installer may optionally install Docker on a small set of explicitly supported Linux distributions, but that should not be required for the first reliable release.

---

# 18. Decisions to Keep Explicit

Do not let an AI silently make these product decisions.

## Supported OS

Start narrow:

```text
Ubuntu 24.04 LTS x86_64
```

Add others only after testing.

## Docker installation

v1 recommendation:

> Docker is a prerequisite.

Reason: installing Docker safely across arbitrary Linux distributions creates another installer project.

## Local object-storage implementation

Select one S3-compatible server only after checking:

- current maintenance status,
- license,
- redistribution rights,
- backup behavior,
- resource requirements.

Keep the application generic regardless of which implementation is bundled.

## TLS

Default:

```text
Caddy-managed HTTPS
```

Advanced:

```text
existing university reverse proxy
```

## Database

Default:

```text
local single-node MongoDB replica set
```

Advanced:

```text
external supported MongoDB replica set/cluster
```

---

# 19. v1.0 Definition of Done

Do not call the product v1.0 until all of these are true.

## Installation

- [ ] Clean Ubuntu server installs from release archive.
- [ ] No source-code editing required.
- [ ] No manual `.env` editing required for normal setup.
- [ ] Built-in database works.
- [ ] External database can be validated.
- [ ] Built-in storage works.
- [ ] External S3-compatible storage can be validated.
- [ ] SMTP can be tested.
- [ ] domain/proxy options work.
- [ ] first administrator is securely created.

## Operations

- [ ] `fypctl status`
- [ ] `fypctl doctor`
- [ ] `fypctl logs`
- [ ] `fypctl restart`
- [ ] `fypctl backup`
- [ ] `fypctl restore`
- [ ] `fypctl configure`

## Data safety

- [ ] backup contains database + files.
- [ ] restore test passes.
- [ ] disk/server-loss limitations are documented.
- [ ] storage integrity check exists after restore/migration.

## Maintenance

- [ ] scheduled jobs run.
- [ ] upgrade tested.
- [ ] failed upgrade behavior tested.
- [ ] offline installation tested.

## Security

- [ ] installer disabled after setup.
- [ ] no default credentials.
- [ ] no secrets in repo/image.
- [ ] database/storage are private by default.
- [ ] production containers use appropriate permissions.
- [ ] security review completed.

## Documentation

- [ ] IT install guide.
- [ ] admin guide.
- [ ] backup/restore guide.
- [ ] upgrade guide.
- [ ] troubleshooting guide.
- [ ] architecture guide.
- [ ] licensing/third-party notices reviewed.

---

# 20. Reference Material Used During Planning

Repository:

- https://github.com/TaleebRaza/fyp-management-system
- `package.json`
- `next.config.ts`
- `config/appSettings.ts`
- `lib/mailer.ts`
- `lib/s3-client.ts`
- `lib/mongodb.ts`
- existing scripts/tests/CI and deployment-related files

Official documentation to consult while implementing:

- Next.js self-hosting/deployment documentation: https://nextjs.org/docs
- Docker documentation: https://docs.docker.com/
- Docker Compose documentation: https://docs.docker.com/compose/
- Go installation/documentation: https://go.dev/doc/
- MongoDB transactions/replica-set documentation: https://www.mongodb.com/docs/
- Caddy documentation: https://caddyserver.com/docs/
- Microsoft WSL documentation for Windows development: https://learn.microsoft.com/windows/wsl/

When implementing a milestone, re-check current official documentation rather than relying only on this plan, because software versions and deployment guidance change over time.

---

# 21. Immediate Next Action

Do **not** begin with the installation wizard UI.

Start with:

```text
Milestone 0
```

Then move forward one milestone at a time.

The first meaningful technical checkpoint is:

```text
Milestone 4 complete
```

At that point, the application should run as:

```text
Dockerized Next.js application
+
MongoDB replica set
```

The next important checkpoint is:

```text
Milestone 10 complete
```

At that point the system is portable enough and recoverable enough to justify investing heavily in the installer UI.

The final installer should be an interface over already-proven deployment operations, **not the place where deployment logic is invented**.
