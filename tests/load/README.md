# Load tests

k6 suites are added in Phase 3.

Targets:

- 500 concurrent editors with a defined distribution (per workspace and per document).
- 100,000-row database view with filter and sort, p95 under 300 ms for indexed properties.
- Import job throughput at the measured tier (small, medium, large).
- Collaboration reconnect storm after a server restart.

Every load test must state its distribution, dataset size, and hardware profile. A latency number without those is not a result.
