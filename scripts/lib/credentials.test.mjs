import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DANGEROUS_SCOPES,
  evaluateAgent,
  findSharedKeys,
  parseProbe,
  readAllowed,
  readVerdict,
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
cap_traffic_read=200
cap_traffic_read_anon=401
cap_actions_read=200
cap_actions_read_anon=200
cap_contents_write=422
cap_contents_write_anon=401
cap_issues_write=422
cap_pulls_write=422
cap_admin_read=403
cap_ssh_key_write=403
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

const expected = { tokenClass: 'fine-grained', login: 'oppytut' };

const run = (overrides = {}, sharedKeys = new Map()) =>
  evaluateAgent({ agent: 'a', probe: probeOf(overrides), expected, sharedKeys });

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

describe('readVerdict', () => {
  it('marks a read inconclusive when anonymous matches', () => {
    assert.equal(readVerdict(200, 200), 'inconclusive');
  });

  it('passes a read that only works with the token', () => {
    assert.equal(readVerdict(200, 401), 'pass');
  });

  it('fails a read the token cannot perform', () => {
    assert.equal(readVerdict(403, 401), 'fail');
  });

  it('passes when no anonymous baseline was collected', () => {
    assert.equal(readVerdict(200, 0), 'pass');
  });
});

describe('parseProbe', () => {
  it('reads capabilities and the anonymous baseline', () => {
    const probe = parseProbe(PROBE);
    assert.equal(probe.host, 'alpha-vm');
    assert.equal(probe.tokenPrefix, 'github_pat_…');
    assert.deepEqual(probe.scopes, ['repo']);
    assert.equal(probe.capabilities.contentsWrite, 422);
    assert.equal(probe.capabilities.contentsWriteAnon, 401);
    assert.equal(probe.capabilities.sshKeyWrite, 403);
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
  it('passes a capable fine-grained token with meaningful probes', () => {
    assert.equal(run().status, 'pass');
  });

  it('fails when contents write is missing', () => {
    assert.ok(run({ cap_contents_write: '403' }).findings.some((f) => f.rule === 'contents-write'));
  });

  it('fails when issues write is missing', () => {
    assert.ok(run({ cap_issues_write: '403' }).findings.some((f) => f.rule === 'issues-write'));
  });

  it('fails when pull request write is missing', () => {
    assert.ok(run({ cap_pulls_write: '403' }).findings.some((f) => f.rule === 'pulls-write'));
  });

  it('fails when the token cannot push', () => {
    assert.ok(run({ cap_traffic_read: '403' }).findings.some((f) => f.rule === 'repo-push'));
  });

  it('does not fail push when the probe is inconclusive', () => {
    const result = run({ cap_traffic_read: '200', cap_traffic_read_anon: '200' });
    assert.equal(result.status, 'pass');
    assert.ok(result.findings.some((f) => f.level === 'inconclusive' && f.rule === 'repo-push'));
  });

  it('reports actions read as inconclusive on a public repository', () => {
    const result = run({ cap_actions_read: '200', cap_actions_read_anon: '200' });
    assert.ok(result.findings.some((f) => f.level === 'inconclusive' && f.rule === 'actions-read'));
  });

  it('does not report actions inconclusive when the baseline differs', () => {
    const result = run({ cap_actions_read: '200', cap_actions_read_anon: '404' });
    assert.equal(
      result.findings.some((f) => f.rule === 'actions-read'),
      false,
    );
  });

  it('blocks a token that can write account SSH keys', () => {
    const result = run({ cap_ssh_key_write: '422' });
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.some((f) => f.rule === 'ssh-key-write'));
  });

  it('blocks a classic token with admin:public_key', () => {
    const result = run({ token_prefix: 'ghp_ABC', scopes: 'repo, admin:public_key' });
    assert.ok(result.findings.some((f) => f.rule === 'scope:admin:public_key'));
  });

  it('warns on other dangerous scopes', () => {
    const result = run({ token_prefix: 'ghp_ABC', scopes: 'repo, admin:org, delete:packages' });
    const broad = result.findings.find((f) => f.rule === 'broad-scope');
    assert.ok(broad);
    assert.match(broad.message, /admin:org/);
    assert.match(broad.message, /delete:packages/);
  });

  it('covers enterprise and package scopes in the dangerous list', () => {
    for (const scope of ['admin:enterprise', 'delete:packages', 'admin:ssh_signing_key']) {
      assert.equal(DANGEROUS_SCOPES.has(scope), true, scope);
    }
  });

  it('warns when administration is readable', () => {
    const result = run({ cap_admin_read: '200' });
    assert.ok(result.findings.some((f) => f.rule === 'administration'));
  });

  it('does not flag a 404 write probe as capable', () => {
    assert.equal(run({ cap_issues_write: '404' }).status, 'fail');
  });

  it('fails an OAuth token', () => {
    assert.ok(run({ token_prefix: 'gho_ABC' }).findings.some((f) => f.rule === 'token-class'));
  });

  it('fails on an identity mismatch', () => {
    assert.ok(run({ login: 'someone-else' }).findings.some((f) => f.rule === 'identity'));
  });

  it('fails when no credential is present', () => {
    assert.ok(
      run({ token_prefix: '', token_fp: '' }).findings.some((f) => f.rule === 'no-credential'),
    );
  });

  it('warns when the SSH key is shared', () => {
    const result = run({}, new Map([['SHA256:key-one', ['alpha-vm', 'beta-vm']]]));
    assert.equal(result.status, 'warn');
  });

  it('blocks credentials in shell history', () => {
    assert.ok(run({ history_hits: '2' }).findings.some((f) => f.rule === 'shell-history'));
  });
});

describe('summarize', () => {
  it('counts statuses', () => {
    assert.deepEqual(summarize([{ status: 'pass' }, { status: 'warn' }, { status: 'fail' }]), {
      pass: 1,
      warn: 1,
      fail: 1,
    });
  });
});
