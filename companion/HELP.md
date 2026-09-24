## Relay: live captioning and translation

Controls a [Relay](https://github.com/justin-small/Relay) host: start and stop
capture, toggle target languages, watch the input meter, and run a session
clock.

> The module is feature-complete: connection, actions, variables, feedbacks
> and presets. Start from **Presets** rather than building buttons by hand.

### Quick start

If you have never set up Relay, someone running it can read you these four
things from the machine it is on.

1. **Host**: the Relay machine's LAN address, and **Port** `443`.
2. **Admin token**: printed by Relay's `setup.sh` / `setup.command` /
   `setup.bat`, and shown again in Relay's own operator panel.
3. Leave **Use HTTPS** and **Accept self-signed certificate** on.
4. Optionally paste the **certificate fingerprint** that the same setup script
   printed, under the heading _Operator panel certificate_.

Save. The connection goes green within a second or two. Then open
**Presets → Relay** and drag the buttons you want onto a page. They arrive
working.

If it does not go green, the instance status says which of the four is wrong:
a rejected token and a refused certificate are different messages.

### Connecting

Relay binds its admin socket to loopback, and Caddy proxies `/admin` and
`/api/admin/*` on the HTTPS port (443 by default). A Companion box elsewhere
on the venue LAN reaches Relay through that port and no other.

You need the host, the port, and the admin token that Relay's `setup.*` script
prints.

| Field                               | Notes                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Host**                            | IP address or hostname of the Relay machine                                                                                    |
| **Port**                            | `443`, the port of Relay's operator panel address. The box starts at `8443`: change it unless Relay publishes the panel there. |
| **Admin token**                     | Printed by Relay's `setup.*` script                                                                                            |
| **Use HTTPS**                       | On for a normal install. Off only for a same-host or reverse-proxied deployment.                                               |
| **Accept self-signed certificate**  | On by default. Relay's certificate is self-signed by design.                                                                   |
| **Certificate SHA-256 fingerprint** | Optional. When set, the connection is pinned to that certificate and anything else is refused, even with the checkbox on.      |

### Staying connected

State arrives on one server-sent-events stream that the module holds open.
There is no polling. Relay ticks that stream about once a second, so a stream
that goes quiet for five seconds is treated as dead even if the socket has not
closed, and the module reconnects on its own with a backoff of 1s, 2s, 5s, 10s
and then every 15s. Every reconnect re-reads the full state first, because the
target list may have changed while the connection was down. Nothing needs
restarting by hand: if Relay stops mid-show, the buttons go red within a few
seconds and go green again when it comes back.

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
target list changes. Relay's source language decides which targets exist, so
changing it reshapes the list without touching Companion.

Actions do not light their own buttons. Nothing is assumed to have worked
until Relay says so on the status stream, because a button that lit itself
would sit there green over a session that never started. If a call fails, the
reason appears in Companion's log in Relay's own words. The most common is
**Start capture** with no OpenAI API key set, and the log says exactly that.

### Variables

| Variable                                  | What it holds                                                  |
| ----------------------------------------- | -------------------------------------------------------------- |
| `$(relay:running)`                        | `Running` or `Stopped`                                         |
| `$(relay:session_time)`                   | Session clock as `H:MM:SS`, or `--:--` when stopped            |
| `$(relay:session_time_seconds)`           | The same as a plain number, for expressions                    |
| `$(relay:source_language)`                | What Relay is listening for                                    |
| `$(relay:viewers)`                        | Viewers connected to the caption page                          |
| `$(relay:targets_live)`                   | How many languages are actually running                        |
| `$(relay:targets_live_labels)`            | Their names, comma-separated                                   |
| `$(relay:level)`                          | Input level, 0 to 1                                            |
| `$(relay:rms_dbfs)`, `$(relay:peak_dbfs)` | Input level in dBFS                                            |
| `$(relay:clipping)`, `$(relay:speaking)`  | `Yes` or `No`                                                  |
| `$(relay:clipped_samples)`                | Running count since capture started                            |
| `$(relay:error)`                          | Relay's last error, empty when there is none                   |
| `$(relay:sessions_error)`                 | Translation sessions in trouble: reconnecting, failed or fatal |
| `$(relay:target_spanish_state)`           | Per language: `live`, `enabled` or `off`                       |

There is one `target_<language>_state` variable per target Relay offers, named
from the language (`target_spanish_state`, `target_french_state`), and the set
changes with Relay's source language.

`enabled` and `live` are not the same thing. A target is **enabled** in Relay's configuration and **live** only
when a translation session is actually open for it, which cannot happen while
capture is stopped.

The session clock runs on its own once-a-second tick rather than on Relay's
status stream, so a stream that stalls for a moment does not freeze the timer
over a show that is still running. It reads correctly when Companion connects
part-way through a session, because Relay reports when capture started rather
than the module guessing from when it first saw it running.

A meter reading goes blank, rather than to zero, when Relay reports no
measurement at all. Blank means "no reading", while `0.00` would mean a live
input that is silent.

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
| **Audio level (meter)**         | Always; colours the button from the level             | Green to red |

**Target live** and **Target enabled but not live** are two feedbacks rather
than one on purpose. In Relay, _enabled_ is configuration and _live_ means a
translation session is actually open, which cannot happen while capture is
stopped. One combined green would light a button for a language that is
sending nothing, and an operator would read that as on the air. Put both on a
language button: amber means armed, green means on the air.

The **audio level** feedback is an advanced one, so it colours the whole
button rather than sitting behind text: brighter with more level, amber from
−6 dBFS where headroom runs out, red when clipping. It works from dBFS rather
than the linear level, which would leave ordinary speech looking dead at the
bottom of the range.

The defaults are picked to read on an unlit Stream Deck in a dark booth.
You can restyle them, and Companion keeps your colours.

### Presets

Open **Presets → Relay** and drag. Every one arrives styled and wired, with no
further configuration:

- **Start**, **Stop** and a **Toggle** that shows the state as its own label.
- **Session clock**, which has no action on purpose, so brushing past it on a
  full surface cannot start or stop the show.
- **Audio meter**: the level in dBFS, coloured by level and going red on a
  clip.
- **Viewers** and a **Status at a glance** button showing running state, how
  many languages are live, and red on any error.
- **One toggle per language**, labelled with the language and showing `off`,
  `enabled` or `live` beneath it. Amber when armed, green when on the air.

The per-language presets are generated from whatever targets Relay currently
offers, so changing Relay's source language changes the list.

### The certificate

Relay mints its own certificate per machine. A venue LAN has no public DNS
name and no ACME challenge to answer, so a public CA is not an option. Accept
the self-signed certificate, and preferably also paste the SHA-256
fingerprint. With the fingerprint set, the module trusts only that one host
instead of any certificate.

Relay's setup script prints the fingerprint under **Operator panel
certificate**, and tells the operator to write it down. It is the same value
they check in the browser the first time they open Relay's panel. Relay's
start script prints it again on every start, as **Panel certificate
SHA-256**. Paste it with or
without colons, in any case; the module normalises it.

A pinned fingerprint wins over the checkbox: if the certificate on the far end
is not that one, the module refuses the connection and says the fingerprint it
actually saw, so you can tell a re-minted certificate from a wrong host.

### If something looks wrong

| What you see                                   | What it means                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instance red, "Admin token rejected"           | Wrong token. The module keeps retrying, so fixing it recovers without a restart.                                                                                                     |
| Instance red, certificate wording              | Either turn on **Accept self-signed certificate**, or the pinned fingerprint does not match what Relay presented.                                                                    |
| Instance red, "Nothing answering"              | Wrong host or port, or Relay is down. A normal install answers on `443`, not `8443`.                                                                                                 |
| A target button is amber and will not go green | The language is enabled but capture is stopped. Press Start.                                                                                                                         |
| Start does nothing and the log shows an error  | Relay refused it, and the log carries Relay's own words: usually no OpenAI API key, or no audio device.                                                                              |
| `$(relay:viewers)` looks stuck                 | Relay only re-reports the viewer count when something else about its state changes. Relay's own panel has the same lag: [Relay#29](https://github.com/justin-small/Relay/issues/29). |

Everything the module logs goes to Companion's own log page, prefixed with the
connection name.

### Where the admin token lives

Companion stores connection configuration in its own database in plaintext.
That is Companion's design and nothing this module can change. Once the token
is here it exists in a second place, so treat the Companion host as being as
trusted as the Relay host.
