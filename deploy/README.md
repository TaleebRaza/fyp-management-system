# Container deployment (M04-M05)

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
  up --build --detach
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
  up --build --detach
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
  up --build --detach
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
The same Go implementation backs the future `install` command. Release
packaging in M11 installs both binaries; M09 supplies the installation engine.

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
