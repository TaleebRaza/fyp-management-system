# Container deployment (M04)

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
`MONGODB_DATABASE`, and an application `MONGODB_URI` using the application
credentials, `authSource=<database>`, and `replicaSet=rs0`. Credentials used in
the URI must be percent-encoded. `FYP_MONGODB_DATA_DIR` defaults to
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
