# Owner sign-in BFF — integration contract (draft)

This draft integrates the frontend in
[admin#9](https://github.com/curricula-live/admin/pull/9) with
[API PR #51](https://github.com/curricula-live/api/pull/51).
Neither may be activated in production until full security review,
async email dispatch and shared rate limits are implemented.

## Sequence

1. The browser submits an email to **same-origin** `POST /api/auth/request`.
2. Admin server checks `Origin` and `Sec-Fetch-Site`, then calls Django with
   a server-only `X-Admin-BFF-Secret`. Browser code never reads this secret.
3. Django checks only the provisioned `owner`, records a purpose-bound
   token digest, and mails a fixed allowlisted
   `https://admin.curricula.live/login/verify#challenge=...` link.
4. `GET /login/verify` does not redeem the token. The client extracts the
   URL fragment and erases it from browser history. An **explicit button**
   performs `POST /api/auth/redeem`.
5. Admin BFF proxies that to Django, checks the response and sets
   `__Host-curricula_admin_session` with `HttpOnly; Secure; SameSite=Lax;
   Path=/`, a bounded server-provided expiration, and **no Domain**.
   The bearer token is never returned to browser JavaScript.
6. Every protected SSR request verifies the token through Django's
   session endpoint; revoked/expired/non-owner sessions fail closed.
7. Same-origin `POST /api/auth/logout` calls Django revocation and
   clears the browser cookie. A revocation failure is not reported as success.

## Environment configuration — none of these are set in Git

- `ADMIN_OWNER_LOGIN_ENABLED`: default unset (the sign-in form and routes
  stay unavailable unless explicitly `true`).
- `ADMIN_OWNER_PREVIEW_ENABLED`: separate gate for the guarded Atlas shell.
- `ADMIN_PUBLIC_ORIGIN`: must exactly match the allowed owner host.
- `CURRICULA_API_ORIGIN`: allowlisted HTTPS Django API hostname.
- `OWNER_BFF_SHARED_SECRET`: high-entropy server-only secret, identical to
  Django's secret for this contract; never use a `NEXT_PUBLIC_` variable.

Django additionally requires its owner operational schema, active principal,
`OWNER_AUTH_ENABLED`, `OWNER_AUTH_HTTP_ENABLED`, email sender, verified
allowlisted link URL, and private SMTP/provider credentials.

**Important:** Django's new email-link endpoints are explicitly blocked in
production pending asynchronous email delivery, neutral-response timing
analysis and persistent shared rate limits. Merely setting the Next.js
feature flag is not sufficient for working production login.

## Tests and release gates

- Static contract tests assert allowlisted admin/API origins, required
  browser Origin, rejection of cross-site requests, token syntax and expiry,
  plus fixed secure host-only cookie properties.
- Admin CI additionally validates lint, TypeScript, Next.js build, and
  production dependency advisories.
- API CI exercises POST request → mail capture → explicit redemption →
  session verification → replay denial → logout against disposable PostgreSQL.
- Still required before enablement: integration testing of actual browser
  `Set-Cookie` headers, HTTPS preview, SMTP delivery, email scanners,
  origin/CSRF attacks, cookie expiry and revocation across instances,
  accessibility and shared rate limiting. No production database cutover,
  secret provisioning, DNS, merge or deployment is authorized by this PR.
