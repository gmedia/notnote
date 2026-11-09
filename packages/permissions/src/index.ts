export const ACCESS_LEVELS = ['none', 'read', 'comment', 'edit', 'manage'] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const RANK: Readonly<Record<AccessLevel, number>> = {
  none: 0,
  read: 1,
  comment: 2,
  edit: 3,
  manage: 4,
};

export function rank(level: AccessLevel): number {
  return RANK[level];
}

export function atLeast(level: AccessLevel, required: AccessLevel): boolean {
  return RANK[level] >= RANK[required];
}

export interface EffectiveLevelInput {
  /**
   * Explicit grant on the resource itself. 'none' is a real value and
   * therefore must override an inherited 'edit'.
   */
  readonly explicit?: AccessLevel;
  /** Ancestor grants, nearest first. Only the first entry is used. */
  readonly inherited: readonly AccessLevel[];
  readonly workspaceDefault?: AccessLevel;
}

/**
 * Explicit grants always win, including explicit denial.
 * This is what allows a sensitive subpage to be restricted inside a shared parent.
 */
export function effectiveLevel(input: EffectiveLevelInput): AccessLevel {
  if (input.explicit !== undefined) {
    return input.explicit;
  }

  const nearestInherited = input.inherited[0];
  if (nearestInherited !== undefined) {
    return nearestInherited;
  }

  return input.workspaceDefault ?? 'none';
}

export function canRead(level: AccessLevel): boolean {
  return atLeast(level, 'read');
}

export function canEdit(level: AccessLevel): boolean {
  return atLeast(level, 'edit');
}

export function canManage(level: AccessLevel): boolean {
  return atLeast(level, 'manage');
}
