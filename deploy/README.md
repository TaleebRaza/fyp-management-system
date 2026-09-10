# Container deployment (M04-M11)

The base Compose file starts only the portal container. Use it when `MONGODB_URI`
points to an external MongoDB replica set that has already passed the transaction
probe. Add the local-MongoDB overlay to run the authenticated single-node `rs0`
replica set on this host.

`/etc/fyp-portal/portal.env` is the sole runtime configuration file. The future
installer creates it with mode `0600`; use it for Compose interpolation too:

```sh
docker compose --env-file /etc/fyp-portal/portal.env \
  -f deploy/compose.yaml \
  -f deploy/compose.local-mongodb.yaml \
  up --detach
```

For local MongoDB, that file must contain `MONGODB_ROOT_USERNAME`,
`MONGODB_ROOT_PASSWORD`, `MONGODB_APP_USERNAME`, `MONGODB_APP_PASSWORD`,
`MONGODB_REPLICA_SET_KEY`, `MONGODB_DATABASE`, and an application `MONGODB_URI` using the application
credentials, `authSource=<database>`, and `replicaSet=rs0`. Credentials used in
the URI must be percent-encoded. `MONGODB_REPLICA_SET_KEY` must be a persistent
base64 value between 6 and 1024 characters. `FYP_MONGODB_DATA_DIR` defaults to
`/var/lib/fyp-portal/mongodb`.

Neither the app nor MongoDB publishes a host port. M05 adds the public Caddy
gateway. Check an external database before configuring it:

```sh
docker compose --env-file /etc/fyp-portal/portal.env \
  -f deploy/compose.yaml \
  run --rm app node deploy/verify-mongodb-transactions.mjs
```

The probe performs one committed and one aborted transaction, then removes its
unique probe record from the application-owned `systemconfigs` collection. It
returns no connection details or secrets.

## Gateway and storage

Add `deploy/compose.gateway.yaml` to publish Caddy and reach the portal. In
public mode, `FYP_CADDY_SITE` is the portal domain and Caddy manages HTTPS:

```sh
docker compose --env-file /etc/fyp-portal/portal.env \
  -f deploy/compose.yaml \
  -f deploy/compose.gateway.yaml \
  up --detach
```

For an existing institutional TLS proxy, set `FYP_CADDY_SITE` to
`http://portal.example.edu`, set `FYP_CADDY_HTTP_BIND=127.0.0.1:8080`, and set
`FYP_CADDY_HTTPS_BIND=127.0.0.1:8443`. The institutional proxy must preserve
the original host, path, and query when forwarding to Caddy.

For local object storage, add `deploy/compose.local-storage.yaml` after the
gateway overlay. It starts a private SeaweedFS 4.42 S3 service, configures the
`fyp-uploads` bucket and its CORS policy, and starts the application and Caddy
only after initialization succeeds:

```sh
docker compose --env-file /etc/fyp-portal/portal.env \
  -f deploy/compose.yaml \
  -f deploy/compose.local-mongodb.yaml \
  -f deploy/compose.gateway.yaml \
  -f deploy/compose.local-storage.yaml \
  up --detach
```

Local storage requires `PORTAL_PUBLIC_URL`, `S3_ENDPOINT=http://seaweedfs:8333`,
`S3_BROWSER_ENDPOINT` equal to that public URL, path-style addressing, and
`S3_BUCKET_NAME=fyp-uploads`. Caddy proxies `/fyp-uploads/*` unchanged, so the
S3 signature retains its host, path, and query. SeaweedFS management ports and
the Caddy admin API are not published.

Validate browser storage only against a false-data local environment:

```sh
docker compose --env-file /etc/fyp-portal/portal.env \
  -f deploy/compose.yaml \
  -f deploy/compose.local-mongodb.yaml \
  -f deploy/compose.gateway.yaml \
  -f deploy/compose.local-storage.yaml \
  run --rm -e FYP_STORAGE_VALIDATION_CONFIRM=LOCAL_FALSE_DATA app \
  node deploy/verify-browser-storage.mjs
```

The validator performs a bucket HEAD and a signed browser CORS preflight. It
does not upload an object, and it refuses to run without the explicit
false-data confirmation.

## Operations CLI

M06 adds root-only `fypctl` diagnostics. It uses the protected configuration
and active release paths directly, so IT does not need to reconstruct Docker
Compose commands:

```sh
sudo fypctl status
sudo fypctl doctor
sudo fypctl logs --tail 200 app
sudo fypctl version
```

`fypctl logs` redacts the secret values held in `/etc/fyp-portal/portal.env`.

After the application container is healthy, bootstrap the institution and its
first administrator once. Pass the password through standard input, never a
shell argument or environment variable:

```sh
printf '%s\n' 'choose-a-unique-password' | sudo fypctl bootstrap \
  --password-stdin \
  --university-name 'Example University' \
  --admin-name 'Portal Administrator' \
  --admin-email 'admin@example.edu' \
  --admin-roll-no 'F23-0001'
```

Bootstrap holds the operation lock and runs a MongoDB transaction inside the
private application container. A completed bootstrap is a no-op on repeats;
it never changes the administrator password, branding, or creates another
administrator. The CLI refuses non-root callers, non-`0600` configuration,
and concurrently running operations.

## Background processing and retention

M07 splits mandatory background work from optional content retention. The
essential worker processes expired upload reservations, storage-deletion work,
and email outbox work every minute. Retention is evaluated every minute, but
only performs a run once its persisted daily time and IANA timezone are due.
This lets administrators change the schedule without rewriting systemd units.

Install the release-provided timer units after the application is healthy:

```sh
sudo fypctl timers install
systemctl list-timers 'fyp-portal-*'
```

The timers call `fypctl jobs essential` and `fypctl jobs retention`. Each
command enters the container and authenticates to its internal cron endpoint
with `CRON_SECRET`; neither the secret nor a public job URL is placed in a unit
file. The retention policy is managed in the administrator dashboard. New
settings default to a daily 02:00 UTC run, seven-day cleanup of played project
voice notes and unused finalized PDF uploads, and disabled age-based cleanup
for unplayed notes and audio broadcasts. Attached PDFs, shared object keys,
student/admin messages, branding, templates, and active upload reservations
are not retention targets.

The legacy `/api/cron/voice-cleanup` route remains for existing Vercel-backed
installations. Until a retention policy is explicitly saved, it preserves the
previous cleanup behavior while the new self-hosted timers are not configured.

## Maintenance, backup, and restore

M08 adds a root-only, fail-closed maintenance mode. `fypctl maintenance start`
stops the background timers, sets a persistent application write block, and
creates the state marker that makes Caddy serve the maintenance page with HTTP
503. It blocks administrator writes too. Health endpoints remain available for
container monitoring. `fypctl maintenance stop` clears that state and starts
only the timers that were active before maintenance began.

Backups are encrypted with `FYP_BACKUP_RECOVERY_KEY`, a base64-encoded 32-byte
key in the root-only portal configuration. Store a copy of that key outside the
server. It is required to restore onto a clean environment. `fypctl backup`
never prints the key, configuration values, or storage credentials.

```sh
sudo fypctl backup create --keep 7
sudo fypctl backup schedule daily --at 02:00 --keep 7
sudo fypctl backup schedule off
```

The completed archive and its checksum manifest are root-readable only under
`/var/lib/fyp-portal/backups` by default. The archive contains a logical
MongoDB export, every object in the configured portal bucket, the protected
configuration snapshot, deployment state, and per-file checksums. Backup data
is first copied into a non-secret container workspace, then the root-only CLI
adds configuration and encrypts the final archive. A failed or unverified run
does not receive a completed manifest and cannot trigger retention pruning.
Pending upload reservations are recorded in the application manifest while
maintenance prevents their finalization; ordinary reservation expiry resumes
after the portal reopens.

Restore only targets a separately configured, empty database and storage
bucket. It verifies the archive checksum, encryption tag, release version, and
all MongoDB/object checksums before it writes. It intentionally leaves
maintenance mode active after an incomplete restore, so a partial clean target
cannot be exposed by accident.

```sh
printf '%s\n' "$FYP_BACKUP_RECOVERY_KEY" | sudo fypctl backup restore \
  --backup BACKUP_ID \
  --recovery-key-stdin \
  --confirm-restore=RESTORE_INTO_EMPTY_DESTINATION
```

Add `--restore-config` only when the source configuration is also appropriate
for the target. The restore command otherwise retains the target configuration
used to reach its empty database and bucket.

## Release archives

M11 distributes an installer archive through GitHub Releases and the matching
application image through public GHCR. The installer archive does not contain
the application source or a Docker build context. Its signed GitHub provenance
attestation covers the archive, including its manifest and `SHA256SUMS`; the
installer rechecks every listed archive file before it writes deployment state.

For a release tag such as `v1.2.3`, download the archive, its checksum sidecar,
and the manifest from the draft release after it has been reviewed and
published. Verify the checksum and provenance before extracting it:

```sh
sha256sum --check fyp-portal-v1.2.3-linux-amd64.tar.gz.sha256
gh attestation verify fyp-portal-v1.2.3-linux-amd64.tar.gz \
  --repo TaleebRaza/fyp-management-system
tar -xzf fyp-portal-v1.2.3-linux-amd64.tar.gz
```

The release manifest pins `FYP_PORTAL_IMAGE` to a GHCR digest. The installer
writes that value to the protected runtime configuration, and Compose always
pulls that immutable image rather than building source on the server.

Pushing a `v*` tag runs `.github/workflows/release.yml`: it tests the source,
publishes and attests the image, builds the Linux amd64 installer binaries,
creates a deterministic archive with third-party notices, and uploads all
assets to a draft release. Publication remains a manual review step. Before
the first public release, select and add the portal's own distribution license,
make the GHCR package public, and confirm the release repository is public.

## Initial installation

Run the root-only installer from an extracted release. It opens a temporary
setup server on `127.0.0.1` and prints an SSH forwarding command plus a
single-use setup URL. The URL expires after 15 minutes, uses an HttpOnly
same-site session cookie, and rejects requests without the loopback origin.

```sh
cd /path/to/extracted-release
sudo ./install
```

On the workstation, use the command printed by the installer, for example:

```sh
ssh -L 34712:127.0.0.1:34712 administrator@portal-server
```

Open the printed URL after the tunnel is connected. The wizard collects the
domain, local or external database and storage choices, required PNG logo,
branding, SMTP settings, first administrator, retention policy, and optional
backup schedule. External endpoint tests establish reachability; service
startup still verifies the complete configuration. After successful setup the
loopback server stops itself.

The installer decodes and re-encodes the uploaded logo, accepting only PNG
images no larger than 2 MiB and 2048 by 2048 pixels. It shows a non-secret
review before it starts the resumable deployment engine. Browser keyboard
navigation follows the native form order.

To reopen supported settings after installation, use the same protected
loopback workflow:

```sh
sudo fypctl configure
```

It supports SMTP, branding and logo replacement, retention, and backup
preferences. Database and object-storage destinations are intentionally not
configurable here because changing either requires a data migration.

The direct request interface remains available for recovery and automation.
It accepts one root-owned (`0600`) JSON request outside the extracted release.
The request contains the first administrator password, so remove it after a
successful installation.

The release directory must contain the `install` and `fypctl` binaries,
`release-manifest.json`, `SHA256SUMS`, `INSTALL.md`,
`THIRD_PARTY_NOTICES.md`, and `deploy/`. The engine verifies that exact
payload before it checks Ubuntu 24.04 on amd64, memory, disk capacity, ports
80/443, DNS, Docker's Ubuntu repository, and an existing installation. It
never removes conflicting Docker packages or overwrites an untracked install.

```json
{
  "domain": "portal.example.edu",
  "database": { "mode": "local" },
  "storage": { "mode": "local" },
  "mail": {},
  "bootstrap": {
    "universityName": "Example University",
    "primaryColor": "#14213d",
    "accentColor": "#fca311",
    "administrator": {
      "name": "Portal Administrator",
      "email": "admin@example.edu",
      "rollNo": "F23-0001",
      "password": "choose-a-unique-password"
    }
  }
}
```

For an external transaction-capable MongoDB deployment, use
`"database": { "mode": "external", "uri": "mongodb://..." }`. For
external S3-compatible storage, provide `mode`, `endpoint`, `browserEndpoint`,
`region`, `accessKeyId`, `secretAccessKey`, `bucketName`, and
`forcePathStyle` in `storage`. Optional `mail` accepts the equivalent generic
SMTP fields from `.env.example`.

```sh
sudo install -m 600 -o root -g root /path/to/request.json /root/fyp-install-request.json
cd /path/to/extracted-release
sudo ./install --request /root/fyp-install-request.json
```

Each completed stage is recorded, without credentials, in
`/var/lib/fyp-portal/state/installation-state.json`. Rerun the same command
with the same request after an interruption. It resumes completed work without
regenerating configuration or replacing release/data directories.
