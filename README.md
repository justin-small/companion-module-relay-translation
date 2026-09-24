# companion-module-relay-translation

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[Relay](https://github.com/justin-small/Relay) — server-captured live
captioning and translation for remote viewers.

Put the show on a Stream Deck: start and stop capture, toggle target
languages, watch the input meter and clipping, and run a session clock.

> **Status: feature-complete.** Connection, actions, variables, feedbacks and
> presets all work against a real Relay. Remaining work is documentation and
> submission readiness (issue 8).

## What it controls

|               |                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Actions**   | Start / stop / toggle capture, enable–disable–toggle a target language, "enable only this target"                                                  |
| **Feedbacks** | Running, stopped, error, target live, target enabled-but-not-live, speaking, clipping, audio level, session reconnecting                           |
| **Variables** | Session clock, running state, source language, viewer count, live target count and labels, level / RMS / peak dBFS, clipping, speaking, error text |
| **Presets**   | Start, Stop, Toggle, session clock, one toggle per target, audio meter, viewer count, at-a-glance status                                           |

## How it talks to Relay

Relay's admin API accepts a static `x-admin-token` header, so the module needs
only a host, a port and the admin token — no login flow.

State arrives over a single server-sent-events stream
(`GET /api/admin/status/stream`), which pushes full status on change and a
meter frame about once a second. No polling, and feedback lands on the surface
in well under a second.

### Two things to know before deploying

**Companion must reach Relay on 8443.** Relay's admin socket is bound to
loopback by design; Caddy proxies `/api/admin/*` on the HTTPS port. A Companion
box elsewhere on the venue LAN has exactly one way in.

**The certificate is self-signed.** Relay mints it per-machine — there is no
public DNS name on a venue LAN and no ACME challenge to answer. The module
offers an "accept self-signed" checkbox, and optionally pins the SHA-256
fingerprint that Relay's `setup.*` prints, which is the setting worth using.

**The admin token is stored in Companion's config database in plaintext.**
That is Companion's design, not something this module can change. Treat the
Companion host as being as trusted as the Relay host.

## Relationship to Relay

One change is needed on the Relay side, tracked there:
[justin-small/Relay#27](https://github.com/justin-small/Relay/issues/27) —
expose a session start timestamp so the clock is correct even when Companion
connects mid-event or reconnects.

## Installing it

On Companion 4 or later, download `relay-translation-<version>.tgz` from the
[latest release](https://github.com/justin-small/companion-module-relay-translation/releases/latest)
and import it on the **Modules** page with **Import module package**.
Companion 3 has no import button: build from source (below) and use the
developer modules path.

## Building it

```sh
npm install
npm run build     # tsc to dist/
npm run lint
npm test
npm run check     # companion-module-check, Bitfocus's own validator
npm run package   # companion-module-build, produces a .tgz
```

To load it in Companion, point Companion's developer modules path at this
checkout — it reads `companion/manifest.json` and the built `dist/main.js`, so
run `npm run build` first and `npm run dev` while working.

The module is built against `@companion-module/base` 1.x with the `node18`
runtime, which loads in both Companion 3.x and 4.x. Base 2.x and the `node22`
runtime are Companion 4 only; moving to them is a deliberate later decision,
not an upgrade to make by habit.

The SSE client (issue 3) is the spine everything reactive hangs off; actions
(issue 4) are fire-and-forget on top of it, and variables (issue 5), feedbacks
(issue 6) and presets (issue 7) are computed from its merged status cache.

CI runs lint, typecheck, tests, the Bitfocus validator and a packaging build
on every push, so a change that would fail submission fails the branch
instead.

## Releasing

Bump the version in both `package.json` and `companion/manifest.json`, add a
changelog entry, commit, then push a matching tag:

```sh
git tag v1.1.0 && git push origin v1.1.0
```

`.github/workflows/release.yaml` refuses a tag that disagrees with either
file, runs the same checks as CI, and publishes a GitHub release with the
`.tgz` attached. A tag with a hyphen (`v1.1.0-beta.1`) becomes a pre-release.

## Changelog

### 1.0.0

First release. Everything below works against a real Relay host.

- Connection over Caddy's HTTPS port with a static admin token, an optional
  pinned certificate fingerprint, and instance status that distinguishes a
  rejected token from a refused certificate.
- One held-open SSE stream with a silence watchdog and backoff reconnect; no
  polling.
- Actions: start, stop, toggle capture, set a target enabled, and enable only
  one target.
- Variables: running state, session clock, source language, viewers, live
  target count and labels, level / RMS / peak dBFS, clipping, speaking, error
  text, unhealthy session count, and per-target state.
- Feedbacks: running, stopped, error, target live, target enabled-but-not-live,
  speaking, clipping, session reconnecting, and an advanced level meter.
- Presets for all of the above, including one per target language.

Known limitation: `viewers` only refreshes when Relay pushes a full status
frame, so it can lag. Relay's own panel has the same lag —
[Relay#29](https://github.com/justin-small/Relay/issues/29).

## Submission

The module is built to be submission-ready for the Bitfocus module list —
manifest, HELP.md, license, CI and a clean `companion-module-check` — but
submitting it is a deliberate non-goal. It is not an oversight. If that
changes, the work left is opening a pull request against
[bitfocus/companion-module-requests](https://github.com/bitfocus/companion-module-requests),
and confirming the module id does not collide with one already in the list.

## License

MIT
