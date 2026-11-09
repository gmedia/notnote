# Contributing

## Workflow

1. Create a branch from `main`: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, or `docs/<scope>`.
2. Keep commits focused. Conventional commit messages are expected:
   - `feat(importer): map synced blocks to references`
   - `fix(permissions): deny grant must override inherited edit`
   - `chore(ci): cache pnpm store`
3. Open a pull request against `main`. The PR template lists the required checks.
4. All required checks must pass before merge. Squash merge only.

## Review requirements

Changes to the following paths require review from a code owner:

- `packages/permissions/`
- `packages/db-engine/`
- `packages/notion-import/`
- `apps/collab/`
- `infra/`
- `.github/`

## Agent workflow

Work is claimed through a Git ref lease, not an assignee. See [`AGENTS.md`](AGENTS.md) and [`docs/agents/coordination.md`](docs/agents/coordination.md).

```bash
node scripts/claims.mjs claim --issue 42 --agent alpha-1 --paths "packages/notion-import/**"
node scripts/claims.mjs heartbeat --issue 42 --agent alpha-1
node scripts/claims.mjs release --issue 42 --agent alpha-1
```

Agent branches must be named `agent/<agent-id>/<issue>-<slug>` and the pull request body must contain `Closes #<issue>`. The `Claim check` workflow rejects files outside the declared `write_set`.

## External contributions

The repository is public for inspection, but the license is source-available and does not grant commercial use. External pull requests are accepted only with a signed Contributor License Agreement. Open an issue first if you want to propose a change.

## Quality gates

Every pull request must pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Changes to the permission model, CRDT persistence, database schema, or import engine must include tests that can fail. Do not lower a gate to make a pull request pass.

## Licensing

This repository is proprietary. Do not add third-party code unless its license is on the approved list (MIT, BSD, Apache-2.0, MPL-2.0). GPL, AGPL, SSPL, BSL, and source-available non-commercial licenses require written approval and an SBOM entry.

External contributions require a signed Contributor License Agreement before merge. Do not accept code without it.
