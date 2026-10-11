# curricula.live — administration

Separate future owner-only administrative frontend for the curricula.live Knowledge Atlas.

## Current status

**Scaffold only. No login, Atlas API, or privileged route is enabled.**

The root route redirects to `/login`, which currently displays an honest unavailable state.
This must remain fail-closed until [admin#2](https://github.com/curricula-live/admin/issues/2) and [api#43](https://github.com/curricula-live/api/issues/43) implement and verify server-side owner authentication.

## Development

- Node.js 22+
- `npm install`
- `npm run dev`
- `npm run lint`, `npm run typecheck`, `npm run build`

## Architecture and deployment

- Independent Next.js application at the planned `admin.curricula.live` host.
- Django API is the only owner authorization authority.
- Server-side BFF token exchange and host-only secure cookies are required before exposing owner pages.
- No direct database access, privileged browser API tokens, or canonical knowledge JSONL embedded in this app.
- CI currently checks lint, TypeScript, build and production dependency advisories.
- **Do not deploy as the actual admin service yet.** Configure protected previews, DNS, environment secrets and server-side auth only in separately authorized deployment work.

Read [cross-repository dependencies](docs/architecture/dependencies.md) and [automation safety policy](docs/automation-policy.md).
