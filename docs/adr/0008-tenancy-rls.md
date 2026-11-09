# ADR-008: Shared-schema tenancy with row-level security

- **Status:** Accepted (pending threat-model sign-off before Phase 0 exit)
- **Date:** 2026-11-09

## Context

The product must serve 500–1,000 seats internally and later multiple commercial tenants. Schema-per-tenant is expensive to operate at small and medium tenant sizes; a single shared schema is simpler but makes cross-tenant leakage a critical risk.

## Decision

- Shared schema. Every tenant-owned table carries `workspace_id`.
- Composite foreign keys include `workspace_id`, so a row cannot reference another workspace's page, database, or data source.
- Postgres row-level security is enabled on every tenant table.
- Each transaction sets `SET LOCAL app.workspace_id`. Connection pooling must use **session mode** or a dedicated role per request path; transaction pooling with shared sessions is not allowed.
- Background workers and the importer use separate database roles with explicit workspace context; no role bypasses RLS silently.
- Enterprise customers may be offered a dedicated database. That is a deployment variation, not a different schema model.

## Consequences

- Cross-workspace access requires an explicit RLS bypass that is audited and tested.
- Testing must include cross-tenant and IDOR cases (100+ automated cases).
- Adding a tenant table without `workspace_id` and an RLS policy is a review failure.
