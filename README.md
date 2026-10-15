# curricula.live Knowledge Atlas administration

Next.js owner workspace. Django is authoritative for owner authentication;
published knowledge is available anonymously through the versioned public API.
The `/atlas` interface requires an API-verified owner session and reads only
published UUID knowledge. It never substitutes a local snapshot when the API
fails.

## Local development

Use Node.js 22+, run `npm ci`, then `npm run dev`. Run `npm run lint`,
`npm run typecheck`, `npm run test:contracts` and `npm run build` before review.
Run `tests/run-atlas-e2e.sh` for a disposable staging rehearsal. It starts a
local PostgreSQL container, applies the data-owned migrations, publishes and
stamps the canonical Git corpus, then runs Chromium over local HTTPS with an
SMTP sink. The browser suite covers owner login, live Atlas navigation,
anonymous knowledge reads, logout and a WCAG A/AA audit. It needs Docker,
OpenSSL and either system Chromium or a Playwright Chromium install.

## Atlas contracts

Set `ADMIN_OWNER_PREVIEW_ENABLED=true` to expose the owner shell. Set
`CURRICULA_API_ORIGIN` to the exact Django origin for server-side owner session
verification. Set `ATLAS_PUBLIC_API_ORIGIN` to the public Django origin and
`ATLAS_PUBLIC_RELEASE_COMMIT` to the stamped canonical Git commit. The Atlas
reads `/v2/concepts/`, `/v2/concepts/<uuid>/`, and
`/v2/concepts/<uuid>/statements/` without forwarding owner credentials. The
public API checks its own release marker and returns 503 if the release is not
verified. Admin displays an explicit error in that case.

The Computer Science view uses alphabetic navigation areas. These are an
index, not asserted scholarly classification. The canonical corpus currently
contains 554 UUID concepts and 663 statements, but no canonical definitions,
citations, or ACM CCS/CS2023/CSTA memberships. The inspector marks statements
unreviewed and their evidence missing. The contextual graph shows only actual
concept-to-concept statements. Search, filters, breadcrumbs and URL/history
navigation use canonical UUIDs.

## Owner login and release

Set `ADMIN_OWNER_LOGIN_ENABLED=true`, `ADMIN_PUBLIC_ORIGIN` to the exact HTTPS
admin origin, and share `OWNER_BFF_SHARED_SECRET` only between the Admin server
and Django. Browser POSTs require exact Origin and same-origin fetch metadata;
Django verifies each owner session and handles expiry and revocation. The
host-only session cookie is Secure, HttpOnly and SameSite=Lax. Sign-in links
require explicit POST confirmation, so opening or previewing a link does not
redeem it.

Production requires separately configured external SMTP and a persistent
Django owner-mail dispatcher. Local SMTP sink tests prove protocol and browser
integration only; they do not prove external deliverability. See the API
[release gate](https://github.com/curricula-live/api/blob/dev/docs/public-v2-release.md) for coordinated staging and
production steps. No production database migration, mail configuration, domain
change or deployment is performed by this repository.
