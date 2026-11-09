# Multi-agent coordination

Agents coordinate through four layers. Each layer has one job; none of them is optional.

| Layer     | Mechanism                                           | Purpose                                       |
| --------- | --------------------------------------------------- | --------------------------------------------- |
| Ledger    | GitHub Issues + labels                              | What to do, acceptance criteria, dependencies |
| Lock      | Git ref `refs/claims/issue-<n>`                     | Who holds the issue, and until when           |
| Isolation | Branch, worktree, `write_set`                       | Prevent two agents touching the same paths    |
| Gate      | Pull request + required checks + claim verification | Prevent unverified code reaching `main`       |

Assignees and `status:*` labels are advisory only. They are last-write-wins and cannot prevent a race. The Git ref is the lock.

## Why a Git ref

`git push` fails when the target ref already exists and the new commit is not a descendant. That is a real compare-and-swap, enforced by the Git server, with no extra infrastructure.

- Creating a claim: `git push origin <sha>:refs/claims/issue-42` fails if the claim exists.
- Taking an expired claim: `git push --force-with-lease=refs/claims/issue-42:<old-sha> ...` fails if someone else already replaced it.
- Releasing: `git push origin --delete refs/claims/issue-42`.

## Claim lifecycle

```
status:ready
   │  claims.mjs claim
   ▼
status:claimed  ── heartbeat every 15 min ──┐
   │                                        │
   │  pull request opened                   │
   ▼                                        │
status:in-review                            │
   │  merged                               │
   ▼                                        │
status:done  ── claims.mjs release ─────────┘
```

Lease default: 60 minutes. Heartbeat default: 15 minutes. An expired lease is reclaimable after the grace period (30 minutes).

## Commands

```bash
node scripts/claims.mjs list
node scripts/claims.mjs check --paths "apps/web/**"
node scripts/claims.mjs claim --issue 42 --agent alpha-1 --paths "apps/web/**"
node scripts/claims.mjs heartbeat --issue 42 --agent alpha-1
node scripts/claims.mjs release --issue 42 --agent alpha-1 --requeue
node scripts/claims.mjs gc --dry-run
```

## write_set rules

- Every task issue must declare at least one path glob.
- Claim conflict detection is conservative: patterns are compared by their literal prefix, so a broad pattern conflicts with everything beneath it. False conflicts are cheaper than concurrent writes.
- One issue has one primary area. Cross-area work is split into sub-issues.
- `packages/shared/**` is a frozen contract per milestone. Changing it requires an `type:rfc` issue and architect review.
- `pnpm-lock.yaml` belongs to dependency issues only.
- Database migrations: one agent at a time; file name `<timestamp>_<agent>_<slug>.sql`; applied migrations are immutable.

### Area ownership

| Area     | Paths                                                                                  | Label           |
| -------- | -------------------------------------------------------------------------------------- | --------------- |
| Web      | `apps/web/**`, `packages/ui/**`, `packages/editor/**`                                  | `area:web`      |
| Data     | `packages/db-engine/**`, `packages/permissions/**`                                     | `area:data`     |
| Import   | `packages/notion-import/**`, `apps/importer/**`                                        | `area:import`   |
| Collab   | `apps/collab/**`, `apps/worker/**`                                                     | `area:collab`   |
| Platform | `infra/**`, `scripts/**`, `.github/**`, `turbo.json`, `package.json`, `pnpm-lock.yaml` | `area:platform` |

## Labels

| Label                                                                  | Meaning                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `status:ready`                                                         | Available to claim                                                |
| `status:claimed`                                                       | Lease active                                                      |
| `status:blocked`                                                       | Waiting on a dependency or decision                               |
| `status:in-review`                                                     | Pull request open                                                 |
| `status:done`                                                          | Merged                                                            |
| `type:feat` `type:fix` `type:chore` `type:adr` `type:spike` `type:rfc` | Kind of work                                                      |
| `priority:p0` `priority:p1` `priority:p2`                              | Ordering                                                          |
| `risk:critical`                                                        | Permissions, migrations, CRDT, tenancy; requires architect review |

## Recovery

**Dead lease.** Wait for the grace period, then:

```bash
node scripts/claims.mjs gc --dry-run
node scripts/claims.mjs gc --apply
```

**Wrong issue taken.** Release with `--requeue`, then claim the correct one.

**Overlapping work discovered mid-task.** Stop. Comment on both issues. The agent holding the earlier claim continues; the other marks `status:blocked` and opens a dependency issue.

**`main` moved.** Rebase your own branch, re-run checks. Do not rebase another branch.

**Agent removed.** Delete its claim refs, and reassign or requeue its issues:

```bash
git push origin --delete refs/claims/issue-42
node scripts/claims.mjs release --issue 42 --agent <old-agent> --force --requeue
```

## Scaling beyond four agents

Up to roughly five agents, self-service claiming is fine. Beyond that, add a dispatcher that owns the queue and assigns issues to workers. Workers then stop selecting work themselves. A dispatcher removes almost all races and is easier to audit than a distributed lock.

## Rate limits

Do not poll GitHub more often than once per 60 seconds per agent. Use one API call per cycle where possible, and prefer `git` operations for claims because they do not consume the REST rate limit.
