import { describe, expect, it } from 'vitest';
import { atLeast, canEdit, effectiveLevel, rank } from '../src/index';

describe('permission resolution', () => {
  it('orders access levels', () => {
    expect(rank('none')).toBeLessThan(rank('read'));
    expect(rank('edit')).toBeLessThan(rank('manage'));
    expect(atLeast('edit', 'comment')).toBe(true);
  });

  it('lets an explicit grant override inheritance', () => {
    expect(effectiveLevel({ explicit: 'edit', inherited: ['read'] })).toBe('edit');
  });

  it('lets an explicit denial override inherited edit', () => {
    expect(effectiveLevel({ explicit: 'none', inherited: ['edit', 'manage'] })).toBe('none');
  });

  it('falls back to the nearest ancestor', () => {
    expect(effectiveLevel({ inherited: ['read', 'manage'] })).toBe('read');
  });

  it('falls back to the workspace default', () => {
    expect(effectiveLevel({ inherited: [], workspaceDefault: 'read' })).toBe('read');
    expect(effectiveLevel({ inherited: [] })).toBe('none');
  });

  it('never grants edit from read', () => {
    expect(canEdit('read')).toBe(false);
    expect(canEdit('edit')).toBe(true);
  });
});
