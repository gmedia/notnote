export const COLLAB_PROTOCOL_VERSION = 1 as const;

export interface DocumentKeyInput {
  readonly workspaceId: string;
  readonly pageId: string;
}

/** Stable object-storage key for a page snapshot. */
export function documentKey(input: DocumentKeyInput): string {
  return `workspaces/${input.workspaceId}/pages/${input.pageId}/snapshot`;
}
