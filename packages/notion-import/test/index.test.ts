import { describe, expect, it } from 'vitest';
import {
  CRITICAL_NOTION_BLOCKS,
  DEFAULT_FIDELITY_TARGETS,
  NOTION_BLOCK_MAP,
  NOTION_BLOCK_TYPES,
  isNativeMapping,
  placeholderRate,
} from '../src/index';

describe('Notion import contract', () => {
  it('maps every declared Notion block type', () => {
    for (const type of NOTION_BLOCK_TYPES) {
      expect(NOTION_BLOCK_MAP[type]).toBeDefined();
    }
  });

  it('maps all critical blocks natively', () => {
    for (const type of CRITICAL_NOTION_BLOCKS) {
      expect(isNativeMapping(type)).toBe(true);
    }
  });

  it('keeps synced blocks identifiable instead of flattening them', () => {
    expect(NOTION_BLOCK_MAP.synced_block).toBe('synced_block');
  });

  it('keeps unknown blocks explicit', () => {
    expect(NOTION_BLOCK_MAP.unsupported).toBe('unsupported');
    expect(isNativeMapping('unsupported')).toBe(false);
  });

  it('computes placeholder rate without dividing by zero', () => {
    expect(placeholderRate(0, 0)).toBe(0);
    expect(placeholderRate(100, 5)).toBe(0.05);
  });

  it('targets zero page loss', () => {
    expect(DEFAULT_FIDELITY_TARGETS.pageCoverage).toBe(1);
  });
});
