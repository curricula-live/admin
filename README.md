# curricula.live — Knowledge Atlas administration

Independent Next.js owner workspace. Django is authoritative for owner authentication and administrative permissions. **Published educational knowledge remains publicly readable without login or API keys** through the public Django API; the Atlas viewer must not make knowledge private simply because its first interface is owner-gated.

## Current development state

- Passwordless owner email-link login, explicit POST confirmation, server-side session verification, secure host-only cookie, expiry, revocation and logout have been implemented across admin/API development branches.
- An isolated Chromium + Next.js + Django + PostgreSQL integration suite exercises the browser flow with local email delivery. This does **not** confirm external email deliverability or a configured public preview.
- `/atlas` is disabled unless `ADMIN_OWNER_PREVIEW_ENABLED=true` and a valid owner session is verified server-side.
- The Atlas explorer provides navigation, search, filters, inspection and real UUID identities from a **small non-published development Git snapshot**. It is not yet connected to the released canonical public read API. Definitions and references are intentionally absent where the source has no reviewed evidence.

## Local development

Use Node.js 22+ and run `npm ci`, then `npm run dev`. Validate with `npm run lint`, `npm run typecheck`, `npm run test:contracts` and `npm run build`.

To exercise complete authentication, also run a separately configured local Django API, disposable PostgreSQL with the documented admin operational tables, and the local asynchronous email worker. The CI definition in `.github/workflows/owner-fullstack-ci.yml` is the reproducible integration reference. Never use production credentials or a live database as a local fixture.

The feature flags and non-public staging email destination are required; do not activate authentication or deploy to production by committing configuration defaults.

## Data and authorization boundary

- **Public:** published concepts, definitions, statements, relations, taxonomies and search; unauthenticated bounded GETs; maintain existing `/v1/` compatibility.
- **Private:** owner email challenge/session lifecycle, protected administrative commands, unpublished data; Django checks permission server-side.
- The current `atlas-fixture.ts` (legacy filename) is a deterministic small selection of genuine concepts/statements from `curricula-live/data/knowledge/*.jsonl` on `dev`, not a runtime public publication. IDs are not invented; area labels are navigation groupings, not asserted canonical taxonomy relationships.
- The next vertical slice must read **published** UUID-backed data from public API endpoints after data publication is verified, with accurate `reviewed`/`unreviewed`/`missing-evidence` status. Do not infer review from UUID presence.
- No privileged API credentials or database secrets are exposed to browser JavaScript.

## Release boundaries

Admin and API `main` promotion, Vercel deployment, public-domain configuration, external SMTP credentials, production flags and database migrations require separate approval. An isolated CI success is not proof of actual owner-email delivery or a live preview.

See [architecture dependencies](docs/architecture/dependencies.md), [automation safety](docs/automation-policy.md) and [HTTPS/SMTP integration](docs/owner-https-loopback-test.md) (the last is introduced by PR #12).
