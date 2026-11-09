#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  evaluateAgent,
  findSharedKeys,
  parseProbe,
  renderTable,
  summarize,
} from './lib/credentials.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function probeScript(repo) {
  const template = readFileSync(join(HERE, 'lib', 'probe.sh'), 'utf8');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`invalid repository "${repo}", expected owner/name`);
  }
  return template.replaceAll('__REPO__', repo);
}

function probeLocal(repo) {
  return execFileSync('bash', ['-c', probeScript(repo)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function probeRemote(host, repo) {
  try {
    return execFileSync(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=10',
        '-o',
        'StrictHostKeyChecking=accept-new',
        host,
        'bash -s',
      ],
      { input: probeScript(repo), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : 'ssh failed';
    return `host=${host}\nprobe_error=${stderr.split('\n')[0]}\n`;
  }
}

function main(values) {
  const mapPath = values.map ?? 'agents.local.json';
  let config;
  try {
    config = JSON.parse(readFileSync(mapPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`cannot read ${mapPath}: ${error.message}\n\n`);
    process.stderr.write(
      `Copy docs/agents/agents.local.example.json to ${mapPath} and fill in the hosts.\n`,
    );
    process.exit(1);
  }

  const repo = config.repo ?? 'gmedia/notnote';
  const agents = Array.isArray(config.agents) ? config.agents : [];
  if (agents.length === 0) {
    process.stderr.write(`${mapPath} has no agents\n`);
    process.exit(1);
  }

  const probes = [];
  for (const agent of agents) {
    const raw = agent.host === 'local' ? probeLocal(repo) : probeRemote(agent.host, repo);
    probes.push({ agent, probe: parseProbe(raw) });
  }

  const sharedKeys = findSharedKeys(probes.map((entry) => entry.probe));
  const results = probes.map(({ agent, probe }) =>
    evaluateAgent({
      agent: agent.id,
      probe,
      expected: {
        tokenClass: agent.tokenClass ?? 'fine-grained',
        login: agent.login ?? config.login,
      },
      sharedKeys,
    }),
  );

  process.stdout.write(`${renderTable(results)}\n`);

  if (values.json === true) {
    process.stdout.write(
      `${JSON.stringify(
        {
          repo,
          generatedAt: new Date().toISOString(),
          summary: summarize(results),
          results,
        },
        null,
        2,
      )}\n`,
    );
  }

  const counts = summarize(results);
  if (values.gate === true && (counts.fail > 0 || counts.warn > 0)) {
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1]?.endsWith('verify-tokens.mjs') ?? false;

if (invokedDirectly) {
  const { values } = parseArgs({
    options: {
      map: { type: 'string' },
      gate: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  try {
    main(values);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
