import type { BlockType } from '@notnote/shared';

export const NOTION_BLOCK_TYPES = [
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
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
  'column_list',
  'column',
  'child_page',
  'child_database',
  'synced_block',
  'template',
  'table_of_contents',
  'breadcrumb',
  'tab',
  'link_to_page',
  'meeting_notes',
  'transcription',
  'unsupported',
] as const;

export type NotionBlockType = (typeof NOTION_BLOCK_TYPES)[number];

export const NOTION_BLOCK_MAP: Readonly<Record<NotionBlockType, BlockType>> = {
  paragraph: 'paragraph',
  heading_1: 'heading1',
  heading_2: 'heading2',
  heading_3: 'heading3',
  heading_4: 'heading4',
  bulleted_list_item: 'bulleted_list_item',
  numbered_list_item: 'numbered_list_item',
  to_do: 'task',
  toggle: 'toggle',
  quote: 'quote',
  callout: 'callout',
  code: 'code',
  equation: 'equation',
  divider: 'divider',
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  pdf: 'pdf',
  bookmark: 'bookmark',
  embed: 'embed',
  link_preview: 'link_preview',
  table: 'table',
  table_row: 'table_row',
  column_list: 'columns',
  column: 'column',
  child_page: 'child_page',
  child_database: 'child_database',
  synced_block: 'synced_block',
  template: 'template',
  table_of_contents: 'table_of_contents',
  breadcrumb: 'breadcrumb',
  tab: 'tab',
  link_to_page: 'link_to_page',
  meeting_notes: 'meeting_notes',
  transcription: 'meeting_notes',
  unsupported: 'unsupported',
};

/** Types where losing the native form is acceptable only if reported. */
export const CRITICAL_NOTION_BLOCKS: ReadonlySet<NotionBlockType> = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'table',
  'image',
  'code',
]);

export interface FidelityTargets {
  readonly pageCoverage: number;
  readonly nativeBlockCoverage: number;
  readonly placeholderRate: number;
  readonly linkResolution: number;
  readonly relationIntegrity: number;
  readonly fileRetrieval: number;
}

export const DEFAULT_FIDELITY_TARGETS: FidelityTargets = {
  pageCoverage: 1,
  nativeBlockCoverage: 0.95,
  placeholderRate: 0.05,
  linkResolution: 0.98,
  relationIntegrity: 0.98,
  fileRetrieval: 0.995,
};

export function isNativeMapping(type: NotionBlockType): boolean {
  return NOTION_BLOCK_MAP[type] !== 'unsupported';
}

export function placeholderRate(blocksTotal: number, placeholders: number): number {
  if (blocksTotal === 0) {
    return 0;
  }
  return placeholders / blocksTotal;
}
