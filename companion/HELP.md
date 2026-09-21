## Relay — live captioning and translation

Controls a [Relay](https://github.com/justin-small/Relay) host: start and stop
capture, toggle target languages, watch the input meter, and run a session
clock.

> **Not finished yet.** The module holds a live connection to Relay and can
> drive it; feedbacks, variables and presets arrive in the issues that follow,
> so buttons act but do not yet light up.

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
