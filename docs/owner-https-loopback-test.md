# Disposable HTTPS owner-auth browser fixture

The cross-repository authentication CI now runs a two-value transport
matrix: `http` and `https`. Both scenarios execute actual Chromium,
Next.js, Django, PostgreSQL 16, the owner email outbox worker, and
Django's temporary filesystem email backend. No external email is sent.

For HTTPS, GitHub Actions generates an **ephemeral, self-signed localhost
certificate** (SAN localhost/127.0.0.1), which is destroyed with the runner.
A small Node HTTPS reverse proxy forwards only the local browser-facing
requests from `https://localhost:3443` to the existing Next.js server on
`http://127.0.0.1:3000`. The API remains isolated on localhost port 8000.
The test entry point is `tests/owner-auth-real-stack.e2e.mjs`, selected by
`OWNER_E2E_TRANSPORT=https`.

## Security boundaries

- Both API and admin allow **only** `https://localhost:3443` as an
  extra URL, and only in explicitly marked staging test code paths.
- Both continue to reject arbitrary domains, injected query strings,
  wrong ports and production enablement. The public production hostname
  is not changed.
- Chromium uses `ignoreHTTPSErrors` **only** for this ephemeral
  self-signed loopback certificate. This tests HTTPS transport, secure
  cookie persistence and application behavior; **it is not a public-PKI
  certificate trust test**.
- The Node process trusts the ephemeral certificate via
  `NODE_EXTRA_CA_CERTS`. No credential material or TLS keys are
  committed, persisted in artifacts or deployed.
- The workflow uses pinned integration source commits, with explicit
  separate review before updating them. Email-provider integration
  remains a separate release gate.
- No DNS updates, Vercel preview/production deployment, production
  secrets or persistent database migration occur.

## Tested behavior

Chromium opens the challenge link, removes the fragment, clicks to
confirm, verifies cookie `Secure`, `HttpOnly`, `SameSite=Lax`, host-only
scope and JavaScript inaccessibility, accesses protected Atlas, observes
database-backed owner deactivation and signs out. The HTTP matrix
scenario preserves the preexisting test coverage.

Run this only in the isolated CI workflow or with matching disposable
PostgreSQL and synthetic fixture accounts. A genuinely deployed preview
still requires team-permitted Vercel access and approved mail delivery.


## SMTP protocol integration (CI only)

The disposable CI matrix now has three independent cases:

| Browser transport | Mail transport | Purpose |
| --- | --- | --- |
| HTTP localhost | Django filesystem | Baseline regression |
| HTTPS localhost | Django filesystem | Secure browser cookie, TLS and login regression |
| HTTPS localhost | Django SMTP over TCP | Real SMTP protocol, mail routing and browser authentication |

For the SMTP case, `tests/owner-auth-smtp-sink.mjs` binds **only**
`127.0.0.1:1025` and accepts SMTP commands into an in-memory mailbox. The
actual Django `smtp.EmailBackend` contacts that local listener, which
captures the owner email without sending anything to the Internet. The test
checks the envelope sender/recipient, confirms no SMTP delivery occurs in
the HTTP request path, parses the one-time link in memory and completes the
same Chromium passwordless flow through login and logout. Its local SMTP
connection and in-memory messages are destroyed at the end of the run.

This establishes network SMTP protocol compatibility and integration with
the worker; it **does not** verify sender reputation, actual mail provider
credentials, external deliverability, SPF/DKIM/DMARC, or real user inboxes.
Those are separate staging release gates. No real SMTP password is used in
this test.
