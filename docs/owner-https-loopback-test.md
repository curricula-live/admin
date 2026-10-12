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
