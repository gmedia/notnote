import { describe, expect, it } from 'vitest';
import {
  COMPUTED_PROPERTY_TYPES,
  FILTER_OPERATORS,
  PROPERTY_TYPES,
  compileView,
  isComputed,
  isSupported,
} from '../src/index';

describe('database engine contract', () => {
  it('declares unique property types', () => {
    expect(new Set(PROPERTY_TYPES).size).toBe(PROPERTY_TYPES.length);
  });

  it('marks rollups and formulas as computed', () => {
    expect(isComputed('rollup')).toBe(true);
    expect(isComputed('formula')).toBe(true);
    expect(isComputed('text')).toBe(false);
  });

  it('supports the launch property set', () => {
    expect(isSupported('relation')).toBe(true);
    expect(
      PROPERTY_TYPES.every((type) => COMPUTED_PROPERTY_TYPES.has(type) || isSupported(type)),
    ).toBe(true);
  });

  it('exposes the filter operator allowlist', () => {
    expect(FILTER_OPERATORS).toContain('contains');
    expect(FILTER_OPERATORS).toContain('within');
  });

  it('does not silently compile before Phase 2', () => {
    expect(() => compileView({ filters: [], sorts: [] })).toThrow(/Phase 2/);
  });
});
