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
above) and the container leaves it alone. Rebuild and restart the connection,
or the container, to pick up a change.

## Against the real Relay

The stand-in covers the module's own logic. The transport (Caddy, TLS, the
1 Hz meter tick) needs Relay itself. From a Relay checkout:

```sh
docker compose -f docker/docker-compose.yml build
OPENAI_KEY=... ADMIN_TOKEN=... RELAY_ADMIN_FQDN=host.docker.internal \
  docker compose -f docker/docker-compose.yml run --rm --no-deps \
  -e OPENAI_KEY -e ADMIN_TOKEN -e RELAY_ADMIN_FQDN relay python tools/write_config.py
RELAY_ADMIN_IPS=<lan-ip> docker compose -f docker/docker-compose.yml run --rm --no-deps \
  -e RELAY_ADMIN_IPS relay python tools/setup_caddy.py     # prints the fingerprint
RELAY_HTTP_PORT=8080 RELAY_HTTPS_PORT=8443 docker compose -f docker/docker-compose.yml up -d
```

`RELAY_ADMIN_FQDN=host.docker.internal` puts the name the Companion container
dials into the certificate, and `setup_caddy.py` prints the SHA-256 to paste
into the fingerprint field. Publishing the panel on 8443 matches the module's
default port. A venue install publishes it on 443 instead, so set the port to
443 there.

Capture will not start with this setup: it wires in no audio, and the OpenAI
key can be a placeholder. Every admin endpoint, the status stream and the
certificate are the real ones.

Status messages land in Companion's own log at <http://localhost:8000/log>;
`docker compose -f dev/compose.yaml logs` has the process-level ones.

Tear down with `docker compose -f dev/compose.yaml down -v` (the `-v` drops the
Companion config volume, so connections you added go with it).
