export const APP_NAME = 'NotNote';

/** Nominal typing so IDs cannot be mixed accidentally. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type PageId = Brand<string, 'PageId'>;
export type BlockId = Brand<string, 'BlockId'>;
export type UserId = Brand<string, 'UserId'>;
export type PropertyId = Brand<string, 'PropertyId'>;
export type RowId = Brand<string, 'RowId'>;

export const BLOCK_TYPES = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'bulleted_list_item',
  'numbered_list_item',
  'task',
  'toggle',
  'quote',
  'callout',
  'code',
  'equation',
  'divider',
  'image',
  'video',
  'audio',
  'file',
  'pdf',
  'bookmark',
  'embed',
  'link_preview',
  'table',
  'table_row',
  'columns',
  'column',
  'child_page',
  'child_database',
  'synced_block',
  'template',
  'table_of_contents',
  'breadcrumb',
  'tabs',
  'tab',
  'link_to_page',
  'meeting_notes',
  'unsupported',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type PageKind = 'page' | 'database_row';

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: string;
}

export interface PageRef {
  readonly id: PageId;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly kind: PageKind;
  readonly parentId: PageId | null;
}

export interface RichTextAnnotations {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strikethrough: boolean;
  readonly underline: boolean;
  readonly code: boolean;
  readonly color: string;
}

export interface RichTextSpan {
  readonly text: string;
  readonly annotations: RichTextAnnotations;
  readonly link: string | null;
}

export interface ImportFidelityReport {
  readonly pagesTotal: number;
  readonly pagesImported: number;
  readonly blocksTotal: number;
  readonly blocksNative: number;
  readonly blocksPlaceholder: number;
  readonly linksTotal: number;
  readonly linksResolved: number;
  readonly relationsTotal: number;
  readonly relationsValid: number;
  readonly unsupported: readonly string[];
  readonly generatedAt: string;
}

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export class NotNoteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NotNoteError';
  }
}

export function assertNever(value: never, context: string): never {
  throw new NotNoteError('unreachable', `Unexpected value in ${context}: ${String(value)}`);
}
