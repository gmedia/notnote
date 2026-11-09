export const TOKEN_CLASSES = {
  gho_: 'oauth',
  ghp_: 'classic',
  github_pat_: 'fine-grained',
};

export function tokenClass(prefix) {
  if (typeof prefix !== 'string') return 'unknown';
  for (const [needle, name] of Object.entries(TOKEN_CLASSES)) {
    if (prefix.startsWith(needle)) return name;
  }
  return 'unknown';
}

export function truncatePrefix(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return `${value.slice(0, 11)}…`;
}

function splitList(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseProbe(stdout) {
  const fields = {};
  for (const line of String(stdout).split('\n')) {
    const index = line.indexOf('=');
    if (index === -1) continue;
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }

  return {
    host: fields.host ?? 'unknown',
    tokenPrefix: truncatePrefix(fields.token_prefix ?? ''),
    tokenFp: fields.token_fp ?? '',
    scopes: splitList(fields.scopes),
    login: fields.login ?? '',
    repoPush: fields.repo_push === 'true',
    repoAdmin: fields.repo_admin === 'true',
    sshKeys: splitList(fields.ssh_keys),
    transcriptHits: Number(fields.transcript_hits ?? 0) || 0,
    historyHits: Number(fields.history_hits ?? 0) || 0,
  };
}

export function findSharedKeys(probes) {
  const byKey = new Map();
  for (const probe of probes) {
    for (const key of probe.sshKeys) {
      const hosts = byKey.get(key) ?? [];
      hosts.push(probe.host);
      byKey.set(key, hosts);
    }
  }

  const shared = new Map();
  for (const [key, hosts] of byKey) {
    if (hosts.length > 1) shared.set(key, [...new Set(hosts)]);
  }
  return shared;
}

const PRIVILEGE_SCOPES = new Set([
  'admin:public_key',
  'admin:org',
  'delete_repo',
  'admin:repo_hook',
]);

export function evaluateAgent({ agent, probe, expected, sharedKeys }) {
  const findings = [];
  const klass = tokenClass(probe.tokenPrefix);
  const wanted = expected.tokenClass ?? 'fine-grained';

  if (klass !== wanted) {
    findings.push({
      level: 'blocker',
      rule: 'token-class',
      message: `token is ${klass}, expected ${wanted}; account-wide OAuth tokens cannot be scoped to one repository`,
    });
  }

  if (!probe.repoPush) {
    findings.push({
      level: 'blocker',
      rule: 'repo-push',
      message: 'token cannot push to the repository',
    });
  }

  if (probe.repoAdmin) {
    findings.push({
      level: 'warning',
      rule: 'repo-admin',
      message: 'token has admin on the repository',
    });
  }

  const dangerous = probe.scopes.filter((scope) => PRIVILEGE_SCOPES.has(scope));
  if (dangerous.length > 0) {
    findings.push({
      level: 'warning',
      rule: 'broad-scope',
      message: `token carries ${dangerous.join(', ')}`,
    });
  }

  if (expected.login && probe.login && probe.login !== expected.login) {
    findings.push({
      level: 'blocker',
      rule: 'identity',
      message: `authenticated as ${probe.login}, expected ${expected.login}`,
    });
  }

  for (const key of probe.sshKeys) {
    const hosts = sharedKeys.get(key);
    if (hosts && hosts.length > 1) {
      findings.push({
        level: 'warning',
        rule: 'shared-ssh-key',
        message: `SSH key shared with ${hosts.filter((host) => host !== probe.host).join(', ')}`,
      });
    }
  }

  if (probe.transcriptHits > 0) {
    findings.push({
      level: 'warning',
      rule: 'transcript-exposure',
      message: `${probe.transcriptHits} credential-like strings found in session transcripts`,
    });
  }

  if (probe.historyHits > 0) {
    findings.push({
      level: 'blocker',
      rule: 'shell-history',
      message: `${probe.historyHits} credential-like strings found in shell history`,
    });
  }

  const blocked = findings.some((finding) => finding.level === 'blocker');
  return {
    agent,
    host: probe.host,
    status: blocked ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
    findings,
  };
}

export function summarize(results) {
  return {
    pass: results.filter((result) => result.status === 'pass').length,
    warn: results.filter((result) => result.status === 'warn').length,
    fail: results.filter((result) => result.status === 'fail').length,
  };
}

export function renderTable(results) {
  const lines = [];
  for (const result of results) {
    lines.push(
      `${result.agent.padEnd(10)} ${result.host.padEnd(24)} ${result.status.toUpperCase()}`,
    );
    for (const finding of result.findings) {
      lines.push(
        `  ${finding.level === 'blocker' ? '✗' : '!'} ${finding.rule}: ${finding.message}`,
      );
    }
  }
  const counts = summarize(results);
  lines.push('');
  lines.push(`pass=${counts.pass} warn=${counts.warn} fail=${counts.fail}`);
  return lines.join('\n');
}
