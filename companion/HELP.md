## Relay — live captioning and translation

Controls a [Relay](https://github.com/justin-small/Relay) host: start and stop
capture, toggle target languages, watch the input meter, and run a session
clock.

> **Not finished yet.** The module connects to Relay and reports whether the
> connection is healthy; actions, feedbacks, variables and presets arrive in
> the issues that follow.

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

When the connection is good the instance goes green. A rejected token shows as
an authentication failure saying so; a certificate the module will not accept
shows as a connection failure that names the certificate and points at the two
settings above.

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
