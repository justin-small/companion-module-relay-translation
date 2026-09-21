## Relay — live captioning and translation

Controls a [Relay](https://github.com/justin-small/Relay) host: start and stop
capture, toggle target languages, watch the input meter, and run a session
clock.

> **Not finished yet.** The module holds a live connection to Relay, drives
> it, publishes its state as variables and lights buttons from it. Presets
> arrive in the issue that follows, so buttons have to be built by hand for
> now.

### Connecting

Relay binds its admin socket to loopback, and Caddy proxies `/admin` and
`/api/admin/*` on the HTTPS port (8443 by default). A Companion box elsewhere
on the venue LAN reaches Relay through that port and no other.

You need the host, the port, and the admin token that Relay's `setup.*` script
prints.

| Field                               | Notes                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Host**                            | IP address or hostname of the Relay machine                                                                               |
| **Port**                            | `8443` unless you changed Relay's `admin_port`                                                                            |
| **Admin token**                     | Printed by Relay's `setup.*` script                                                                                       |
| **Use HTTPS**                       | On for a normal install. Off only for a same-host or reverse-proxied deployment.                                          |
| **Accept self-signed certificate**  | On by default — Relay's certificate is self-signed by design                                                              |
| **Certificate SHA-256 fingerprint** | Optional. When set, the connection is pinned to that certificate and anything else is refused, even with the checkbox on. |

### Staying connected

State arrives on one server-sent-events stream that the module holds open —
there is no polling. Relay ticks that stream about once a second, so a stream
that goes quiet for five seconds is treated as dead even if the socket has not
closed, and the module reconnects on its own with a backoff of 1s, 2s, 5s, 10s
and then every 15s. Every reconnect re-reads the full state first, because the
target list may have changed while the connection was down. Nothing needs
restarting by hand: kill Relay mid-show and the buttons go red within a second
or two, and go green again when it comes back.

When the connection is good the instance goes green. A rejected token shows as
an authentication failure saying so; a certificate the module will not accept
shows as a connection failure that names the certificate and points at the two
settings above.

### Actions

| Action                      | What it does                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| **Start capture**           | Starts Relay capturing and translating                                           |
| **Stop capture**            | Stops it                                                                         |
| **Toggle capture**          | Whichever of the two the current state calls for                                 |
| **Set target enabled**      | Enable, disable or toggle one target language                                    |
| **Enable only this target** | Enables the chosen language and disables every other one, as one call per target |

The target dropdown is filled from Relay itself and rebuilds whenever the
target list changes — Relay's source language decides which targets exist, so
changing it reshapes the list without touching Companion.

Actions do not light their own buttons. Nothing is assumed to have worked
until Relay says so on the status stream, because a button that lit itself
would sit there green over a session that never started. If a call fails, the
reason appears in Companion's log with Relay's own wording — **Start capture**
with no OpenAI API key configured is the one worth knowing about, and it says
exactly that.

### Variables

| Variable                                  | What it holds                                                   |
| ----------------------------------------- | --------------------------------------------------------------- |
| `$(relay:running)`                        | `Running` or `Stopped`                                          |
| `$(relay:session_time)`                   | Session clock as `H:MM:SS`, or `--:--` when stopped             |
| `$(relay:session_time_seconds)`           | The same as a plain number, for expressions                     |
| `$(relay:source_language)`                | What Relay is listening for                                     |
| `$(relay:viewers)`                        | Viewers connected to the caption page                           |
| `$(relay:targets_live)`                   | How many languages are actually running                         |
| `$(relay:targets_live_labels)`            | Their names, comma-separated                                    |
| `$(relay:level)`                          | Input level, 0–1                                                |
| `$(relay:rms_dbfs)`, `$(relay:peak_dbfs)` | Input level in dBFS                                             |
| `$(relay:clipping)`, `$(relay:speaking)`  | `Yes` or `No`                                                   |
| `$(relay:clipped_samples)`                | Running count since capture started                             |
| `$(relay:error)`                          | Relay's last error, empty when there is none                    |
| `$(relay:sessions_error)`                 | Translation sessions in trouble — reconnecting, failed or fatal |
| `$(relay:target_spanish_state)`           | Per language: `live`, `enabled` or `off`                        |

There is one `target_<language>_state` variable per target Relay offers, named
from the language — `target_spanish_state`, `target_french_state` — and the
set changes with Relay's source language.

`enabled` and `live` are not the same thing, and the difference is worth a
button. A target is **enabled** in Relay's configuration and **live** only
when a translation session is actually open for it, which cannot happen while
capture is stopped.

The session clock runs on its own once-a-second tick rather than on Relay's
status stream, so a stream that stalls for a moment does not freeze the timer
over a show that is still running. It reads correctly when Companion connects
part-way through a session, because Relay reports when capture started rather
than the module guessing from when it first saw it running.

A meter reading goes blank, rather than to zero, when Relay reports no
measurement at all — blank means "no reading", where `0.00` would mean a live
input sitting silent.

### Feedbacks

| Feedback                        | Lights when                                           | Default      |
| ------------------------------- | ----------------------------------------------------- | ------------ |
| **Capture running**             | Relay is capturing                                    | Green        |
| **Capture stopped**             | It is not                                             | Grey         |
| **Relay error**                 | Relay reported an error, or a session failed for good | Red          |
| **Target live**                 | A session is open for that language                   | Green        |
| **Target enabled but not live** | Switched on, but carrying nothing                     | Amber        |
| **Speaking**                    | Relay hears speech                                    | Green        |
| **Audio clipping**              | The input is hitting the rail                         | Red          |
| **Session reconnecting**        | A session is not connected while capture runs         | Amber        |
| **Audio level (meter)**         | Always — colours the button from the level            | Green to red |

**Target live** and **Target enabled but not live** are two feedbacks rather
than one on purpose. In Relay, _enabled_ is configuration and _live_ means a
translation session is actually open, which cannot happen while capture is
stopped. One combined green would show a lit button over a language sending
nothing, which is the one thing an operator must not misread. Put both on a
language button: amber means armed, green means on the air.

The **audio level** feedback is an advanced one, so it colours the whole
button rather than sitting behind text: brighter with more level, amber from
−6 dBFS where headroom runs out, red when clipping. It works from dBFS rather
than the linear level, which would leave ordinary speech looking dead at the
bottom of the range.

The defaults are picked to read on an unlit Stream Deck in a dark booth.
Restyle them freely — Companion keeps your colours.

### The certificate

Relay mints its own certificate per machine — a venue LAN has no public DNS
name and no ACME challenge to answer, so a public CA is not an option. Accept
the self-signed certificate, and preferably also paste the SHA-256 fingerprint
that `setup.*` prints, which turns "trust anything" into "trust this one host".

### Where the admin token lives

Companion stores connection configuration in its own database in plaintext.
That is Companion's design and nothing this module can change. Once the token
is here it exists in a second place, so treat the Companion host as being as
trusted as the Relay host.
