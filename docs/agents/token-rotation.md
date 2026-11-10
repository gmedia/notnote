# GitHub credential rotation

Every agent needs its own GitHub credential, scoped to this repository. This document covers why, how to rotate safely, and how to verify the result.

## Why default `gh auth login` credentials are wrong for agents

`gh auth login` issues an **OAuth app token** with the prefix `gho_`. That token is:

- scoped to the **whole account**, not one repository;
- carrying `repo`, `gist`, `read:org`, and usually `admin:public_key`;
- long-lived and not reviewable per repository;
- impossible to restrict after the fact.

`admin:public_key` is the dangerous one. A leaked token with that scope can add an SSH key to the account, which grants push access to every repository the account can reach. For an agent running unattended on a shared host, that is an account takeover path.

A **fine-grained personal access token** (`github_pat_…`) fixes this: it is bound to one repository, has an explicit permission list, and an expiry date.

## Token type comparison

| Type                              | Prefix        | Scope                                | Suitable for an agent |
| --------------------------------- | ------------- | ------------------------------------ | --------------------- |
| OAuth app token (`gh auth login`) | `gho_`        | Whole account                        | No                    |
| Classic PAT                       | `ghp_`        | Selected scopes, all repositories    | No                    |
| Fine-grained PAT                  | `github_pat_` | One repository, explicit permissions | Yes                   |
| GitHub App installation token     | `ghs_`        | One installation, 1 hour             | Best, for later       |

## Required permissions per agent

Repository access: **only** `gmedia/notnote`.

| Permission      | alpha-1 (import) | beta-1 (web) | gamma-1 (data) | delta-1 (platform) |
| --------------- | ---------------- | ------------ | -------------- | ------------------ |
| Metadata        | read             | read         | read           | read               |
| Contents        | read/write       | read/write   | read/write     | read/write         |
| Issues          | read/write       | read/write   | read/write     | read/write         |
| Pull requests   | read/write       | read/write   | read/write     | read/write         |
| Checks          | read             | read         | read           | read               |
| Commit statuses | read             | read         | read           | read               |
| Actions         | read             | read         | read           | read               |
| Workflows       | —                | —            | —              | read/write         |
| Administration  | —                | —            | —              | —                  |
| Secrets         | —                | —            | —              | —                  |

`Workflows` is needed only by the agent that may change `.github/workflows/`. Do not grant it to the others.

Set an expiry. Ninety days is a reasonable default; rotate on schedule rather than after an incident.

## Do not trust the repository `permissions` object

`GET /repos/{owner}/{repo}` returns a `permissions` object with `admin`, `push`, and `maintain`. Those flags describe **the authenticated user's role in the organisation**, not what the token may do. An owner's read-only fine-grained token still reports `admin: true`.

The same trap exists for `PATCH` on a non-existent issue or pull request: it returns `404 Not Found` even when the token has no write permission there, because the not-found check runs before authorisation.

Verify capability by **acting**, with a payload that cannot succeed:

| Capability          | Probe                                             | Authorised | Denied |
| ------------------- | ------------------------------------------------- | ---------- | ------ |
| Metadata read       | `GET /repos/{repo}`                               | 200        | 403    |
| Contents write      | `POST /git/refs` with an invalid ref and zero SHA | 400/422    | 403    |
| Issues write        | `POST /issues` with `{}`                          | 400/422    | 403    |
| Pull requests write | `POST /pulls` with `{}`                           | 400/422    | 403    |
| Actions read        | `GET /actions/workflows`                          | 200        | 403    |
| Administration read | `GET /actions/permissions`                        | 200        | 403    |

An invalid payload cannot mutate anything: the request fails validation before it is applied. Confirm with `GET /git/refs` before and after if you want proof.

A token missing `Contents`, `Issues`, or `Pull requests` write is unusable for an agent: it cannot claim a branch, label an issue, or open a pull request, even though `git push` over SSH still works because push uses the SSH key, not the token.

## When the host credential is shared with other work

Not every host exists to run this project. If `gh` on a machine is also used for unrelated repositories, a token scoped to `gmedia/notnote` alone breaks that work. Forcing a single-repository token there is the wrong trade.

`gh` needs very little for general use:

| Scope      | Needed for                                    |
| ---------- | --------------------------------------------- |
| `repo`     | repositories, issues, pull requests, contents |
| `read:org` | listing organisations and teams               |
| `gist`     | `gh gist`                                     |
| `workflow` | pushing changes to `.github/workflows/`       |

`admin:public_key` is requested by `gh auth login` because it enables `gh ssh-key add`. Drop it unless you actually add keys through `gh` — you can manage keys in the browser instead.

Everything else is not required for `gh` to work, and is dangerous on a token that an unattended agent can read out of a config file:

| Scope                                                                                                                      | Why it is not worth keeping                |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `admin:org`, `admin:enterprise`                                                                                            | change organisation or enterprise settings |
| `admin:org_hook`, `admin:repo_hook`                                                                                        | create webhooks that exfiltrate events     |
| `admin:gpg_key`, `admin:ssh_signing_key`                                                                                   | add account-level keys                     |
| `delete:packages`, `write:packages`                                                                                        | package deletion and publication           |
| `audit_log`                                                                                                                | read the organisation audit log            |
| `codespace`, `copilot`, `project`, `user`, `notifications`, `discount`, `write:discussion`, `write:network_configurations` | unrelated to repository work               |

A trimmed classic token with `repo`, `read:org`, `gist`, and `workflow` is a reasonable middle ground: it still cannot do organisation or account damage if leaked, and it keeps working across repositories.

### Declaring a deliberate choice

The verifier accepts a classic token when the roster says it is expected, and accepts a residual risk when you name it and give a reason:

```json
{
  "id": "alpha-1",
  "host": "local",
  "tokenClass": "classic",
  "acceptedRisks": [
    {
      "rule": "ssh-key-write",
      "reason": "shared general-purpose gh credential on this host; scopes tracked in #21"
    }
  ]
}
```

- `tokenClass: "classic"` removes the `token-class` blocker and raises `classic-token` as a warning instead.
- An accepted risk is downgraded to level `accepted`, rendered with `~` and its reason. It is never hidden.
- An acceptance without a non-empty `reason` is rejected when the roster loads.
- A result made only of accepted risks reports status `accepted`, which `--gate` allows. Any remaining warning or blocker still fails the gate, so acceptance cannot be used to silence an unrelated problem.

Accept only what you cannot fix. `ssh-key-write` is unavoidable on a classic token that carries `admin:public_key`; `admin:ssh_signing_key` is not, because `gh` does not need it.

### What scoping cannot fix, and what does

If a host token is a person's general-purpose credential, the agent inherits that person's entire reach. No permission list changes that. Two options actually reduce the blast radius:

1. **A separate machine identity.** Create a dedicated account for agents, grant it access to the repositories agents need, and issue its tokens. Revoking the agent does not disturb human work, and the audit trail finally distinguishes them. This is the only option that fixes attribution, which is currently impossible because all four hosts authenticate as the same account.
2. **Deploy keys for git.** `git push` uses SSH, not the token. A per-host SSH deploy key with write access to `gmedia/notnote` only means that even a broad API token cannot be used to push to the other 55 repositories. The API token stays for `gh` work; the push path is repository-scoped.

Option 2 is cheap and can be done today. Option 1 is the real fix and should be scheduled before external customers.

## Rotation order

Rotating in the wrong order locks the agents out or leaves a window where the old credential is still live.

```
1. Create the four fine-grained tokens            (GitHub UI, one per agent)
2. Install each token on its own host             (gh auth login --with-token)
3. Verify with scripts/verify-tokens.mjs           (must be pass)
4. Revoke the old OAuth authorization              (GitHub UI, once)
5. Revoke and re-issue SSH keys per host           (optional but recommended)
6. Purge leaked strings from transcripts/history   (grep + redact)
7. Re-run the verifier                             (must still be pass)
```

Step 3 must pass before step 4. The old token is the rollback path.

## Create a fine-grained token

GitHub does not expose an API for creating personal access tokens, so this step is manual by design.

1. Open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it after the agent: `notnote-agent-alpha-1`.
3. Expiration: 90 days.
4. Resource owner: the organisation that owns the repository.
5. Repository access: **Only select repositories** → `gmedia/notnote`.
6. Permissions: use the matrix above.
7. Generate, then copy the token once. It is not shown again.

Repeat for each agent. Do not reuse one token across hosts; that defeats the entire model.

## Install on a host

Never put the token on the command line; it lands in shell history and process listings.

```bash
# read the token from stdin, not from an argument
read -rsp 'token: ' GH_TOKEN_INPUT; echo
printf '%s' "$GH_TOKEN_INPUT" | gh auth login --hostname github.com --with-token
unset GH_TOKEN_INPUT
gh auth setup-git
gh auth status
```

`gh auth login --with-token` replaces the stored credential for that host. The previous token stops being used immediately but remains valid on GitHub until revoked.

If a host must keep the token outside `gh`, write it to a `600` file and export it at runtime:

```bash
install -m 600 /dev/null "$HOME/.config/notnote/agent.env"
printf 'GH_TOKEN=%s\n' "$GH_TOKEN_INPUT" > "$HOME/.config/notnote/agent.env"
```

Do not commit that file, and do not add it to a shell profile that is world-readable.

## Verify

```bash
cp docs/agents/agents.local.example.json agents.local.json   # gitignored
$EDITOR agents.local.json                                     # fill in hosts
node scripts/verify-tokens.mjs --map agents.local.json
```

The verifier reports, per agent:

| Signal                        | Severity     | Meaning                                                                        |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `token-class`                 | blocker      | Token is OAuth or classic instead of fine-grained                              |
| `no-credential`               | blocker      | No token found on the host                                                     |
| `repo-push`                   | blocker      | Token cannot read repository traffic, which requires push                      |
| `contents-write`              | blocker      | Token cannot write contents; HTTPS push, branch deletion, and API commits fail |
| `issues-write`                | blocker      | Token cannot claim, label, or comment                                          |
| `pulls-write`                 | blocker      | Token cannot open or update pull requests                                      |
| `ssh-key-write`               | blocker      | Token can add an SSH key to the account; account takeover                      |
| `scope:admin:public_key`      | blocker      | Scope lets the token add an SSH key to the account                             |
| `scope:admin:ssh_signing_key` | blocker      | Scope lets the token add a signing key to the account                          |
| `identity`                    | blocker      | Authenticated as the wrong account                                             |
| `shell-history`               | blocker      | Credential-like string found in shell history                                  |
| `administration`              | warning      | Token can read repository administration                                       |
| `broad-scope`                 | warning      | Token carries enterprise, organisation, or package scopes                      |
| `shared-ssh-key`              | warning      | The same SSH key is present on more than one host                              |
| `transcript-exposure`         | warning      | Credential-like string found in session transcripts                            |
| `actions-read`                | inconclusive | Workflow listing is public here, so a 200 proves nothing                       |

## A public repository breaks naive probes

This repository is public. `GET /repos/{repo}` and `GET /repos/{repo}/actions/workflows` return `200` **without any token**, so a token with zero permissions still appears to pass a read check.

The verifier therefore sends every read probe twice, once with the token and once anonymously. If both return the same status the result is reported as `inconclusive`, not `pass`. Push capability is measured on `GET /repos/{repo}/traffic/views` instead, because traffic is never public: anonymous gets `401`, a token without push gets `403`, and a token with push gets `200`.

Do not add a read probe on a public endpoint as a health check. It cannot fail.

## A classic token cannot be scoped, and that is the problem

`ghp_` tokens have no repository scope. The only choice is "every repository the account can reach" or nothing. Trimming the permission list lowers some risk but cannot confine the token to this repository.

A classic token with the default broad selection carries scopes that are irrelevant to agent work and dangerous if the token leaks:

| Scope                               | Capability                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `admin:public_key`                  | Add an SSH key to the account, which grants push to every reachable repository |
| `admin:ssh_signing_key`             | Add a signing key to the account                                               |
| `admin:org`                         | Change organisation membership and settings                                    |
| `admin:enterprise`                  | Change enterprise settings                                                     |
| `admin:org_hook`, `admin:repo_hook` | Create webhooks that exfiltrate events                                         |
| `delete:packages`, `write:packages` | Delete or publish packages                                                     |
| `audit_log`                         | Read the organisation audit log                                                |

The verifier proves this rather than assuming it: it sends `POST /user/keys` with an invalid key. A `422` means the token is authorised to add a key, and the check reports `ssh-key-write` as a blocker. The invalid payload cannot create anything, so the account key count is unchanged.

Measured on a token of this shape: 56 repositories reachable, 2 account keys readable, and `POST /user/keys` authorised. That is account takeover material, not repository access.

`--gate` exits non-zero on any warning or blocker, for use in CI or a pre-flight check. `--json` emits machine-readable output.

The verifier never prints a token. It prints an 11-character prefix and a truncated SHA-256 fingerprint, which is enough to confirm that two hosts hold different credentials.

## Revoke the old credentials

After the verifier passes:

1. **Settings → Applications → Authorized OAuth Apps → GitHub CLI → Revoke.**
2. Confirm that every host still authenticates: `gh auth status` and `node scripts/verify-tokens.mjs`.
3. Remove stale entries from `~/.config/gh/hosts.yml` on hosts you decommission.

> Revoking the GitHub CLI OAuth app revokes **every** `gho_` token issued through it for that account. That is why step 3 must pass first: after revocation, a host without a fine-grained token has no credential at all.

Revocation is not available through the API for personal access tokens. Fine-grained tokens are revoked individually from the same settings page.

## SSH keys are a separate credential

Git operations in this repository use SSH, not the API token. Rotating tokens does not rotate push access.

Check for a shared key:

```bash
node scripts/verify-tokens.mjs --map agents.local.json   # shared-ssh-key warning
```

If several hosts report the same fingerprint, they share one identity: a compromise of any one grants push to everything that key can reach. Fix it by issuing a distinct key per host and registering each as a **deploy key** with write access on this repository only. Deploy keys are repository-scoped and cannot touch other repositories.

```bash
ssh-keygen -t ed25519 -C "notnote-$(hostname)-$(date +%Y%m)" -f "$HOME/.ssh/notnote_ed25519" -N ''
gh repo deploy-key add "$HOME/.ssh/notnote_ed25519.pub" --allow-write --title "notnote-$(hostname)"
```

Then point the remote at that key:

```bash
git config core.sshCommand "ssh -i $HOME/.ssh/notnote_ed25519 -o IdentitiesOnly=yes"
```

Remove the old account-level key from **Settings → SSH and GPG keys** once every host is migrated.

## Purge leaked strings

Agent sessions and shells can capture a credential in logs. After rotating, remove the old strings:

```bash
# count first, never print the value
grep -rhoE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}' \
  "$HOME/.claude/transcripts" 2>/dev/null | wc -l

# redact in place, keeping the surrounding record
grep -rlE 'gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}' \
  "$HOME/.claude/transcripts" 2>/dev/null |
  xargs -r sed -i -E 's/(gho_|ghp_|github_pat_)[A-Za-z0-9_]{20,}/[REDACTED]/g'
```

Clear shell history entries that contain a token, and prefer `read -rs` over arguments in future commands.

## Rotation checklist

- [ ] Four fine-grained tokens created, one per agent, 90-day expiry
- [ ] Each token scoped to `gmedia/notnote` only
- [ ] `Workflows` granted to the platform agent and nobody else
- [ ] Token installed on the correct host via stdin, not an argument
- [ ] `node scripts/verify-tokens.mjs` reports `fail=0`
- [ ] Old OAuth authorization revoked
- [ ] Verifier re-run after revocation, still `fail=0`
- [ ] SSH keys unique per host, registered as deploy keys
- [ ] Leaked strings redacted from transcripts and history
- [ ] `agents.local.json` present locally and gitignored
