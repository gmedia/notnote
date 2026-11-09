import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluate, hasTestCoverage, isScannablePath, scanAdded } from './review.mjs';

const issue = (overrides = {}) => ({
  number: 8,
  labels: ['status:claimed', 'area:import'],
  writeSet: ['packages/notion-import/**'],
  ...overrides,
});

const claim = (overrides = {}) => ({
  agent: 'alpha-1',
  write_set: ['packages/notion-import/**'],
  lease_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ...overrides,
});

const file = (path, additions = 10, deletions = 1) => ({ path, additions, deletions });

describe('scanAdded', () => {
  it('flags a type suppression', () => {
    const findings = scanAdded({ path: 'packages/x/src/a.ts', lines: ['const a = b as any;'] });
    assert.equal(findings[0].rule, 'policy:as-any');
  });

  it('flags a skipped test', () => {
    const findings = scanAdded({
      path: 'packages/x/test/a.test.ts',
      lines: ['it.skip("x", () => {});'],
    });
    assert.ok(findings.some((finding) => finding.rule === 'policy:skip-test'));
  });

  it('flags a committed token', () => {
    const findings = scanAdded({
      path: 'README.md',
      lines: ['token: ghp_abcdefghijklmnopqrstuvwxyz0123'],
    });
    assert.equal(findings[0].rule, 'secret:github-token');
  });

  it('ignores documentation for code policy rules', () => {
    const findings = scanAdded({ path: 'docs/adr/0001-x.md', lines: ['Never use @ts-ignore.'] });
    assert.equal(findings.length, 0);
  });

  it('still scans documentation for secrets', () => {
    const findings = scanAdded({
      path: 'docs/adr/0001-x.md',
      lines: ['sk-abcdefghijklmnopqrstuvwx'],
    });
    assert.equal(findings.length, 1);
  });

  it('ignores comment-only lines for policy rules', () => {
    const findings = scanAdded({ path: 'packages/x/src/a.ts', lines: ['// @ts-ignore is banned'] });
    assert.equal(findings.length, 0);
  });
});

describe('isScannablePath', () => {
  it('excludes the policy module itself', () => {
    assert.equal(isScannablePath('scripts/lib/review.mjs'), false);
  });

  it('includes source files', () => {
    assert.equal(isScannablePath('packages/ui/src/button.tsx'), true);
  });

  it('excludes markdown', () => {
    assert.equal(isScannablePath('AGENTS.md'), false);
  });
});

describe('hasTestCoverage', () => {
  it('detects a touched test file', () => {
    const result = hasTestCoverage([
      file('packages/x/src/a.ts'),
      file('packages/x/test/a.test.ts'),
    ]);
    assert.deepEqual(result.sourcesWithCode, ['packages/x']);
    assert.equal(result.touchedTests, true);
  });

  it('detects missing tests', () => {
    const result = hasTestCoverage([file('packages/x/src/a.ts')]);
    assert.equal(result.touchedTests, false);
  });
});

describe('evaluate', () => {
  const pr = { number: 20, title: 'feat', body: 'Closes #8', headRefName: 'agent/alpha-1/8-x' };

  it('passes a scoped change with a live claim', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim(),
      files: [
        file('packages/notion-import/src/map.ts'),
        file('packages/notion-import/test/map.test.ts'),
      ],
      added: [],
    });
    assert.equal(result.verdict, 'pass');
  });

  it('blocks when no issue is linked', () => {
    const result = evaluate({ pr, issue: null, claim: null, files: [], added: [] });
    assert.equal(result.verdict, 'changes');
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'no-issue'));
  });

  it('blocks when the claim is missing', () => {
    const result = evaluate({ pr, issue: issue(), claim: null, files: [], added: [] });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'no-claim'));
  });

  it('blocks an expired claim', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim({ lease_until: past }),
      files: [],
      added: [],
    });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'expired-claim'));
  });

  it('blocks files outside the write_set', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim(),
      files: [file('apps/web/src/page.tsx')],
      added: [],
    });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'outside-write-set'));
  });

  it('blocks workflow edits on a non-platform issue', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim({ write_set: ['.github/workflows/**'] }),
      files: [file('.github/workflows/ci.yml')],
      added: [],
    });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'workflow-change'));
  });

  it('allows workflow edits on a platform issue', () => {
    const result = evaluate({
      pr,
      issue: issue({ labels: ['area:platform'] }),
      claim: claim({ write_set: ['.github/workflows/**'] }),
      files: [file('.github/workflows/ci.yml', 5, 0)],
      added: [{ path: '.github/workflows/ci.yml', lines: ['run: echo ok'] }],
    });
    assert.equal(result.verdict, 'pass');
  });

  it('blocks a lockfile change outside a dependency issue', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim({ write_set: ['pnpm-lock.yaml'] }),
      files: [file('pnpm-lock.yaml')],
      added: [],
    });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'lockfile-change'));
  });

  it('requires tests for critical areas', () => {
    const result = evaluate({
      pr,
      issue: issue({ labels: ['area:data', 'risk:critical'] }),
      claim: claim({ write_set: ['packages/db-engine/**'] }),
      files: [file('packages/db-engine/src/schema.ts')],
      added: [],
    });
    assert.ok(result.blockers.some((blocker) => blocker.rule === 'no-tests'));
  });

  it('only warns about missing tests elsewhere', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim(),
      files: [file('packages/notion-import/src/map.ts')],
      added: [],
    });
    assert.equal(result.verdict, 'pass');
    assert.ok(result.warnings.some((warning) => warning.rule === 'no-tests'));
  });

  it('warns about a large diff', () => {
    const result = evaluate({
      pr,
      issue: issue(),
      claim: claim(),
      files: [
        file('packages/notion-import/src/a.ts', 900, 400),
        file('packages/notion-import/test/a.test.ts'),
      ],
      added: [],
    });
    assert.ok(result.warnings.some((warning) => warning.rule === 'large-diff'));
  });

  it('skips scope rules when enforcement is off', () => {
    const result = evaluate({
      pr: { number: 21, title: 'chore', body: '', headRefName: 'chore/agents' },
      issue: null,
      claim: null,
      files: [file('.github/workflows/ci.yml', 2, 0)],
      added: [{ path: '.github/workflows/ci.yml', lines: ['run: echo ok'] }],
      enforceScope: false,
    });
    assert.equal(result.verdict, 'pass');
  });

  it('still blocks secrets when enforcement is off', () => {
    const result = evaluate({
      pr: { number: 21, title: 'chore', body: '', headRefName: 'chore/agents' },
      issue: null,
      claim: null,
      files: [file('config.json')],
      added: [{ path: 'config.json', lines: ['{"token":"ghp_abcdefghijklmnopqrstuvwxyz0123"}'] }],
      enforceScope: false,
    });
    assert.equal(result.verdict, 'changes');
  });
});
