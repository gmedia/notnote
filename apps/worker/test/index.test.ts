import { describe, expect, it } from 'vitest';
import { JOB_KINDS, isJobKind } from '../src/index';

describe('worker job registry', () => {
  it('declares unique job kinds', () => {
    expect(new Set(JOB_KINDS).size).toBe(JOB_KINDS.length);
  });

  it('guards unknown job kinds', () => {
    expect(isJobKind('import.verify')).toBe(true);
    expect(isJobKind('import.nope')).toBe(false);
  });
});
