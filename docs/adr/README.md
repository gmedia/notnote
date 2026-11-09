# Architecture Decision Records

Format: context, decision, consequences. Status values: `Proposed`, `Accepted`, `Superseded`.

| ID      | Decision                                                                 | Status   |
| ------- | ------------------------------------------------------------------------ | -------- |
| ADR-001 | Editor: TipTap 3 + ProseMirror                                           | Accepted |
| ADR-002 | CRDT: Yjs + Hocuspocus                                                   | Accepted |
| ADR-003 | Page content source of truth: Yjs snapshot + durable update log          | Accepted |
| ADR-004 | Database source of truth: Postgres, not CRDT                             | Accepted |
| ADR-005 | View query engine: compile view config to SQL                            | Accepted |
| ADR-006 | Authorization: server-authoritative ACL                                  | Accepted |
| ADR-007 | Import: hybrid Notion API + HTML export, 3-pass load                     | Accepted |
| ADR-008 | Tenancy: shared schema, `workspace_id`, Postgres RLS                     | Accepted |
| ADR-009 | Language: TypeScript end to end                                          | Accepted |
| ADR-010 | Repository: pnpm workspaces + Turborepo monorepo                         | Accepted |
| ADR-011 | Files: S3-compatible storage, presigned URLs, isolated antivirus service | Accepted |
| ADR-012 | Search: Postgres full-text search first, OpenSearch later                | Accepted |
| ADR-013 | Identity: OIDC abstraction, Keycloak self-host, Ory for SaaS             | Accepted |
| ADR-014 | Formula: allowlisted AST compiled to SQL, batch worker fallback          | Accepted |
| ADR-015 | Version history: separate operational and history snapshots              | Accepted |

## Seed records

- [ADR-001](0001-editor-tiptap.md)
- [ADR-003](0003-yjs-source-of-truth.md)
- [ADR-007](0007-hybrid-notion-import.md)
- [ADR-008](0008-tenancy-rls.md)

Remaining records are tracked in the internal build plan and will be added as implementation starts.
