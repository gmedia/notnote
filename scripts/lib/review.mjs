import { overlaps } from '../claims.mjs';

export const SECRET_PATTERNS = [
  { id: 'github-token', pattern: /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: 'openai-key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: 'aws-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
];

export const POLICY_PATTERNS = [
  { id: 'ts-ignore', pattern: /@ts-ignore/ },
  { id: 'ts-expect-error', pattern: /@ts-expect-error/ },
  { id: 'as-any', pattern: /\bas\s+any\b/ },
  { id: 'skip-test', pattern: /\b(?:it|test|describe)\.skip\s*\(/ },
  { id: 'only-test', pattern: /\b(?:it|test|describe)\.only\s*\(/ },
  { id: 'eslint-disable', pattern: /eslint-disable/ },
  { id: 'prettier-ignore', pattern: /prettier-ignore/ },
  { id: 'tls-disabled', pattern: /rejectUnauthorized\s*:\s*false/ },
  { id: 'unsafe-html', pattern: /dangerouslySetInnerHTML/ },
  { id: 'eval', pattern: /\beval\s*\(/ },
  { id: 'no-verify', pattern: /--no-verify/ },
];

const SCANNABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sql)$/i;

export function isScannablePath(path) {
  if (!SCANNABLE.test(path)) return false;
  if (path.startsWith('docs/')) return false;
  if (path.startsWith('scripts/lib/review')) return false;
  return true;
}

export function scanAdded({ path, lines }) {
  const findings = [];

  for (const line of lines) {
    for (const rule of SECRET_PATTERNS) {
      if (rule.pattern.test(line)) {
        findings.push({ level: 'blocker', rule: `secret:${rule.id}`, path, line: line.trim() });
      }
    }
  }

  if (!isScannablePath(path)) return findings;

  for (const line of lines) {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
    for (const rule of POLICY_PATTERNS) {
      if (rule.pattern.test(line)) {
        findings.push({ level: 'blocker', rule: `policy:${rule.id}`, path, line: line.trim() });
      }
    }
  }

  return findings;
}

const SOURCE = /^(.+?)\/(?:src|app|lib)\//;
const TEST_DIR = /(?:^|\/)(?:test|tests|__tests__)\//;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function isTestPath(path) {
  return TEST_DIR.test(path) || TEST_FILE.test(path);
}

export function hasTestCoverage(files) {
  const sources = new Set();
  let touchedTests = false;

  for (const file of files) {
    if (isTestPath(file.path)) touchedTests = true;
    const match = file.path.match(SOURCE);
    if (match) sources.add(match[1]);
  }

  return { sourcesWithCode: [...sources], touchedTests };
}

export function evaluate({ pr, issue, claim, files, added, enforceScope = true }) {
  const blockers = [];
  const warnings = [];
  const labels = issue?.labels ?? [];

  if (enforceScope && !issue) {
    blockers.push({
      rule: 'no-issue',
      message: 'No linked issue. Add `Closes #<n>` or use an `agent/<id>/<n>-...` branch.',
    });
  }

  if (enforceScope && issue && !claim) {
    blockers.push({
      rule: 'no-claim',
      message: `Issue #${issue.number} has no active claim. Claim it before opening a pull request.`,
    });
  }

  if (enforceScope && claim) {
    const until = Date.parse(claim.lease_until);
    if (!Number.isFinite(until) || until <= Date.now()) {
      blockers.push({ rule: 'expired-claim', message: `Claim expired at ${claim.lease_until}.` });
    }
  }

  if (enforceScope && issue && claim) {
    const writeSet = claim.write_set ?? [];
    const outside = files
      .map((file) => file.path)
      .filter((path) => !writeSet.some((pattern) => overlaps(path, pattern)));
    if (outside.length > 0) {
      blockers.push({
        rule: 'outside-write-set',
        message: `Files outside the declared write_set: ${outside.join(', ')}`,
      });
    }
  }

  const workflows = files.filter((file) => file.path.startsWith('.github/workflows/'));
  if (workflows.length > 0 && !labels.includes('area:platform')) {
    if (enforceScope) {
      blockers.push({
        rule: 'workflow-change',
        message: 'Workflow files changed on a non-platform issue.',
      });
    }
  }

  const lockfile = files.some((file) => file.path === 'pnpm-lock.yaml');
  if (lockfile && !labels.includes('area:platform') && !labels.includes('dependencies')) {
    if (enforceScope) {
      blockers.push({
        rule: 'lockfile-change',
        message:
          'pnpm-lock.yaml changed on a non-dependency issue. Regenerate it in a dependency issue.',
      });
    }
  }

  for (const entry of added) {
    for (const finding of scanAdded(entry)) {
      blockers.push({ rule: finding.rule, message: `${finding.path}: ${finding.line}` });
    }
  }

  const { sourcesWithCode, touchedTests } = hasTestCoverage(files);
  if (sourcesWithCode.length > 0 && !touchedTests) {
    const message = `Source changed without tests: ${sourcesWithCode.join(', ')}`;
    if (labels.includes('risk:critical')) {
      blockers.push({ rule: 'no-tests', message });
    } else {
      warnings.push({ rule: 'no-tests', message });
    }
  }

  const churn = files.reduce(
    (total, file) => total + (file.additions ?? 0) + (file.deletions ?? 0),
    0,
  );
  if (churn > 1200) {
    warnings.push({
      rule: 'large-diff',
      message: `Diff is ${churn} lines. Split it if the scope allows.`,
    });
  }

  const criticalAreas = files.some(
    (file) =>
      file.path.startsWith('packages/permissions/') ||
      file.path.startsWith('packages/db-engine/') ||
      file.path.startsWith('packages/notion-import/') ||
      file.path.includes('/migrations/'),
  );
  const touchAdr = files.some((file) => file.path.startsWith('docs/adr/'));
  if (criticalAreas && !touchAdr) {
    warnings.push({
      rule: 'adr',
      message:
        'Critical area changed without an ADR update. Confirm the existing decision still holds.',
    });
  }

  return {
    verdict: blockers.length === 0 ? 'pass' : 'changes',
    blockers,
    warnings,
  };
}

export function renderReport({ pr, issue, claim, result }) {
  const lines = [];
  lines.push('<!-- notnote-review -->');
  lines.push(`## Review gate: ${result.verdict === 'pass' ? 'PASS' : 'CHANGES REQUIRED'}`);
  lines.push('');
  lines.push(`- Pull request: #${pr.number}`);
  lines.push(`- Issue: ${issue ? `#${issue.number}` : '_none_'}`);
  lines.push(`- Claim: ${claim ? `${claim.agent} until ${claim.lease_until}` : '_none_'}`);
  lines.push('');

  if (result.blockers.length > 0) {
    lines.push('### Blockers');
    for (const blocker of result.blockers) {
      lines.push(`- \`${blocker.rule}\` — ${blocker.message}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('### Warnings');
    for (const warning of result.warnings) {
      lines.push(`- \`${warning.rule}\` — ${warning.message}`);
    }
    lines.push('');
  }

  lines.push(
    result.verdict === 'pass'
      ? 'Mechanical checks passed. A reviewer still has to judge design, tests, and scope.'
      : 'Resolve the blockers, push the fix, and the gate re-runs automatically.',
  );

  return lines.join('\n');
}
