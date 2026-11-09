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

function remote() {
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

function syncLabels(issue, add, remove) {
  const repo = repoSlug();
  if (!repo) return false;
  const args = ['issue', 'edit', String(issue), '--repo', repo];
  for (const label of add) args.push('--add-label', label);
  for (const label of remove) args.push('--remove-label', label);
  return gh(args);
}

/**
 * The lock compares patterns by their literal prefix before the first wildcard.
 * This is deliberately conservative: a broad pattern conflicts with everything
 * beneath it, and a false conflict is much cheaper than two agents writing the
 * same file.
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

function fetchClaims() {
  git(['fetch', '--prune', remote(), `+${REF_ROOT}*:refs/remotes/${remote()}/claims/*`], {
    allowFail: true,
  });
}

function readClaim(issue) {
  const raw = git(['show', `${trackingRef(issue)}:claim.json`], { allowFail: true });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function claimSha(issue) {
  return git(['rev-parse', trackingRef(issue)], { allowFail: true });
}

function listClaims() {
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

function isExpired(claim, now = Date.now()) {
  const until = Date.parse(claim.lease_until);
  return !Number.isFinite(until) || until <= now;
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

function nowIso() {
  return new Date().toISOString();
}

function leaseIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function fail(message, details) {
  process.stderr.write(`${message}\n`);
  if (details) process.stderr.write(`${details}\n`);
  process.exit(1);
}

function parsePaths(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function activeConflicts(paths, excludeIssue) {
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

function cmdClaim(values) {
  const issue = Number(values.issue);
  const agent = values.agent;
  const paths = parsePaths(values.paths);
  const ttl = Number(values.ttl ?? DEFAULT_TTL_MINUTES);

  if (!Number.isInteger(issue) || issue <= 0) fail('claim requires --issue <number>');
  if (!agent) fail('claim requires --agent <id>');
  if (paths.length === 0) fail('claim requires --paths <glob[,glob]>');
  if (!Number.isFinite(ttl) || ttl <= 0) fail('--ttl must be a positive number of minutes');

  fetchClaims();
  const existing = readClaim(issue);
  const existingSha = claimSha(issue);
  let expectSha;

  if (existing) {
    if (!isExpired(existing)) {
      fail(
        `issue #${issue} is already claimed by ${existing.agent} until ${existing.lease_until}`,
        'Choose another issue. Do not steal a live claim.',
      );
    }
    expectSha = existingSha;
    process.stderr.write(`taking over expired claim from ${existing.agent}\n`);
  }

  const conflicts = activeConflicts(paths, issue);
  if (conflicts.length > 0) {
    const lines = conflicts.map(
      (c) => `  #${c.issue} (${c.agent}): ${c.mine} overlaps ${c.theirs}`,
    );
    fail('write_set overlaps an active claim:', lines.join('\n'));
  }

  const claim = {
    version: 1,
    issue,
    agent,
    branch: values.branch ?? null,
    write_set: paths,
    started_at: existing?.started_at ?? nowIso(),
    heartbeat: nowIso(),
    lease_until: leaseIso(ttl),
    ttl_minutes: ttl,
  };

  if (!pushClaim(issue, claim, { expectSha })) {
    fail(
      `failed to claim issue #${issue}`,
      'The ref already exists or was replaced. Re-run `claims.mjs list` and pick another issue.',
    );
  }

  syncLabels(issue, ['status:claimed'], ['status:ready']);
  process.stdout.write(`${JSON.stringify(claim, null, 2)}\n`);
}

function cmdHeartbeat(values) {
  const issue = Number(values.issue);
  const agent = values.agent;
  if (!Number.isInteger(issue) || issue <= 0) fail('heartbeat requires --issue <number>');
  if (!agent) fail('heartbeat requires --agent <id>');

  fetchClaims();
  const current = readClaim(issue);
  const sha = claimSha(issue);
  if (!current) fail(`no claim found for issue #${issue}`);
  if (current.agent !== agent) fail(`issue #${issue} is held by ${current.agent}, not ${agent}`);

  const ttl = Number(values.ttl ?? current.ttl_minutes ?? DEFAULT_TTL_MINUTES);
  const next = { ...current, heartbeat: nowIso(), lease_until: leaseIso(ttl), ttl_minutes: ttl };

  if (!pushClaim(issue, next, { expectSha: sha })) {
    fail('heartbeat failed: the claim changed under you', 'Re-read the claim before retrying.');
  }

  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

function cmdRelease(values) {
  const issue = Number(values.issue);
  const agent = values.agent;
  if (!Number.isInteger(issue) || issue <= 0) fail('release requires --issue <number>');

  fetchClaims();
  const current = readClaim(issue);
  if (!current) {
    process.stdout.write(`issue #${issue} has no claim\n`);
    return;
  }
  if (current.agent !== agent && values.force !== true) {
    fail(`issue #${issue} is held by ${current.agent}; pass --force to release it`);
  }

  const result = git(['push', remote(), '--delete', remoteRef(issue)], { allowFail: true });
  if (result === null) fail(`failed to delete claim for issue #${issue}`);
  fetchClaims();

  if (values.requeue === true) {
    syncLabels(issue, ['status:ready'], ['status:claimed', 'status:in-review']);
  } else {
    syncLabels(issue, ['status:done'], ['status:claimed', 'status:in-review']);
  }
  process.stdout.write(`released issue #${issue}\n`);
}

function cmdCheck(values) {
  const paths = parsePaths(values.paths);
  if (paths.length === 0) fail('check requires --paths <glob[,glob]>');
  const conflicts = activeConflicts(paths, Number(values.issue ?? 0) || undefined);
  if (conflicts.length === 0) {
    process.stdout.write('no conflicts\n');
    return;
  }
  for (const c of conflicts) {
    process.stdout.write(`#${c.issue} (${c.agent}): ${c.mine} overlaps ${c.theirs}\n`);
  }
  process.exit(1);
}

function cmdList() {
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

function cmdGc(values) {
  const grace = Number(values.grace ?? DEFAULT_GRACE_MINUTES);
  const apply = values.apply === true;
  const now = Date.now();
  let reclaimed = 0;

  for (const { issue, claim } of listClaims()) {
    const until = Date.parse(claim.lease_until);
    if (Number.isFinite(until) && now < until + grace * 60_000) continue;

    reclaimed += 1;
    if (!apply) {
      process.stdout.write(
        `would reclaim #${issue} (${claim.agent}, expired ${claim.lease_until})\n`,
      );
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
    process.stdout.write(
      result === null ? `failed to reclaim #${issue}\n` : `reclaimed #${issue} (${claim.agent})\n`,
    );
    if (result !== null) syncLabels(issue, ['status:ready'], ['status:claimed']);
  }

  if (reclaimed === 0) process.stdout.write('nothing to reclaim\n');
}

function cmdVerify(values) {
  const issue = Number(values.issue);
  if (!Number.isInteger(issue) || issue <= 0) fail('verify requires --issue <number>');

  const files = values['files-file']
    ? readFileSync(values['files-file'], 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : parsePaths(values.files);

  fetchClaims();
  const claim = readClaim(issue);
  if (!claim)
    fail(`no claim found for issue #${issue}`, 'Claim the issue before opening a pull request.');
  if (isExpired(claim)) fail(`claim for issue #${issue} expired at ${claim.lease_until}`);

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

  const command = positionals[0];

  try {
    switch (command) {
      case 'claim':
        cmdClaim(values);
        break;
      case 'heartbeat':
        cmdHeartbeat(values);
        break;
      case 'release':
        cmdRelease(values);
        break;
      case 'check':
        cmdCheck(values);
        break;
      case 'list':
        cmdList();
        break;
      case 'gc':
        cmdGc(values);
        break;
      case 'verify':
        cmdVerify(values);
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
