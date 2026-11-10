export const TOKEN_CLASSES = {
  gho_: 'oauth',
  ghp_: 'classic',
  github_pat_: 'fine-grained',
};

/** Scopes that grant power far beyond this repository. */
export const DANGEROUS_SCOPES = new Map([
  ['admin:enterprise', 'enterprise-wide administration'],
  ['admin:org', 'organisation membership and settings'],
  ['admin:org_hook', 'organisation webhooks'],
  ['admin:gpg_key', 'GPG keys on the account'],
  ['admin:ssh_signing_key', 'SSH signing keys on the account'],
  ['admin:repo_hook', 'webhooks on every accessible repository'],
  ['delete:packages', 'package deletion'],
  ['write:packages', 'package publication'],
  ['audit_log', 'organisation audit log'],
  ['write:network_configurations', 'network configuration'],
]);

export const ACCOUNT_TAKEOVER_SCOPES = new Map([
  [
    'admin:public_key',
    'can add an SSH key to the account, which grants push to every reachable repository',
  ],
  ['admin:ssh_signing_key', 'can add a signing key to the account'],
]);

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

function toStatus(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

const CAPABILITY_FIELDS = {
  cap_traffic_read: 'pushRead',
  cap_traffic_read_anon: 'pushReadAnon',
  cap_actions_read: 'actionsRead',
  cap_actions_read_anon: 'actionsReadAnon',
  cap_contents_write: 'contentsWrite',
  cap_contents_write_anon: 'contentsWriteAnon',
  cap_issues_write: 'issuesWrite',
  cap_pulls_write: 'pullsWrite',
  cap_admin_read: 'adminRead',
  cap_ssh_key_write: 'sshKeyWrite',
};

export function parseProbe(stdout) {
  const fields = {};
  for (const line of String(stdout).split('\n')) {
    const index = line.indexOf('=');
    if (index === -1) continue;
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }

  const capabilities = {};
  for (const [field, key] of Object.entries(CAPABILITY_FIELDS)) {
    capabilities[key] = toStatus(fields[field]);
  }

  return {
    host: fields.host ?? 'unknown',
    tokenPrefix: truncatePrefix(fields.token_prefix ?? ''),
    tokenFp: fields.token_fp ?? '',
    scopes: splitList(fields.scopes),
    login: fields.login ?? '',
    capabilities,
    sshKeys: splitList(fields.ssh_keys),
    transcriptHits: Number(fields.transcript_hits ?? 0) || 0,
    historyHits: Number(fields.history_hits ?? 0) || 0,
  };
}

/**
 * A write probe sends a deliberately invalid payload, so an authorised token
 * receives a validation error instead of creating anything. 403 is the only
 * status that means "this token lacks the permission".
 */
export function writeAllowed(status) {
  return status === 400 || status === 422;
}

export function readAllowed(status) {
  return status === 200;
}

/**
 * A read that succeeds anonymously proves nothing about the token. If the
 * anonymous baseline matches, the probe is inconclusive rather than a pass.
 */
export function readVerdict(tokenStatus, anonStatus) {
  if (anonStatus !== 0 && anonStatus === tokenStatus) return 'inconclusive';
  return readAllowed(tokenStatus) ? 'pass' : 'fail';
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

export function evaluateAgent({ agent, probe, expected, sharedKeys }) {
  const findings = [];
  const klass = tokenClass(probe.tokenPrefix);
  const wanted = expected.tokenClass ?? 'fine-grained';
  const caps = probe.capabilities;

  if (probe.tokenFp === '' || probe.tokenPrefix === '') {
    findings.push({
      level: 'blocker',
      rule: 'no-credential',
      message: 'no token found on this host',
    });
  }

  if (klass !== wanted) {
    findings.push({
      level: 'blocker',
      rule: 'token-class',
      message: `token is ${klass}, expected ${wanted}; account-wide tokens cannot be scoped to one repository`,
    });
  }

  const pushRead = readVerdict(caps.pushRead, caps.pushReadAnon);
  if (pushRead === 'fail') {
    findings.push({
      level: 'blocker',
      rule: 'repo-push',
      message: `cannot read repository traffic (status ${caps.pushRead}); token likely lacks push access`,
    });
  } else if (pushRead === 'inconclusive') {
    findings.push({
      level: 'inconclusive',
      rule: 'repo-push',
      message: 'traffic endpoint answered identically without a token; result proves nothing',
    });
  }

  if (!writeAllowed(caps.contentsWrite)) {
    findings.push({
      level: 'blocker',
      rule: 'contents-write',
      message: `no contents write (status ${caps.contentsWrite}); HTTPS push, branch deletion, and API commits will fail`,
    });
  }

  if (!writeAllowed(caps.issuesWrite)) {
    findings.push({
      level: 'blocker',
      rule: 'issues-write',
      message: `no issues write (status ${caps.issuesWrite}); claiming, labelling, and commenting will fail`,
    });
  }

  if (!writeAllowed(caps.pullsWrite)) {
    findings.push({
      level: 'blocker',
      rule: 'pulls-write',
      message: `no pull requests write (status ${caps.pullsWrite}); the agent cannot open or update pull requests`,
    });
  }

  if (readAllowed(caps.actionsRead)) {
    const verdict = readVerdict(caps.actionsRead, caps.actionsReadAnon);
    if (verdict === 'inconclusive') {
      findings.push({
        level: 'inconclusive',
        rule: 'actions-read',
        message: 'workflow listing is public in this repository; result proves nothing',
      });
    }
  }

  if (readAllowed(caps.adminRead)) {
    findings.push({
      level: 'warning',
      rule: 'administration',
      message: 'token can read repository administration; agents do not need it',
    });
  }

  if (writeAllowed(caps.sshKeyWrite)) {
    findings.push({
      level: 'blocker',
      rule: 'ssh-key-write',
      message:
        'token can add an SSH key to the account; this is account takeover, not repository access',
    });
  }

  for (const [scope, reason] of ACCOUNT_TAKEOVER_SCOPES) {
    if (probe.scopes.includes(scope)) {
      findings.push({ level: 'blocker', rule: `scope:${scope}`, message: reason });
    }
  }

  const dangerous = probe.scopes.filter((scope) => DANGEROUS_SCOPES.has(scope));
  if (dangerous.length > 0) {
    findings.push({
      level: 'warning',
      rule: 'broad-scope',
      message: dangerous.map((scope) => `${scope} (${DANGEROUS_SCOPES.get(scope)})`).join('; '),
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
  const warned = findings.some((finding) => finding.level === 'warning');
  return {
    agent,
    host: probe.host,
    status: blocked ? 'fail' : warned ? 'warn' : 'pass',
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

const MARKERS = { blocker: '✗', warning: '!', inconclusive: '?' };

export function renderTable(results) {
  const lines = [];
  for (const result of results) {
    lines.push(
      `${result.agent.padEnd(10)} ${result.host.padEnd(24)} ${result.status.toUpperCase()}`,
    );
    for (const finding of result.findings) {
      lines.push(`  ${MARKERS[finding.level] ?? '-'} ${finding.rule}: ${finding.message}`);
    }
  }
  const counts = summarize(results);
  lines.push('');
  lines.push(`pass=${counts.pass} warn=${counts.warn} fail=${counts.fail}`);
  return lines.join('\n');
}
