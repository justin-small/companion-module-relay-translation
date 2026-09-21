# Testing against a real Companion

`compose.yaml` runs Companion in Docker with this checkout mounted as a
developer module, and `fake-relay.cjs` stands in for a Relay host so the module
can be exercised without one.

```sh
npm install && npm run build
mkdir -p dev/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout dev/certs/key.pem -out dev/certs/cert.pem \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"
openssl x509 -in dev/certs/cert.pem -noout -fingerprint -sha256   # for the pinning field

node dev/fake-relay.cjs &
docker compose -f dev/compose.yaml up -d
open http://localhost:8000
```

In Companion: **Add Connection → Relay: Relay**, then set the host to
`host.docker.internal`, port `8443`, token `good-token`.

Companion's entrypoint installs and builds any developer module that has no
`node_modules`, using yarn. This repo uses npm, so build on the host first (as
above) and the container leaves it alone. Rebuild and restart the connection —
or the container — to pick up a change.

Status messages land in Companion's own log at <http://localhost:8000/log>;
`docker compose -f dev/compose.yaml logs` has the process-level ones.

Tear down with `docker compose -f dev/compose.yaml down -v` (the `-v` drops the
Companion config volume, so connections you added go with it).
