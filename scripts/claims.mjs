#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REF_ROOT = 'refs/claims/';
const DEFAULT_TTL_MINUTES = 60;
const DEFAULT_GRACE_MINUTES = 30;

function git(args, { input, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'notnote-claims',
        GIT_AUTHOR_EMAIL: 'claims@notnote.invalid',
        GIT_COMMITTER_NAME: 'notnote-claims',
        GIT_COMMITTER_EMAIL: 'claims@notnote.invalid',
      },
    }).trim();
  } catch (error) {
    if (allowFail) return null;
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    throw new Error(`git ${args[0]} failed: ${stderr || error.message}`);
  }
}

export function remote() {
  return process.env.CLAIM_REMOTE ?? 'origin';
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git(['remote', 'get-url', remote()], { allowFail: true }) ?? '';
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function gh(args) {
  try {
    execFileSync('gh', args, { stdio: 'ignore', env: process.env });
    return true;
  } catch {
    return false;
  }
}

export function syncLabels(issue, add, remove) {
  const repo = repoSlug();
  if (!repo) return false;
  const args = ['issue', 'edit', String(issue), '--repo', repo];
  for (const label of add) args.push('--add-label', label);
  for (const label of remove) args.push('--remove-label', label);
  return gh(args);
}

/**
 * Conflict detection compares patterns by their literal prefix before the first
 * wildcard. This is deliberately conservative: a broad pattern conflicts with
 * everything beneath it, and a false conflict is far cheaper than two agents
 * writing the same file.
 */
export function scopeOf(pattern) {
  const normalized = String(pattern).trim().replace(/^\.\//, '');
  const wildcard = normalized.search(/[*?[]/);
  const literal = wildcard === -1 ? normalized : normalized.slice(0, wildcard);
  return literal.replace(/\/+$/, '');
}

export function overlaps(a, b) {
  const left = scopeOf(a);
  const right = scopeOf(b);
  if (left === '' || right === '') return true;
  if (left === right) return true;
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function remoteRef(issue) {
  return `${REF_ROOT}issue-${issue}`;
}

function trackingRef(issue) {
  return `refs/remotes/${remote()}/claims/issue-${issue}`;
}

export function fetchClaims() {
  git(['fetch', '--prune', remote(), `+${REF_ROOT}*:refs/remotes/${remote()}/claims/*`], {
    allowFail: true,
  });
}

export function readClaim(issue) {
  const raw = git(['show', `${trackingRef(issue)}:claim.json`], { allowFail: true });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function claimSha(issue) {
  return git(['rev-parse', trackingRef(issue)], { allowFail: true });
}

export function listClaims() {
  fetchClaims();
  const refs = git(['for-each-ref', '--format=%(refname)', `refs/remotes/${remote()}/claims/`], {
    allowFail: true,
  });
  if (!refs) return [];
  const issues = refs
    .split('\n')
    .filter(Boolean)
    .map((ref) => Number(ref.split('-').pop()))
    .filter((issue) => Number.isInteger(issue) && issue > 0);
  return issues
    .map((issue) => ({ issue, claim: readClaim(issue) }))
    .filter((entry) => entry.claim !== null);
}

export function isExpired(claim, now = Date.now()) {
  const until = Date.parse(claim?.lease_until);
  return !Number.isFinite(until) || until <= now;
}

function nowIso() {
  return new Date().toISOString();
}

function leaseIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function commitClaim(claim) {
  const blob = git(['hash-object', '-w', '--stdin'], {
    input: `${JSON.stringify(claim, null, 2)}\n`,
  });
  const tree = git(['mktree'], { input: `100644 blob ${blob}\tclaim.json\n` });
  return git(['commit-tree', tree, '-m', `claim: issue #${claim.issue} (${claim.agent})`]);
}

function pushClaim(issue, claim, { expectSha } = {}) {
  const sha = commitClaim(claim);
  const args = ['push', remote(), `${sha}:${remoteRef(issue)}`];
  if (expectSha) args.splice(2, 0, `--force-with-lease=${remoteRef(issue)}:${expectSha}`);
  const result = git(args, { allowFail: true });
  if (result === null) return false;
  fetchClaims();
  return true;
}

export function activeConflicts(paths, { excludeIssue } = {}) {
  const conflicts = [];
  for (const { issue, claim } of listClaims()) {
    if (issue === excludeIssue) continue;
    if (isExpired(claim)) continue;
    for (const mine of paths) {
      for (const theirs of claim.write_set ?? []) {
        if (overlaps(mine, theirs)) {
          conflicts.push({ issue, agent: claim.agent, mine, theirs });
        }
      }
    }
  }
  return conflicts;
}

export function claimIssue({ issue, agent, paths, ttl = DEFAULT_TTL_MINUTES, branch = null }) {
  if (!Number.isInteger(issue) || issue <= 0) {
    return { ok: false, error: 'claim requires a positive issue number' };
  }
  if (!agent) return { ok: false, error: 'claim requires an agent id' };
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, error: 'claim requires at least one write_set path' };
  }
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return { ok: false, error: 'ttl must be a positive number of minutes' };
  }

  fetchClaims();
  const existing = readClaim(issue);
  const existingSha = claimSha(issue);
  let expectSha;

  if (existing) {
    if (!isExpired(existing)) {
      if (existing.agent !== agent) {
        return {
          ok: false,
          error: `issue #${issue} is held by ${existing.agent} until ${existing.lease_until}`,
          hint: 'Choose another issue. Do not steal a live claim.',
        };
      }
      const refreshed = {
        ...existing,
        heartbeat: nowIso(),
        lease_until: leaseIso(ttl),
        ttl_minutes: ttl,
      };
      if (!pushClaim(issue, refreshed, { expectSha: existingSha })) {
        return { ok: false, error: 'claim refresh lost a race; re-read before retrying' };
      }
      syncLabels(issue, ['status:claimed'], ['status:ready']);
      return { ok: true, claim: refreshed, refreshed: true };
    }
    expectSha = existingSha;
  }

  const conflicts = activeConflicts(paths, { excludeIssue: issue });
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: 'write_set overlaps an active claim',
      conflicts,
    };
  }

  const claim = {
    version: 1,
    issue,
    agent,
    branch: branch ?? null,
    write_set: paths,
    started_at: existing?.started_at ?? nowIso(),
    heartbeat: nowIso(),
    lease_until: leaseIso(ttl),
    ttl_minutes: ttl,
  };

  if (!pushClaim(issue, claim, { expectSha })) {
    return {
      ok: false,
      error: `failed to claim issue #${issue}`,
      hint: 'The ref already exists or was replaced. Re-read the claim list and pick another issue.',
    };
  }

  syncLabels(issue, ['status:claimed'], ['status:ready']);
  return { ok: true, claim, refreshed: false };
}

export function renewLease({ issue, agent, ttl }) {
  fetchClaims();
  const current = readClaim(issue);
  const sha = claimSha(issue);
  if (!current) return { ok: false, error: `no claim found for issue #${issue}` };
  if (current.agent !== agent) {
    return { ok: false, error: `issue #${issue} is held by ${current.agent}, not ${agent}` };
  }

  const effectiveTtl = ttl ?? current.ttl_minutes ?? DEFAULT_TTL_MINUTES;
  const next = {
    ...current,
    heartbeat: nowIso(),
    lease_until: leaseIso(effectiveTtl),
    ttl_minutes: effectiveTtl,
  };

  if (!pushClaim(issue, next, { expectSha: sha })) {
    return { ok: false, error: 'heartbeat failed: the claim changed under you' };
  }
  return { ok: true, claim: next };
}

export function releaseIssue({ issue, agent, requeue = false, force = false }) {
  fetchClaims();
  const current = readClaim(issue);
  if (!current) return { ok: true, released: false };
  if (current.agent !== agent && force !== true) {
    return {
      ok: false,
      error: `issue #${issue} is held by ${current.agent}; pass --force to release it`,
    };
  }

  const result = git(['push', remote(), '--delete', remoteRef(issue)], { allowFail: true });
  if (result === null) return { ok: false, error: `failed to delete claim for issue #${issue}` };
  fetchClaims();

  if (requeue) {
    syncLabels(issue, ['status:ready'], ['status:claimed', 'status:in-review']);
  } else {
    syncLabels(issue, ['status:done'], ['status:claimed', 'status:in-review']);
  }
  return { ok: true, released: true };
}

export function collectGarbage({ grace = DEFAULT_GRACE_MINUTES, apply = false } = {}) {
  const results = [];
  const now = Date.now();

  for (const { issue, claim } of listClaims()) {
    const until = Date.parse(claim.lease_until);
    if (Number.isFinite(until) && now < until + grace * 60_000) continue;

    if (!apply) {
      results.push({ issue, agent: claim.agent, expired: claim.lease_until, applied: false });
      continue;
    }

    const sha = claimSha(issue);
    const result = git(
      [
        'push',
        remote(),
        `--force-with-lease=${remoteRef(issue)}:${sha}`,
        '--delete',
        remoteRef(issue),
      ],
      { allowFail: true },
    );
    if (result !== null) syncLabels(issue, ['status:ready'], ['status:claimed']);
    results.push({
      issue,
      agent: claim.agent,
      expired: claim.lease_until,
      applied: result !== null,
    });
  }

  return results;
}

function parsePaths(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function describeConflicts(conflicts) {
  return conflicts
    .map((c) => `  #${c.issue} (${c.agent}): ${c.mine} overlaps ${c.theirs}`)
    .join('\n');
}

function runClaim(values) {
  const result = claimIssue({
    issue: Number(values.issue),
    agent: values.agent,
    paths: parsePaths(values.paths),
    ttl: Number(values.ttl ?? DEFAULT_TTL_MINUTES),
    branch: values.branch ?? null,
  });

  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    if (result.hint) process.stderr.write(`${result.hint}\n`);
    if (result.conflicts) process.stderr.write(`${describeConflicts(result.conflicts)}\n`);
    process.exit(1);
  }

  if (result.refreshed) process.stderr.write('claim already held by you; lease refreshed\n');
  process.stdout.write(`${JSON.stringify(result.claim, null, 2)}\n`);
}

function runHeartbeat(values) {
  const result = renewLease({
    issue: Number(values.issue),
    agent: values.agent,
    ttl: values.ttl ? Number(values.ttl) : undefined,
  });
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(result.claim, null, 2)}\n`);
}

function runRelease(values) {
  const result = releaseIssue({
    issue: Number(values.issue),
    agent: values.agent,
    requeue: values.requeue === true,
    force: values.force === true,
  });
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.stdout.write(
    result.released ? `released issue #${values.issue}\n` : `issue #${values.issue} has no claim\n`,
  );
}

function runCheck(values) {
  const paths = parsePaths(values.paths);
  if (paths.length === 0) {
    process.stderr.write('check requires --paths <glob[,glob]>\n');
    process.exit(1);
  }
  const exclude = Number(values.issue ?? 0) || undefined;
  const conflicts = activeConflicts(paths, { excludeIssue: exclude });
  if (conflicts.length === 0) {
    process.stdout.write('no conflicts\n');
    return;
  }
  process.stdout.write(`${describeConflicts(conflicts)}\n`);
  process.exit(1);
}

function runList() {
  const claims = listClaims().sort((a, b) => a.issue - b.issue);
  if (claims.length === 0) {
    process.stdout.write('no active claims\n');
    return;
  }
  for (const { issue, claim } of claims) {
    const state = isExpired(claim) ? 'expired' : 'active';
    process.stdout.write(
      `#${issue} ${state} agent=${claim.agent} until=${claim.lease_until} paths=${(claim.write_set ?? []).join(',')}\n`,
    );
  }
}

function runGc(values) {
  const results = collectGarbage({
    grace: Number(values.grace ?? DEFAULT_GRACE_MINUTES),
    apply: values.apply === true,
  });

  if (results.length === 0) {
    process.stdout.write('nothing to reclaim\n');
    return;
  }

  for (const entry of results) {
    if (!entry.applied) {
      process.stdout.write(
        `would reclaim #${entry.issue} (${entry.agent}, expired ${entry.expired})\n`,
      );
      continue;
    }
    process.stdout.write(`reclaimed #${entry.issue} (${entry.agent})\n`);
  }
}

function runVerify(values) {
  const issue = Number(values.issue);
  if (!Number.isInteger(issue) || issue <= 0) {
    process.stderr.write('verify requires --issue <number>\n');
    process.exit(1);
  }

  const files = values['files-file']
    ? readFileSync(values['files-file'], 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : parsePaths(values.files);

  fetchClaims();
  const claim = readClaim(issue);
  if (!claim) {
    process.stderr.write(
      `no claim found for issue #${issue}\nClaim the issue before opening a pull request.\n`,
    );
    process.exit(1);
  }
  if (isExpired(claim)) {
    process.stderr.write(`claim for issue #${issue} expired at ${claim.lease_until}\n`);
    process.exit(1);
  }

  const allowed = claim.write_set ?? [];
  const violations = files.filter((file) => !allowed.some((pattern) => overlaps(file, pattern)));

  if (violations.length > 0) {
    process.stderr.write(`files outside the write_set of issue #${issue}:\n`);
    for (const file of violations) process.stderr.write(`  ${file}\n`);
    process.stderr.write(`declared write_set: ${allowed.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write(`all ${files.length} changed files are inside the write_set\n`);
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      issue: { type: 'string' },
      agent: { type: 'string' },
      paths: { type: 'string' },
      files: { type: 'string' },
      'files-file': { type: 'string' },
      branch: { type: 'string' },
      ttl: { type: 'string' },
      grace: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      requeue: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });

  try {
    switch (positionals[0]) {
      case 'claim':
        runClaim(values);
        break;
      case 'heartbeat':
        runHeartbeat(values);
        break;
      case 'release':
        runRelease(values);
        break;
      case 'check':
        runCheck(values);
        break;
      case 'list':
        runList();
        break;
      case 'gc':
        runGc(values);
        break;
      case 'verify':
        runVerify(values);
        break;
      default:
        process.stderr.write(
          [
            'usage: claims.mjs <claim|heartbeat|release|check|list|gc|verify> [options]',
            '',
            '  claim     --issue N --agent ID --paths "a/**,b/**" [--ttl 60] [--branch name]',
            '  heartbeat --issue N --agent ID [--ttl 60]',
            '  release   --issue N --agent ID [--requeue] [--force]',
            '  check     --paths "a/**,b/**"',
            '  list',
            '  gc        [--apply] [--grace 30]',
            '  verify    --issue N --files-file changed.txt',
          ].join('\n') + '\n',
        );
        process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
