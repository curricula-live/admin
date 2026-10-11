# Knowledge Atlas v0.2 — cross-repository dependency and priority contract

This is a planning and review record, not an authorization to deploy or mutate production data.

## P0: canonical source and API migration

- [data#4](https://github.com/curricula-live/data/issues/4) — Git-canonical v2 authority
- [data#2](https://github.com/curricula-live/data/issues/2) — UUID identity and rename-stability gate
- [data#10](https://github.com/curricula-live/data/issues/10) — immutable verified publication releases
- [api#21](https://github.com/curricula-live/api/issues/21) — coordinated v2 Django migration and public API compatibility
- [api PR#42](https://github.com/curricula-live/api/pull/42) — reconcile derived semantic snapshots with v2; teacher planning remains dependent

**Gate:** staging migration proves identity preservation, count reconciliation, stable public URLs, release readback and rollback. No automatic production cutover.

## P1: knowledge integrity and owner security (parallel tracks after contracts)

- [data#11](https://github.com/curricula-live/data/issues/11) — sources and evidence
- [data#12](https://github.com/curricula-live/data/issues/12) — review state/predicate validation
- [data#13](https://github.com/curricula-live/data/issues/13) — canonical definitions and scholarly items
- [data#14](https://github.com/curricula-live/data/issues/14) — ACM CCS classification reference; CS2023/CSTA overlays
- [data#15](https://github.com/curricula-live/data/issues/15) — independent educational hierarchy
- [data#16](https://github.com/curricula-live/data/issues/16) — derived Atlas projections with no fixed Venn taxonomy
- [data#18](https://github.com/curricula-live/data/issues/18) — operational single-owner schema
- [api#43](https://github.com/curricula-live/api/issues/43) — passwordless owner authentication, server-side authorization
- [api#44](https://github.com/curricula-live/api/issues/44) — scholarly source/knowledge read API
- [api#45](https://github.com/curricula-live/api/issues/45) — owner-protected, bounded Atlas query API
- [admin#1](https://github.com/curricula-live/admin/issues/1) — admin scaffold and CI
- [admin#2](https://github.com/curricula-live/admin/issues/2) — owner session BFF and route guards

**Gate:** an owner-protected endpoint requires a verified v2 release, audited server-side role check and bounded payload. No admin UI may bypass Django.

## P2: owner Atlas UX and OS slice

- [data#17](https://github.com/curricula-live/data/issues/17) — source-grounded Operating Systems pilot
- [admin#3](https://github.com/curricula-live/admin/issues/3) — dynamic global ACM-oriented overview and semantic zoom
- [admin#4](https://github.com/curricula-live/admin/issues/4) — navigation/search/evidence inspector
- [admin#5](https://github.com/curricula-live/admin/issues/5) — staged integration and security/accessibility/performance release gate

The admin app must use a stable knowledge release, exhibit unreviewed legacy statements as unreviewed (with filtering), and never infer factual relationships from visual coordinates.

## Safe concurrency

1. Data schema/provenance and admin scaffold can advance independently, each on a separate feature branch and draft PR.
2. API v2 compatibility work can advance independently of UI, but must not apply destructive DB migrations.
3. Admin owner login awaits [api#43](https://github.com/curricula-live/api/issues/43); Atlas reads await [api#45](https://github.com/curricula-live/api/issues/45).
4. Display contracts and visual components may be developed with declared fixtures but must never be described as integrated until the OS E2E gate passes.
5. Web teacher-planning PR#15 depends on the reconciled semantic API PR#42; it is not a blocker for unrelated Atlas rendering.

## Required PR discipline

- One issue or tightly scoped subtask per feature branch; PRs target the existing integration branch where available (`data/dev`, `api/dev`), and `admin/main` until an admin `dev` branch is formally adopted.
- A PR is draft until required checks and review evidence are available.
- Human review required before merge. CI passing alone is insufficient for source acceptance.
- No PR auto-merge, DNS modification, production database apply, secret creation, or deployment without separate approval.
