# NotNote

Collaborative workspace with pages and relational databases, designed for **high-fidelity migration from Notion**.

> **Status:** Phase 0 (foundation). Not production-ready. The repository currently contains the monorepo skeleton, shared domain types, and the import-mapping contract. Application runtimes are added per phase.

## Why

Teams leaving Notion lose data because most importers consume Markdown/CSV exports, which cannot represent database schemas, relations, rollups, formulas, or views. NotNote treats migration as a first-class product capability:

- **Pages and formatting** come from the Notion HTML export.
- **Databases, properties, relations, and views** come from the official Notion API.
- Every import produces a **fidelity report** with native coverage, placeholder rate, broken links, and unsupported features.
- CSV is a fallback, never the primary source for relational data.

## Repository layout

```
apps/
  web/          Next.js web client
  api/          REST API and application services
  collab/       Real-time collaboration server (Yjs)
  worker/       Background jobs: projection, search, export
  importer/     Notion migration CLI and service
packages/
  shared/       Domain types, schemas, errors
  editor/       Editor schema and block registry
  db-engine/    Property types, view compiler, formula
  permissions/  Authorization evaluator
  notion-import/ Notion extractor, IR, mapper, loader, verifier
  ui/           Design system
  sdk/          Public API client
docs/
  adr/          Architecture decision records
  runbooks/     Operational runbooks
tests/
  e2e/          Playwright suites
  load/         k6 suites
  fixtures/     Synthetic import fixtures (never real customer data)
infra/
  docker/       Local development compose files
  helm/         Self-host chart
```

## Requirements

- Node.js 24+
- pnpm 12+ (`corepack enable`)
- Docker (for Postgres, Redis, and object storage in later phases)

## Quickstart

```bash
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Scripts

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `pnpm build`     | Build every workspace package with Turborepo |
| `pnpm dev`       | Run development tasks in parallel            |
| `pnpm typecheck` | Type-check every package                     |
| `pnpm test`      | Run unit tests                               |
| `pnpm lint`      | Check formatting with Prettier               |
| `pnpm format`    | Format the repository                        |
| `pnpm clean`     | Remove build output and dependencies         |

## Architecture decisions

See [`docs/adr/`](docs/adr/README.md). Key decisions:

- **ADR-001** — TipTap/ProseMirror for the editor (MIT).
- **ADR-003** — Yjs is the source of truth for page content; the SQL block table is a projection.
- **ADR-004** — Postgres is the source of truth for database rows.
- **ADR-007** — Hybrid Notion API + HTML import, not Markdown/CSV.
- **ADR-008** — Shared schema with `workspace_id` and row-level security.

## Non-goals (until Phase 5)

Mobile apps, offline editing, AI writing/agents, timeline/calendar/gallery views, automations, public page publishing.

## Security

Report vulnerabilities through GitHub private security advisories. See [`SECURITY.md`](SECURITY.md). Never commit real Notion exports or customer data to this repository.

## License

Proprietary. All rights reserved. See [`LICENSE`](LICENSE).
