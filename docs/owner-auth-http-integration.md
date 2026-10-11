# Owner-auth HTTP integration (isolated Next.js + Django contract stub)

Run `npm run test:auth-http` in this repository after `npm ci`.

The runner starts **actual Next.js development route handlers** on
`http://127.0.0.1:3000` and an in-memory, deterministic Django-compatible
HTTP stub on `http://127.0.0.1:8000`. It uses synthetic tokens and a
test-only BFF shared secret. No live API, PostgreSQL, SMTP, production secrets,
DNS, Vercel deployment, or user account is accessed.

The checks exercise the HTTP boundary rather than testing only pure functions:

- Anonymous or fabricated-session `/atlas` access redirects to login.
- Missing/wrong Origin and cross-site requests cannot reach the stub API.
- Unknown and known addresses produce identical neutral link-request responses.
- Oversized JSON is rejected before proxying to Django.
- GET `/login/verify` does not redeem challenges; malformed and repeated
  POST challenges fail without issuing cookies.
- A successful POST exchanges an opaque challenge, obtains a server-verified
  owner identity, and sets a `__Host-` cookie with Secure, HttpOnly,
  SameSite=Lax, Path=/ and no Domain; browser JSON never contains the bearer.
- The SSR owner shell accepts the valid cookie and rejects a forged one.
- Logout requires the same Origin, revokes the upstream session and clears
  the browser cookie; the previous cookie cannot access Atlas afterward.
- An owner that becomes inactive during redemption never receives a cookie,
  and its orphan API session is revoked best-effort.

The runner uses `next dev` because production hostname allowlists
intentionally reject loopback API origins. Thus it verifies real HTTP
semantics of the staging/development routes, **not a deployed HTTPS browser
session**. Browser automation, actual SMTP and DB integration, TLS, and
staging deployment remain separate release gates.

The CI workflow runs this after unit contract tests and before `next build`.
Ports 3000 and 8000 must be unused. All resources are shut down after the
test, including on failure.
