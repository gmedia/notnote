import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overlaps, scopeOf } from './claims.mjs';

describe('scopeOf', () => {
  it('reduces a recursive glob to its directory prefix', () => {
    assert.equal(scopeOf('packages/notion-import/**'), 'packages/notion-import');
  });

  it('keeps an exact file path intact', () => {
    assert.equal(scopeOf('pnpm-lock.yaml'), 'pnpm-lock.yaml');
  });

  it('stops at the first wildcard', () => {
    assert.equal(scopeOf('apps/*/src/**'), 'apps');
  });

  it('strips a leading dot slash', () => {
    assert.equal(scopeOf('./packages/shared'), 'packages/shared');
  });
});

describe('overlaps', () => {
  it('detects a file inside a recursive glob', () => {
    assert.equal(overlaps('packages/editor/src/index.ts', 'packages/editor/**'), true);
  });

  it('detects a nested glob inside a broader glob', () => {
    assert.equal(overlaps('packages/editor/**', 'packages/**'), true);
  });

  it('treats sibling directories as independent', () => {
    assert.equal(overlaps('packages/editor/**', 'packages/db-engine/**'), false);
  });

  it('does not confuse a prefix with a longer sibling name', () => {
    assert.equal(overlaps('packages/ui/**', 'packages/ui-kit/**'), false);
  });

  it('treats two distinct files in one directory as independent', () => {
    assert.equal(overlaps('packages/shared/src/a.ts', 'packages/shared/src/b.ts'), false);
  });

  it('treats a root glob as conflicting with everything', () => {
    assert.equal(overlaps('**', 'apps/web/**'), true);
  });

  it('flags the lockfile against an unrelated package glob', () => {
    assert.equal(overlaps('pnpm-lock.yaml', 'packages/editor/**'), false);
  });

  it('flags the lockfile against a root glob', () => {
    assert.equal(overlaps('pnpm-lock.yaml', '**'), true);
  });
});
