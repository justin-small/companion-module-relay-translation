# companion-module-relay-translation

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[Relay](https://github.com/justin-small/Relay) — server-captured live
captioning and translation for remote viewers.

Put the show on a Stream Deck: start and stop capture, toggle target
languages, watch the input meter and clipping, and run a session clock.

> **Status: planning.** No code yet. The work is filed as issues 1–8.

## What it controls

| | |
|---|---|
| **Actions** | Start / stop / toggle capture, enable–disable–toggle a target language, "enable only this target" |
| **Feedbacks** | Running, stopped, error, target live, target enabled-but-not-live, speaking, clipping, audio level, session reconnecting |
| **Variables** | Session clock, running state, source language, viewer count, live target count and labels, level / RMS / peak dBFS, clipping, speaking, error text |
| **Presets** | Start, Stop, Toggle, session clock, one toggle per target, audio meter, viewer count, at-a-glance status |

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

## Building it

Issues 1–8 in this repo carry the full specification, in order. Issue 1 is the
scaffold; the SSE client (issue 3) is the spine everything reactive hangs off.

## Submission

The module is built to be submission-ready for the Bitfocus module list —
manifest, help, license, CI — but submitting it is a deliberate non-goal. It is
not an oversight.

## License

MIT
