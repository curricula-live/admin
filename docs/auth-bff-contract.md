# Owner BFF authentication contract (provisional)

Implements a **fail-closed, server-to-server session verification client** only. This PR does NOT authenticate anyone, redeem email links or expose Atlas data.

- Session cookie: `__Host-curricula_admin_session`, to be set **later** by the admin BFF as `Secure; HttpOnly; Path=/; SameSite=Lax` (no `Domain`).
- On every protected server read, `currentOwnerIdentity()` obtains the cookie through Next.js server-only `cookies()` and verifies the opaque token with the Django API.
- API origin in `CURRICULA_API_ORIGIN`: `https://api.curricula.live` in production, limited loopback HTTP origins in development. No arbitrary URLs.
- Planned verify contract: `GET /v1/admin/auth/session/` returning `contract_version: owner-session@1`, `authenticated: true`, `active: true`, `role: owner`, `subject_id: UUID`, `expires_at: ISO-8601`. **This endpoint is not yet implemented in Django.** Finalize exact shape jointly with [api#43](https://github.com/curricula-live/api/issues/43); no privileged frontend routes may be enabled until integration tests pass.
- Missing/invalid/expired cookies, rejected role, malformed API payload, network errors and unavailable API all fail closed. Token is not available to browser JavaScript through these helpers.
- This is not sufficient authentication by itself: unique-owner DB constraint, passwordless challenge issuance/redeeming, cookie issuance, revocation, Origin/CSRF, audit and rate limiting remain blocked by [data#18](https://github.com/curricula-live/data/issues/18) and [api#43](https://github.com/curricula-live/api/issues/43).
- This PR is based on the branch of [admin#6](https://github.com/curricula-live/admin/pull/6) and is separate from its foundation scope. Rebase or retarget after that foundation merges; do not merge either automatically.
