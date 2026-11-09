# Agent Operating Rules

This repository is worked on by multiple automated agents in parallel. These rules exist so that agents do not overwrite each other. Follow them literally.

## Identity

- Every agent instance has a unique `AGENT_ID` (for example `alpha-1`).
- Every agent uses its own GitHub token. Do not share tokens between agents.
- State your identity in three places: the branch name, `claim.json`, and the `Agent:` commit trailer.

## Work selection

1. Pick an issue labelled `status:ready`.
2. Skip issues whose `Depends on` is not `status:done`.
3. Skip issues whose `write_set` overlaps an active claim.
4. If nothing is available, stop. Do not invent work and do not start on `status:blocked` issues.

When a dispatcher is running, an issue may already be claimed for you. In that case `claim` refreshes your own lease instead of failing. See [`docs/agents/dispatcher.md`](docs/agents/dispatcher.md).

## Claim before you code

A claim is a Git ref, not an assignee field. Assignees and labels are advisory; the ref is the lock.

```bash
node scripts/claims.mjs claim --issue 42 --agent "$AGENT_ID" \
  --paths "packages/notion-import/**,apps/importer/**"
```

- A failed push means the issue is already claimed. Choose another issue. Do **not** retry-steal a live claim.
- Claims expire after 60 minutes. Send a heartbeat every 15 minutes while working.
- Release the claim when the pull request merges, or when you abandon the issue.

## Isolation

- Work in a separate worktree, never in a shared checkout:

  ```bash
  git worktree add ../worktrees/$AGENT_ID/42 -b agent/$AGENT_ID/42-notion-block-mapping origin/main
  ```

- One issue, one branch, one pull request.
- Stay inside your declared `write_set`. If you need another path, update the claim first.

## Commits

- Branch: `agent/<agent-id>/<issue>-<slug>`.
- Commit trailer:

  ```
  Agent: alpha-1
  Issue: #42
  ```

- Do not amend, rebase, or force-push a branch you do not own.
- Do not push to `main`. Pull requests only.

## Pull requests

- Title: `<type>(<scope>): <summary>`, for example `feat(importer): map synced blocks`.
- Body must contain `Closes #42`.
- All checks must pass: `Lint, typecheck, test, build` and `Review gate`.
- Do not merge your own pull request.
- One pull request per issue. Unrelated fixes become a new issue.

## Review

Pull requests are reviewed by the `reviewer` agent, not by the author.

```bash
node scripts/review.mjs --pr 20 --comment
```

The reviewer posts one comment starting with `<!-- notnote-review -->` and applies `review:pass` or `review:changes`. The mechanical part is enforced by CI; the reviewer judges design, test quality, and honest scope.

A `review:changes` verdict is a blocker. Fix the branch, push, and the gate re-runs. Do not argue with a mechanical finding; fix it or escalate with evidence.

## Hard rules

- Never commit real Notion exports, customer data, tokens, or `dist/` output.
- Never disable a check, skip a test, or add `any` / `@ts-ignore` / `@ts-expect-error` to make a build pass.
- Never edit a database migration that has already been applied.
- Never edit `pnpm-lock.yaml` unless the issue is a dependency change. Regenerate it, never hand-merge it.
- Never modify another agent's branch, worktree, or claim.
- Never lower a security or license control.

## Conflicts

- Overlapping `write_set`: the earlier live claim wins. The later agent backs off.
- `main` moved: rebase your own branch and re-run the checks.
- Two agents need the same file: the second agent opens a dependency issue and marks itself `status:blocked`.

## Escalation

- Blocked longer than 30 minutes: comment with the exact blocker and the failing output, apply `status:blocked`, release the claim.
- Lease under 15 minutes remaining: heartbeat or release.
- Never leave work with no status. A silent agent is treated as a dead claim.

## Coordination reference

See [`docs/agents/coordination.md`](docs/agents/coordination.md) for the claim protocol, label taxonomy, and recovery procedures.
See [`docs/agents/dispatcher.md`](docs/agents/dispatcher.md) for assignment policy.
Agent definitions live in [`.opencode/agent/worker.md`](.opencode/agent/worker.md) and [`.opencode/agent/reviewer.md`](.opencode/agent/reviewer.md).
