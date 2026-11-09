import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateAgent,
  findSharedKeys,
  parseProbe,
  summarize,
  tokenClass,
  truncatePrefix,
} from './credentials.mjs';

const PROBE = `host=alpha-vm
token_prefix=github_pat_11ABC
token_fp=aaaaaaaaaaaa
scopes=repo
login=oppytut
repo_push=true
repo_admin=false
ssh_keys=SHA256:key-one
transcript_hits=0
history_hits=0
`;

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

describe('parseProbe', () => {
  it('reads the probe payload', () => {
    const probe = parseProbe(PROBE);
    assert.equal(probe.host, 'alpha-vm');
    assert.equal(probe.tokenPrefix, 'github_pat_…');
    assert.deepEqual(probe.scopes, ['repo']);
    assert.equal(probe.repoPush, true);
    assert.equal(probe.repoAdmin, false);
    assert.deepEqual(probe.sshKeys, ['SHA256:key-one']);
  });

  it('tolerates a missing field', () => {
    const probe = parseProbe('host=x\n');
    assert.equal(probe.login, '');
    assert.equal(probe.repoPush, false);
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

  it('passes a scoped fine-grained token on a unique key', () => {
    const result = evaluateAgent({
      agent: 'alpha-1',
      probe: parseProbe(PROBE),
      expected,
      sharedKeys: new Map(),
    });
    assert.equal(result.status, 'pass');
  });

  it('fails an OAuth token', () => {
    const probe = parseProbe(PROBE.replace('github_pat_11ABC', 'gho_ABC'));
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.some((finding) => finding.rule === 'token-class'));
  });

  it('fails without push permission', () => {
    const probe = parseProbe(PROBE.replace('repo_push=true', 'repo_push=false'));
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.some((finding) => finding.rule === 'repo-push'));
  });

  it('warns on admin and broad scopes', () => {
    const probe = parseProbe(
      PROBE.replace('repo_admin=false', 'repo_admin=true').replace(
        'scopes=repo',
        'scopes=admin:public_key, repo',
      ),
    );
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'warn');
    const rules = result.findings.map((finding) => finding.rule);
    assert.ok(rules.includes('repo-admin'));
    assert.ok(rules.includes('broad-scope'));
  });

  it('fails on an identity mismatch', () => {
    const probe = parseProbe(PROBE.replace('login=oppytut', 'login=someone-else'));
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.some((finding) => finding.rule === 'identity'));
  });

  it('warns when the SSH key is shared', () => {
    const probe = parseProbe(PROBE);
    const result = evaluateAgent({
      agent: 'a',
      probe,
      expected,
      sharedKeys: new Map([['SHA256:key-one', ['alpha-vm', 'beta-vm']]]),
    });
    assert.equal(result.status, 'warn');
    assert.ok(result.findings.some((finding) => finding.rule === 'shared-ssh-key'));
  });

  it('blocks credentials in shell history', () => {
    const probe = parseProbe(PROBE.replace('history_hits=0', 'history_hits=2'));
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'fail');
  });

  it('warns about transcript exposure', () => {
    const probe = parseProbe(PROBE.replace('transcript_hits=0', 'transcript_hits=3'));
    const result = evaluateAgent({ agent: 'a', probe, expected, sharedKeys: new Map() });
    assert.equal(result.status, 'warn');
  });
});

describe('summarize', () => {
  it('counts statuses', () => {
    const counts = summarize([{ status: 'pass' }, { status: 'warn' }, { status: 'fail' }]);
    assert.deepEqual(counts, { pass: 1, warn: 1, fail: 1 });
  });
});
