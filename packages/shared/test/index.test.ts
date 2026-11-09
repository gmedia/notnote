import { describe, expect, it } from 'vitest';
import { APP_NAME, BLOCK_TYPES, NotNoteError, assertNever } from '../src/index';

describe('shared kernel', () => {
  it('exposes the product name', () => {
    expect(APP_NAME).toBe('NotNote');
  });

  it('declares every supported block type exactly once', () => {
    expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
    expect(BLOCK_TYPES).toContain('paragraph');
    expect(BLOCK_TYPES).toContain('unsupported');
  });

  it('carries a stable error code', () => {
    const error = new NotNoteError('invalid_base_url', 'bad url');
    expect(error.code).toBe('invalid_base_url');
    expect(error).toBeInstanceOf(Error);
  });

  it('throws on unreachable code paths', () => {
    expect(() => assertNever('x' as never, 'test')).toThrow(NotNoteError);
  });
});
