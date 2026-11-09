export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

export const colors = {
  background: 'var(--nn-background)',
  surface: 'var(--nn-surface)',
  border: 'var(--nn-border)',
  text: 'var(--nn-text)',
  textMuted: 'var(--nn-text-muted)',
  accent: 'var(--nn-accent)',
  danger: 'var(--nn-danger)',
} as const;

export const fontSizes = {
  xs: '12px',
  sm: '14px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  xxl: '32px',
} as const;

export type SpacingToken = keyof typeof spacing;
export type ColorToken = keyof typeof colors;
