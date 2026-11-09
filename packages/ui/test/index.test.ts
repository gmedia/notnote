import { describe, expect, it } from 'vitest';
import { colors, fontSizes, radii, spacing } from '../src/index';

describe('design tokens', () => {
  it('exposes spacing and radius scales', () => {
    expect(spacing[4]).toBe('16px');
    expect(radii.full).toBe('9999px');
  });

  it('uses CSS variables for theming', () => {
    expect(colors.accent).toMatch(/^var\(--nn-/);
  });

  it('keeps type sizes ordered', () => {
    expect(parseInt(fontSizes.xs, 10)).toBeLessThan(parseInt(fontSizes.xxl, 10));
  });
});
