# Recurring automation: execution and stop policy (proposed)

This document defines safe defaults; scheduled jobs that can write code are **not enabled** by merging this document.

## Scope
- Read-only daily status checks may inspect open Knowledge Atlas issues, draft PRs, CI results, and blockers.
- A code-writing job requires an explicit, separately approved issue scope, repository/branch and maximum number of attempts.
- Preserve canonical Git->review->publish flow. Never update production PostgreSQL from a scheduled job.

## Gates
1. Work only on a named feature branch; never commit directly to `main` or `dev`.
2. Produce draft PRs; run repository CI and include test evidence before requesting review.
3. No automatic merge, deployment, secret edits, role changes, DNS changes or production migration.
4. Do not publish scraped academic content or mark statements as reviewed without source and reviewer evidence.
5. Avoid concurrent writes to one branch; never overwrite human changes. Keep independent branches per issue.
6. If required checks fail, a branch diverges, a source/license is ambiguous, or an authorization issue arises: stop modifications and report the blocker.

## Stop conditions
- Stop when the assigned issue is closed, the feature PR is merged/closed or the approval is withdrawn.
- Stop when two consecutive attempts cannot make independently testable progress.
- For an individual unattended coding assignment, cap at 10 runs or 14 days, whichever comes first; escalation requires renewed approval.
- For reporting-only automations, default to a finite 14-run schedule with no repository writes.

## Reporting
Each run should report relevant links, branch SHA, changed paths, CI state, unresolved dependencies and whether further human review is required. Never call a queued CI check 'passed'.
