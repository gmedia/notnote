import { describe, expect, it } from 'vitest';
import { runCli, usage } from '../src/cli';

describe('importer cli', () => {
  it('prints usage', () => {
    expect(usage()).toContain('notnote-import');
    expect(usage()).toContain('extract');
  });

  it('returns a non-zero code for unknown commands', () => {
    expect(runCli(['nope'])).toBe(1);
  });

  it('returns zero for help', () => {
    expect(runCli(['--help'])).toBe(0);
  });
});
