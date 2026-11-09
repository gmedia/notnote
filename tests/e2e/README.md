# End-to-end tests

Playwright suites are added in Phase 1.

Initial critical flows:

1. Sign in through OIDC and switch workspace.
2. Create, rename, move, and delete a page.
3. Edit content, reload, and verify persistence.
4. Two users edit the same page and converge.
5. Import a synthetic Notion page and open the fidelity report.
6. Create a database, add rows, filter, sort, and reload.
7. Verify a guest cannot access an ungranted subtree.
