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


## Cross-repository real-stack CI

`.github/workflows/owner-fullstack-ci.yml` runs an independent, disposable
PostgreSQL 16 service and checks out the **exact reviewed integration commits**
for all three repositories:

- Admin: the pull request's current branch
- Django API: `f0bf25b242761a8f7a548955cb1ed1d4dead4176`
  ([api PR #55](https://github.com/curricula-live/api/pull/55)), which
  explicitly handles trusted machine POSTs without Django browser CSRF tokens
- Data: `1aa46b7602bedffd36cc27457d7fa91dd289b54d`
  (migrations `0002_admin_owner.sql` and `0003_owner_mail_outbox.sql`)

The workflow installs those migrations **only on disposable CI PostgreSQL**,
provisions the synthetic `owner-e2e@example.invalid` principal, and runs
`node tests/owner-auth-real-stack.e2e.mjs`. The Node runner starts the
actual Django HTTP server and Next.js dev server; the mail worker uses
Django's isolated filesystem email backend instead of SMTP.

The test asserts that a request to an unknown account is indistinguishable
from a request to the synthetic owner, no mail is dispatched synchronously,
GET does not redeem a challenge, the real worker delivers the challenge,
and one-time redemption persists a revocable session. It then verifies that
the Next.js response contains an HttpOnly Secure host-only cookie, that an
inactive owner is denied immediately, and that explicit logout revokes the
PostgreSQL session.

The private fixture HMAC/BFF keys are **obvious CI-only constants** and
must never be copied into staging or production settings. Local mail files
are removed at the end of the test and are never uploaded as CI artifacts.

**Limitations:** this test uses loopback HTTP, a programmatic HTTP client
rather than a headed browser, and the filesystem mail backend. It does not
prove external email deliverability, public HTTPS TLS/cookie handling,
cross-instance deployment routing, or DNS. Those remain separate staging
release gates. As dependencies move, update both pinned SHAs only after
reviewing the new commits and rerun the suite.
