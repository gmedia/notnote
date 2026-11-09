#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { claimIssue, listClaims } from './claims.mjs';
import { planAssignments } from './lib/dispatch.mjs';
import { normalizeIssue } from './lib/issues.mjs';

const DEFAULT_TTL_MINUTES = 60;

function ghJson(args) {
  const raw = execFileSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(raw);
}

function comment(issue, body) {
  execFileSync('gh', ['issue', 'comment', String(issue), '--body', body], {
    stdio: 'ignore',
    env: process.env,
  });
}

function loadAgents(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new Error(`${path} must contain a non-empty "agents" array`);
  }
  for (const agent of parsed.agents) {
    if (typeof agent.id !== 'string' || agent.id === '') {
      throw new Error(`${path}: every agent needs a string id`);
    }
  }
  return parsed.agents;
}

export function dispatchOnce({ agentsFile, ttl, dryRun, onlyIssue }) {
  const agents = loadAgents(agentsFile);
  const open = ghJson([
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    'number,title,body,labels',
  ]).map(normalizeIssue);

  const closed = ghJson([
    'issue',
    'list',
    '--state',
    'closed',
    '--limit',
    '200',
    '--json',
    'number',
  ]);
  const doneIssues = [
    ...closed.map((issue) => Number(issue.number)),
    ...open.filter((issue) => issue.labels.includes('status:done')).map((issue) => issue.number),
  ];

  const claims = listClaims();
  const candidates = onlyIssue ? open.filter((issue) => issue.number === onlyIssue) : open;

  const plan = planAssignments({ issues: candidates, claims, agents, doneIssues });

  const results = [];
  for (const assignment of plan.assignments) {
    if (dryRun) {
      results.push({ ...assignment, status: 'planned' });
      continue;
    }

    const outcome = claimIssue({
      issue: assignment.issue,
      agent: assignment.agent,
      paths: assignment.paths,
      ttl,
    });

    if (!outcome.ok) {
      results.push({ ...assignment, status: 'lost-race', error: outcome.error });
      continue;
    }

    comment(
      assignment.issue,
      [
        `Dispatched to \`${assignment.agent}\`.`,
        '',
        `Lease until ${outcome.claim.lease_until}.`,
        '',
        `write_set: ${assignment.paths.map((path) => `\`${path}\``).join(', ')}`,
      ].join('\n'),
    );
    results.push({ ...assignment, status: outcome.refreshed ? 'refreshed' : 'claimed' });
  }

  return { results, skipped: plan.skipped };
}

function printResult({ results, skipped }) {
  if (results.length === 0 && skipped.length === 0) {
    process.stdout.write('no open issues to dispatch\n');
    return;
  }

  for (const entry of results) {
    const suffix = entry.error ? ` (${entry.error})` : '';
    process.stdout.write(`#${entry.issue} -> ${entry.agent} [${entry.status}]${suffix}\n`);
  }

  for (const entry of skipped) {
    process.stdout.write(`#${entry.issue} skipped: ${entry.reason}\n`);
  }
}

const invokedDirectly = process.argv[1]?.endsWith('dispatch.mjs') ?? false;

if (invokedDirectly) {
  const { values } = parseArgs({
    options: {
      'agents-file': { type: 'string', default: 'docs/agents/agents.json' },
      ttl: { type: 'string', default: String(DEFAULT_TTL_MINUTES) },
      'dry-run': { type: 'boolean', default: false },
      issue: { type: 'string' },
      interval: { type: 'string' },
    },
  });

  const runOnce = () =>
    printResult(
      dispatchOnce({
        agentsFile: values['agents-file'],
        ttl: Number(values.ttl),
        dryRun: values['dry-run'] === true,
        onlyIssue: values.issue ? Number(values.issue) : null,
      }),
    );

  try {
    runOnce();
    const interval = values.interval ? Number(values.interval) : 0;
    if (interval > 0) {
      setInterval(() => {
        try {
          runOnce();
        } catch (error) {
          process.stderr.write(`dispatch cycle failed: ${error.message}\n`);
        }
      }, interval * 1000);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
