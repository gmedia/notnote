# Security Policy

## Reporting a vulnerability

Do **not** open a public issue for security problems.

Use GitHub's private vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Select **Advisories**.
3. Click **Report a vulnerability**.

Include reproduction steps, affected components, and impact. You will receive an acknowledgement within two business days.

## Handling sensitive data

- Never commit real Notion exports, customer content, access tokens, or database dumps.
- Import fixtures must be synthetic or fully redacted.
- Real migration artifacts belong in encrypted object storage with restricted access, not in Git.
- Secrets must be injected at runtime. `.env*` files are ignored by default.

## Supported versions

The project is pre-release. Security fixes are applied to the `main` branch only until the first stable release.
