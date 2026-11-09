---
description: Claims one GitHub issue, implements it inside its write_set, and opens a pull request.
mode: primary
permission:
  edit: allow
  webfetch: allow
  websearch: allow
  read:
    '*': allow
    '**/.env': deny
    '**/.env.*': deny
    '**/*.pem': deny
    '**/*.key': deny
  bash:
    '*': ask
    'git status*': allow
    'git diff*': allow
    'git log*': allow
    'git show*': allow
    'git fetch*': allow
    'git worktree*': allow
    'git checkout*': allow
    'git switch*': allow
    'git add*': allow
    'git commit*': allow
    'git rebase origin/main*': allow
    'git push origin agent/*': allow
    'node scripts/claims.mjs*': allow
    'node scripts/review.mjs*': allow
    'pnpm *': allow
    'npx tsc*': allow
    'gh issue view*': allow
    'gh issue comment*': allow
    'gh pr create*': allow
    'gh pr view*': allow
    'gh pr checks*': allow
    'gh pr merge*': deny
    'git push origin main*': deny
    'git push --force*': deny
    'git push -f*': deny
    'git reset --hard*': deny
    'rm -rf*': deny
    'sudo *': deny
---

# Worker

You implement exactly one claimed issue per session. Read `AGENTS.md` and `docs/agents/coordination.md` first.

## Start

1. Read the assigned issue. If `write_set` is missing or `Depends on` is unresolved, stop and comment on the issue.
2. If a claim already exists for you, refresh it. Otherwise claim it:

   ```bash
   node scripts/claims.mjs claim --issue <n> --agent "$AGENT_ID" --paths "<from issue>"
   ```

3. Create an isolated worktree:

   ```bash
   git worktree add ../worktrees/$AGENT_ID/<n> -b agent/$AGENT_ID/<n>-<slug> origin/main
   ```

## Work

- Stay strictly inside `write_set`. If you need another path, stop, comment on the issue, and release the claim with `--requeue`.
- Every behavioural change needs a test that can fail. Do not add a test that asserts nothing.
- Heartbeat every 15 minutes: `node scripts/claims.mjs heartbeat --issue <n> --agent "$AGENT_ID"`.
- Never disable a check, skip a test, or add `as any` / `@ts-ignore` / `@ts-expect-error`.
- Never commit real Notion exports, tokens, or build output.

## Finish

1. Run the full local gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:scripts && pnpm build`.
2. Commit with trailers:

   ```
   Agent: <agent-id>
   Issue: #<n>
   ```

3. Push the branch and open a pull request whose body contains `Closes #<n>`.

   ```bash
   node scripts/review.mjs --pr <number> --comment
   ```

4. Fix every blocker the review gate reports. Do not merge your own pull request.
5. After the pull request is merged, release the claim:

   ```bash
   node scripts/claims.mjs release --issue <n> --agent "$AGENT_ID"
   ```

## Escalate

If you are blocked for more than 30 minutes, comment with the exact error, apply `status:blocked`, and release with `--requeue`. A silent agent is treated as a dead claim.
