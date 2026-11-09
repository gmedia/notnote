# ADR-007: Hybrid Notion import (API + HTML), 3-pass load

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Markdown and CSV exports flatten the Notion block graph. In practice this destroys relational databases: relations become text, rollups and formulas become frozen values, views disappear, and property types cannot be reconstructed. Importers built on Markdown/CSV therefore produce the formatting damage that motivates this product.

The official Notion API exposes the block tree, property schemas, relation IDs, timestamps, and views. It does not expose page history, permissions, backlinks, or resolved comments. The HTML export carries rendered formatting, attachments, and comment threads.

## Decision

Use both sources, with a clear division of responsibility:

| Source      | Responsibility                                                        |
| ----------- | --------------------------------------------------------------------- |
| Notion API  | Block structure, database schema, rows, relations, views, timestamps  |
| HTML export | Formatting fallback, attachments, comments, unsupported block content |
| CSV export  | Fallback only; never the primary source for relational data           |

The pipeline is:

```
inventory → extract → normalize (IR) → map IDs → load (3 pass) → verify → report
```

- **Pass 1** creates containers: pages, databases, data sources, properties, views, rows.
- **Pass 2** writes content: blocks, rich text, files, comments, mentions.
- **Pass 3** resolves references: relations, rollups, formulas, synced block references, view filters.
- The loader is idempotent and checkpointed per object.
- Raw payloads are stored content-addressed so a run can be replayed without calling Notion again.
- Delta sync uses manifest diff plus content and schema hashes. `last_edited_time` alone is insufficient because it cannot detect deletions, reordering, or schema changes.
- Every run produces a fidelity report. Placeholders are reported separately and never counted as native coverage.

## Consequences

- Higher fidelity than any Markdown/CSV importer, at the cost of a more complex pipeline.
- Rate limits (3 requests/second per integration) make large migrations take hours to days; jobs must be resumable.
- File URLs expire after roughly one hour, so assets are downloaded during extraction and stored with checksums.
- Some data remains unmigratable: page history, permissions, backlinks, and notifications. This must be communicated up front, not discovered after cutover.
