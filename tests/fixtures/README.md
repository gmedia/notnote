# Test fixtures

Only **synthetic or fully redacted** fixtures belong here.

Never commit a real Notion export, customer page, database dump, attachment, or access token. Real migration artifacts must stay in encrypted object storage with restricted access.

Fixture categories to add during Phase 0:

- `pages/` — nested pages covering every supported block type
- `databases/` — properties, relations, rollups, formulas, views
- `comments/` — resolved and unresolved threads
- `files/` — attachments with checksums
- `unsupported/` — blocks without a native mapping

Each fixture needs an expected fidelity report so regressions are detectable.
