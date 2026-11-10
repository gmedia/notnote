import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateAgent,
  findSharedKeys,
  parseProbe,
  readAllowed,
  summarize,
  tokenClass,
  truncatePrefix,
  writeAllowed,
} from './credentials.mjs';

const PROBE = `host=alpha-vm
token_prefix=github_pat_11ABC
token_fp=aaaaaaaaaaaa
scopes=repo
login=oppytut
cap_metadata_read=200
cap_contents_write=422
cap_issues_write=422
cap_pulls_write=422
cap_actions_read=200
cap_admin_read=403
ssh_keys=SHA256:key-one
transcript_hits=0
history_hits=0
`;

const probeOf = (overrides = {}) => {
  const base = Object.fromEntries(
    PROBE.split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  const merged = { ...base, ...overrides };
  return parseProbe(
    Object.entries(merged)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
};

describe('tokenClass', () => {
  it('recognises each GitHub token family', () => {
    assert.equal(tokenClass('gho_'), 'oauth');
    assert.equal(tokenClass('ghp_'), 'classic');
    assert.equal(tokenClass('github_pat_'), 'fine-grained');
  });

  it('returns unknown for anything else', () => {
    assert.equal(tokenClass('xyz'), 'unknown');
    assert.equal(tokenClass(undefined), 'unknown');
  });
});

describe('truncatePrefix', () => {
  it('keeps only the identifying prefix', () => {
    assert.equal(truncatePrefix('github_pat_11ABCDEFG'), 'github_pat_…');
  });

  it('handles an empty value', () => {
    assert.equal(truncatePrefix(''), '');
  });
});

describe('status helpers', () => {
  it('treats a validation error as authorised for a write probe', () => {
    assert.equal(writeAllowed(422), true);
    assert.equal(writeAllowed(400), true);
    assert.equal(writeAllowed(403), false);
    assert.equal(writeAllowed(404), false);
  });

  it('requires 200 for a read probe', () => {
    assert.equal(readAllowed(200), true);
    assert.equal(readAllowed(403), false);
  });
});

describe('parseProbe', () => {
  it('reads the probe payload and capabilities', () => {
    const probe = parseProbe(PROBE);
    assert.equal(probe.host, 'alpha-vm');
    assert.equal(probe.tokenPrefix, 'github_pat_…');
    assert.deepEqual(probe.scopes, ['repo']);
    assert.equal(probe.capabilities.contentsWrite, 422);
    assert.equal(probe.capabilities.adminRead, 403);
    assert.deepEqual(probe.sshKeys, ['SHA256:key-one']);
  });

  it('treats a missing capability as zero', () => {
    const probe = parseProbe('host=x\n');
    assert.equal(probe.capabilities.contentsWrite, 0);
    assert.equal(probe.login, '');
    assert.equal(probe.transcriptHits, 0);
  });
});

describe('findSharedKeys', () => {
  it('reports a key used by more than one host', () => {
    const shared = findSharedKeys([
      { host: 'a', sshKeys: ['k1', 'k2'] },
      { host: 'b', sshKeys: ['k1'] },
      { host: 'c', sshKeys: ['k3'] },
    ]);
    assert.deepEqual(shared.get('k1'), ['a', 'b']);
    assert.equal(shared.has('k2'), false);
  });
});

describe('evaluateAgent', () => {
  const expected = { tokenClass: 'fine-grained', login: 'oppytut' };

  it('passes a fully capable fine-grained token', () => {
    const result = evaluateAgent({
      agent: 'alpha-1',
      probe: probeOf(),
      expected,
      sharedKeys: new Map(),
    });
    assert.equal(result.status, 'pass');
  });

  it('fails when contents write is missing', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_contents_write: '403' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.some((finding) => finding.rule === 'contents-write'));
  });

  it('fails when issues write is missing', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_issues_write: '403' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'issues-write'));
  });

  it('fails when pull request write is missing', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_pulls_write: '403' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'pulls-write'));
  });

  it('fails when metadata read is missing', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_metadata_read: '404' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'metadata-read'));
  });

  it('warns when administration is readable', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_admin_read: '200' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.equal(result.status, 'warn');
    assert.ok(result.findings.some((finding) => finding.rule === 'administration'));
  });

  it('does not flag a 404 write probe as capable', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ cap_issues_write: '404' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.equal(result.status, 'fail');
  });

  it('fails an OAuth token', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ token_prefix: 'gho_ABC' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'token-class'));
  });

  it('fails on an identity mismatch', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ login: 'someone-else' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'identity'));
  });

  it('fails when no credential is present', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ token_prefix: '', token_fp: '' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'no-credential'));
  });

  it('warns when the SSH key is shared', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf(),
      expected,
      sharedKeys: new Map([['SHA256:key-one', ['alpha-vm', 'beta-vm']]]),
    });
    assert.equal(result.status, 'warn');
    assert.ok(result.findings.some((finding) => finding.rule === 'shared-ssh-key'));
  });

  it('blocks credentials in shell history', () => {
    const result = evaluateAgent({
      agent: 'a',
      probe: probeOf({ history_hits: '2' }),
      expected,
      sharedKeys: new Map(),
    });
    assert.ok(result.findings.some((finding) => finding.rule === 'shell-history'));
  });
});

describe('summarize', () => {
  it('counts statuses', () => {
    const counts = summarize([{ status: 'pass' }, { status: 'warn' }, { status: 'fail' }]);
    assert.deepEqual(counts, { pass: 1, warn: 1, fail: 1 });
  });
});
