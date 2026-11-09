export const JOB_KINDS = [
  'projection.rebuild',
  'search.index',
  'export.markdown',
  'export.html',
  'import.extract',
  'import.normalize',
  'import.load',
  'import.verify',
  'file.thumbnail',
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as readonly string[]).includes(value);
}
