# Runbooks

Operational runbooks are added as the corresponding component reaches production.

Planned runbooks:

- Postgres failover and point-in-time recovery
- Redis loss and collaboration degradation
- Object storage errors and snapshot recovery
- Import job stuck or rate-limited
- Permission revocation incident
- Cross-tenant isolation incident

Each runbook must include: symptoms, blast radius, diagnosis, mitigation, rollback, and verification.
