# Owner authentication: admin server BFF (staging contract)

The admin application authenticates through its own **same-origin** BFF endpoints:
- POST /api/owner-auth/request — neutral challenge initiation response
- POST /api/owner-auth/redeem — one-use email challenge exchange and API owner attestation
- POST /api/owner-auth/logout — bearer revocation and browser cookie clearing

The browser never receives the Django API BFF shared secret or the issued session token in a JSON body. Redemption validates the API session through the independent /v1/admin/auth/session/ endpoint before setting an eight-hour-or-shorter **Secure; HttpOnly; SameSite=Lax; Path=/** host-only cookie. There is no Domain attribute. The existing /atlas server component revalidates the cookie against Django on every request.

## Configuration (all OFF unless explicitly set)

| Setting | Meaning |
| --- | --- |
| APP_ENV | Must be exactly staging or development. Production always fails closed. |
| ADMIN_OWNER_LOGIN_ENABLED | Explicit opt-in; defaults disabled. |
| CURRICULA_API_ORIGIN | Exactly https://api.curricula.live (or localhost:8000/8080 in development). |
| ADMIN_PUBLIC_ORIGIN | Exactly https://admin.curricula.live (or localhost:3000 in development). |
| OWNER_BFF_SHARED_SECRET | Server-only shared random secret of at least 32 characters. |

The Django POST implementation in API PR #51 has its own independent feature flag and currently **hard-blocks production**. A staging environment needs a functioning non-production Django endpoint and isolated PostgreSQL with the data-owned owner schema. No GitHub push or merge enables this flow.

Security checks: exact configured Origin for mutations, reject cross-site Fetch Metadata, bounded streaming JSON (2 KiB), purpose-separated opaque tokens, independent owner attestation, redirect disabled on server fetches, cache no-store, no bearer in browser JSON, host-only cookie. No login UI is connected by this PR.

## Release blockers

- Shared, distributed/edge rate limits and abuse monitoring are not implemented.
- Verified, asynchronous mail delivery and sanitised operational alerts remain required (avoids synchronous SMTP owner-enumeration timing).
- Staging cross-repository end-to-end tests, replay/logout/revocation and cookie scope tests need to be run.
- The browser login and explicit fragment-based verification UI are not connected.
- Explicit separate production deployment and database authorisation are required. Never enable production auth based only on these routes passing CI.
