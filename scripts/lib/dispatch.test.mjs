import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExpired, planAssignments } from './dispatch.mjs';

const HOUR = 60 * 60 * 1000;

const issue = (number, overrides = {}) => ({
  number,
  title: `issue ${number}`,
  body: '',
  labels: ['status:ready'],
  area: 'import',
  writeSet: [`packages/area-${number}/**`],
  dependsOn: [],
  ready: true,
  critical: false,
  ...overrides,
});

const claim = (issueNumber, agent, paths, until = new Date(Date.now() + HOUR).toISOString()) => ({
  issue: issueNumber,
  claim: { agent, write_set: paths, lease_until: until },
});

const agents = [
  { id: 'alpha-1', area: 'import', active: true },
  { id: 'beta-1', area: 'web', active: true },
];

describe('planAssignments', () => {
  it('assigns an issue to the matching area', () => {
    const { assignments } = planAssignments({ issues: [issue(1)], claims: [], agents });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].agent, 'alpha-1');
  });

  it('skips an issue with an open dependency', () => {
    const { assignments, skipped } = planAssignments({
      issues: [issue(1, { dependsOn: [10] })],
      claims: [],
      agents,
      doneIssues: [11],
    });
    assert.equal(assignments.length, 0);
    assert.match(skipped[0].reason, /depends on #10/);
  });

  it('assigns once the dependency is done', () => {
    const { assignments } = planAssignments({
      issues: [issue(1, { dependsOn: [10] })],
      claims: [],
      agents,
      doneIssues: [10],
    });
    assert.equal(assignments.length, 1);
  });

  it('skips an issue that is already claimed', () => {
    const { assignments, skipped } = planAssignments({
      issues: [issue(1)],
      claims: [claim(1, 'alpha-1', ['packages/area-1/**'])],
      agents,
    });
    assert.equal(assignments.length, 0);
    assert.equal(skipped[0].reason, 'already claimed');
  });

  it('ignores an expired claim', () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    const { assignments } = planAssignments({
      issues: [issue(1)],
      claims: [claim(1, 'alpha-1', ['packages/area-1/**'], past)],
      agents,
    });
    assert.equal(assignments.length, 1);
  });

  it('skips when the write_set collides with a live claim', () => {
    const { assignments, skipped } = planAssignments({
      issues: [issue(2, { writeSet: ['packages/area-1/src/x.ts'] })],
      claims: [claim(1, 'alpha-1', ['packages/area-1/**'])],
      agents,
    });
    assert.equal(assignments.length, 0);
    assert.match(skipped[0].reason, /overlaps #1/);
  });

  it('assigns two independent issues to the same idle agent', () => {
    const { assignments } = planAssignments({
      issues: [issue(1), issue(2)],
      claims: [],
      agents: [{ id: 'alpha-1', area: 'import', active: true, capacity: 2 }],
    });
    assert.equal(assignments.length, 2);
  });

  it('respects capacity and falls back to another area', () => {
    const { assignments, skipped } = planAssignments({
      issues: [issue(1), issue(2)],
      claims: [],
      agents: [{ id: 'alpha-1', area: 'import', active: true, capacity: 1 }],
    });
    assert.equal(assignments.length, 1);
    assert.equal(skipped[0].reason, 'no eligible agent');
  });

  it('matches area:any agents', () => {
    const { assignments } = planAssignments({
      issues: [issue(1)],
      claims: [],
      agents: [{ id: 'float-1', area: 'any', active: true }],
    });
    assert.equal(assignments[0].agent, 'float-1');
  });

  it('prefers p0 before p1 and orders deterministically', () => {
    const { assignments } = planAssignments({
      issues: [
        issue(5, { labels: ['status:ready', 'priority:p2'] }),
        issue(3, { labels: ['status:ready', 'priority:p0'] }),
      ],
      claims: [],
      agents: [{ id: 'alpha-1', area: 'import', active: true, capacity: 2 }],
    });
    assert.deepEqual(
      assignments.map((entry) => entry.issue),
      [3, 5],
    );
  });

  it('never assigns a blocked issue', () => {
    const { assignments } = planAssignments({
      issues: [issue(1, { labels: ['status:blocked'], ready: false })],
      claims: [],
      agents,
    });
    assert.equal(assignments.length, 0);
  });
});

describe('isExpired', () => {
  it('treats a malformed lease as expired', () => {
    assert.equal(isExpired({ lease_until: 'not-a-date' }), true);
  });

  it('treats a future lease as live', () => {
    assert.equal(isExpired({ lease_until: new Date(Date.now() + HOUR).toISOString() }), false);
  });
});
