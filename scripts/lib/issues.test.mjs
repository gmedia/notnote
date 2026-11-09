import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  issueArea,
  normalizeIssue,
  parseChecklist,
  parseDependsOn,
  parseWriteSet,
} from './issues.mjs';

const TASK_BODY = `## Goal

Do the thing.

## Acceptance criteria

- [x] first
- [ ] second

## write_set

\`\`\`
packages/editor/**
apps/web/src/page.tsx
\`\`\`

## Out of scope

- nothing

## Depends on

#3, #7

## Risk

normal
`;

describe('parseWriteSet', () => {
  it('reads the fenced block under the heading', () => {
    assert.deepEqual(parseWriteSet(TASK_BODY), ['packages/editor/**', 'apps/web/src/page.tsx']);
  });

  it('supports the issue form heading level', () => {
    const body = '### write_set\n\n```\ninfra/docker/**\n```\n';
    assert.deepEqual(parseWriteSet(body), ['infra/docker/**']);
  });

  it('accepts a bare list without a fence', () => {
    assert.deepEqual(parseWriteSet('## write_set\n\n- docs/**\n- README.md\n'), [
      'docs/**',
      'README.md',
    ]);
  });

  it('returns nothing when the section is absent', () => {
    assert.deepEqual(parseWriteSet('## Goal\n\nx\n'), []);
  });
});

describe('parseDependsOn', () => {
  it('extracts issue numbers', () => {
    assert.deepEqual(parseDependsOn(TASK_BODY), [3, 7]);
  });

  it('returns nothing for None', () => {
    assert.deepEqual(parseDependsOn('## Depends on\n\nNone\n'), []);
  });
});

describe('parseChecklist', () => {
  it('reports completion state', () => {
    const items = parseChecklist(TASK_BODY);
    assert.equal(items.length, 2);
    assert.equal(items[0].done, true);
    assert.equal(items[1].done, false);
  });
});

describe('normalizeIssue', () => {
  it('flattens labels and derives the area', () => {
    const issue = normalizeIssue({
      number: 8,
      title: 't',
      body: TASK_BODY,
      labels: [{ name: 'status:ready' }, { name: 'area:import' }, { name: 'risk:critical' }],
    });

    assert.equal(issue.area, 'import');
    assert.equal(issue.ready, true);
    assert.equal(issue.critical, true);
    assert.deepEqual(issue.writeSet, ['packages/editor/**', 'apps/web/src/page.tsx']);
  });

  it('treats blocked issues as not ready', () => {
    const issue = normalizeIssue({
      number: 9,
      title: 't',
      body: '',
      labels: ['status:ready', 'status:blocked'],
    });
    assert.equal(issue.ready, false);
  });
});

describe('issueArea', () => {
  it('returns null without an area label', () => {
    assert.equal(issueArea([]), null);
  });
});
