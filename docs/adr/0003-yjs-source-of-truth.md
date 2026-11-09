# ADR-003: Yjs is the source of truth for page content

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Page content changes continuously during collaborative editing. Persisting each edit directly into a relational block table creates write amplification, projection races, and conflicts with the CRDT merge order.

## Decision

- Each page is a Yjs document.
- The durable update log lives in Postgres (`doc_updates`). Redis is transport and cache only and may be lost without data loss.
- Snapshots are written to object storage with a two-phase commit: write and verify the object, then advance the page snapshot pointer.
- A per-document lease with a fencing token prevents two collaboration servers from writing snapshots concurrently.
- The `blocks` table is a **projection** for search, export, and permission checks. It is rebuildable and never wins over the Yjs snapshot.

Yjs updates are commutative and idempotent. Duplicate updates are ignored, not rejected. There is no global "out-of-order" rejection.

## Consequences

- Page content survives Redis failure and collaboration server restarts.
- The projection worker must be idempotent and guarded by the snapshot version.
- Rebuilding projections is required after schema changes and must be tested.
