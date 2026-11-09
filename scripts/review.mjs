#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fetchClaims, readClaim } from './claims.mjs';
import { normalizeIssue } from './lib/issues.mjs';
import { evaluate, renderReport } from './lib/review.mjs';

function ghJson(args, allowFail = false) {
  try {
    const raw = execFileSync('gh', args, {
      encoding: 'utf8',
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

function gh(args) {
  execFileSync('gh', args, { stdio: 'ignore', env: process.env });
}

export function resolveIssueNumber(pr) {
  const body = pr.body ?? '';
  const linked = body.match(/(?:closes|fixes|resolves)\s+#(\d+)/i);
  if (linked) return Number(linked[1]);

  const branch = pr.headRefName ?? '';
  const fromBranch = branch.match(/^agent\/[^/]+\/(\d+)-/);
  return fromBranch ? Number(fromBranch[1]) : null;
}

export function parseAddedLines(diff) {
  const entries = [];
  let current = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = { path: line.slice('+++ b/'.length), lines: [] };
      entries.push(current);
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) continue;
    if (!current) continue;
    if (line.startsWith('+')) current.lines.push(line.slice(1));
  }

  return entries;
}

function readDiff(base) {
  try {
    return execFileSync('git', ['diff', `--unified=0`, `origin/${base}...HEAD`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

function upsertComment(prNumber, body) {
  const existing = ghJson(['pr', 'view', String(prNumber), '--json', 'comments'], true);
  const mine = existing?.comments?.find((entry) => entry.body?.includes('<!-- notnote-review -->'));

  if (mine) {
    gh([
      'api',
      '-X',
      'PATCH',
      `repos/{owner}/{repo}/issues/comments/${mine.id}`,
      '-f',
      `body=${body}`,
    ]);
    return;
  }
  gh(['pr', 'comment', String(prNumber), '--body', body]);
}

function applyVerdict(prNumber, verdict) {
  const pass = 'review:pass';
  const changes = 'review:changes';
  const add = verdict === 'pass' ? pass : changes;
  const remove = verdict === 'pass' ? changes : pass;
  gh(['pr', 'edit', String(prNumber), '--add-label', add, '--remove-label', remove]);
}

function main(values) {
  const prNumber = Number(values.pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    process.stderr.write('review requires --pr <number>\n');
    process.exit(1);
  }

  const pr = ghJson([
    'pr',
    'view',
    String(prNumber),
    '--json',
    'number,title,body,headRefName,labels,files,baseRefName',
  ]);

  const isAgentBranch = String(pr.headRefName ?? '').startsWith('agent/');
  const issueNumber = resolveIssueNumber(pr);

  let issue = null;
  if (issueNumber) {
    const raw = ghJson(
      ['issue', 'view', String(issueNumber), '--json', 'number,title,body,labels'],
      true,
    );
    if (raw) issue = normalizeIssue(raw);
  }

  fetchClaims();
  const claim = issueNumber ? readClaim(issueNumber) : null;

  const base = values.base ?? pr.baseRefName ?? 'main';
  const added = values['no-diff'] ? [] : parseAddedLines(readDiff(base));

  const result = evaluate({
    pr,
    issue,
    claim,
    files: (pr.files ?? []).map((file) => ({
      path: file.path,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    })),
    added,
    enforceScope: isAgentBranch,
  });

  if (values.comment === true) {
    upsertComment(prNumber, renderReport({ pr, issue, claim, result }));
    applyVerdict(prNumber, result.verdict);
  }

  process.stdout.write(`verdict: ${result.verdict}\n`);
  for (const blocker of result.blockers) {
    process.stdout.write(`blocker ${blocker.rule}: ${blocker.message}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`warning ${warning.rule}: ${warning.message}\n`);
  }

  if (values.gate === true && result.verdict !== 'pass') {
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1]?.endsWith('review.mjs') ?? false;

if (invokedDirectly) {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      base: { type: 'string' },
      gate: { type: 'boolean', default: false },
      comment: { type: 'boolean', default: false },
      'no-diff': { type: 'boolean', default: false },
    },
  });

  try {
    main(values);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
