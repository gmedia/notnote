# ADR-001: Editor uses TipTap 3 on ProseMirror

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The product needs a block-based editor with nested nodes, inline marks, tables, columns, mentions, and real-time collaboration. Building an editor from scratch would consume the majority of the schedule and is not the differentiator.

## Decision

Use TipTap 3 on top of ProseMirror. The editor schema lives in `packages/editor`. Collaboration binds through Yjs. Extensions must be MIT-licensed; paid TipTap Pro extensions require a commercial license and are not part of the initial scope.

## Consequences

- Mature ecosystem, strong schema customization, and first-class Yjs integration.
- Every custom node needs a schema definition, a renderer, a parser, and a serializer for import/export. This is tracked as part of the import contract.
- Upgrading TipTap major versions is a planned migration, not an automatic dependency bump.
