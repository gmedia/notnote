# Infrastructure

- `docker/` — local development compose files (Postgres, Valkey, object storage).
- `helm/` — self-host chart for enterprise deployments.

Self-host bundles must not include components with incompatible licenses. See `docs/adr/` and the license matrix in the internal build plan before adding a dependency to a distributed chart.
