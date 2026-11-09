import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '@notnote/shared';
import { BLOCK_CAPABILITIES, isTextBlock, supportsChildren } from '../src/index';

describe('editor block registry', () => {
  it('covers every declared block type', () => {
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_CAPABILITIES[type]).toBeDefined();
    }
  });

  it('marks containers as supporting children', () => {
    expect(supportsChildren('toggle')).toBe(true);
    expect(supportsChildren('columns')).toBe(true);
    expect(supportsChildren('divider')).toBe(false);
  });

  it('identifies text-bearing blocks', () => {
    expect(isTextBlock('paragraph')).toBe(true);
    expect(isTextBlock('image')).toBe(false);
  });
});
