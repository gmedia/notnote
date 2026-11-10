# Dispatcher

The dispatcher is a single writer that assigns ready issues to agents. Workers stop choosing their own work, which removes almost all claim races.

```
GitHub Issues (status:ready)
        │
        ▼
  dispatcher  ── reads roster, claims, dependencies
        │
        ├── planAssignments()  deterministic, side-effect free
        │
        ▼
  git push refs/claims/issue-<n>   ← the lock
        │
        ├── comment on the issue: assigned agent + lease
        └── labels: status:ready → status:claimed
```

## Why a single writer

Self-service claiming is safe but wasteful: every agent reads the same board and collides on popular issues. A dispatcher serialises the decision, so collisions become a rare race between the dispatcher and a late manual claim, which the Git ref CAS still resolves correctly.

Use self-service claiming up to roughly five agents. Above that, run the dispatcher.

## Run it

```bash
# see the plan without claiming anything
node scripts/dispatch.mjs --dry-run

# claim assignments
node scripts/dispatch.mjs

# single issue, useful for testing the parser
node scripts/dispatch.mjs --dry-run --issue 8

# long-running loop (local operator)
node scripts/dispatch.mjs --interval 120
```

In CI, `.github/workflows/dispatch.yml` runs every ten minutes with `GITHUB_TOKEN`. Manual runs default to dry-run.

## Scheduling and live mode

The workflow runs every ten minutes, but **a scheduled run is dry-run by default**. It prints the plan and claims nothing.

| Trigger                                  | Mode    | How to make it live                               |
| ---------------------------------------- | ------- | ------------------------------------------------- |
| `schedule`                               | dry-run | set repository variable `DISPATCH_LIVE` to `true` |
| `workflow_dispatch`                      | dry-run | set the `dry_run` input to `false`                |
| `workflow_dispatch` with `dry_run=false` | live    | —                                                 |

Enable live scheduling only when the roster matches reality and every agent has a working credential, otherwise the dispatcher claims issues that no worker will pick up and each claim expires after an hour.

```bash
gh variable set DISPATCH_LIVE --body true  -R gmedia/notnote   # enable
gh variable delete DISPATCH_LIVE           -R gmedia/notnote   # back to dry-run
```

The chosen mode is echoed in the job log as `event=... mode=... live_flag=...`, so a live run is visible rather than inferred.

## Inputs

| Input        | Source                        | Notes                                                    |
| ------------ | ----------------------------- | -------------------------------------------------------- |
| Roster       | `docs/agents/agents.json`     | `id`, optional `area`, optional `capacity`, `active`     |
| Issues       | GitHub, state open            | Must carry `status:ready` and a `write_set`              |
| Dependencies | `Depends on` section          | Satisfied when the dependency is closed or `status:done` |
| Claims       | `refs/claims/*`               | Expired leases are ignored, not stolen                   |
| Done set     | Closed issues + `status:done` | Used only for dependency checks                          |

## Rules enforced by the planner

1. Never assign an issue that is not `status:ready` or that carries `status:blocked`.
2. Never assign an issue with an unresolved dependency.
3. Never assign an issue with a live claim.
4. Never assign an issue whose `write_set` overlaps a live claim or a planned assignment.
5. Prefer the agent that owns the issue's `area`. `area: any` accepts everything.
6. Respect `capacity` per agent, default 1.
7. Order by `priority:p0`, `p1`, `p2`, then issue number. Stable across runs, so logs are diffable.

`planAssignments` is pure and unit-tested. If you change the policy, change the tests first.

## Failure handling

| Situation                    | Behaviour                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Claim push rejected          | The issue was taken between read and write. The dispatcher reports `lost-race` and moves on. Next cycle retries. |
| Agent is dead                | Its lease expires after the TTL. `lease-gc` reclaims it, and the dispatcher reassigns.                           |
| Dispatcher is down           | Workers fall back to self-service claiming. The protocol stays valid because the Git ref is still the lock.      |
| Issue has no `write_set`     | Skipped with `no write_set`. The issue guard also strips `status:ready` from such issues.                        |
| Roster is empty or malformed | The run fails loudly. It does not silently assign to nobody.                                                     |

## Do not

- Do not run two dispatchers against the same repository. The claim CAS prevents corruption, but the plans will fight and the comments will duplicate.
- Do not let the dispatcher merge pull requests. Assignment and review are separate roles.
- Do not add heuristics like "pick the oldest issue" without a test. Determinism is the point.
