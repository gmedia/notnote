import type { BlockType } from '@notnote/shared';

export interface BlockCapability {
  readonly text: boolean;
  readonly children: boolean;
  readonly media: boolean;
}

const textBlock = (children = false): BlockCapability => ({
  text: true,
  children,
  media: false,
});

const leafBlock = (media = false): BlockCapability => ({
  text: false,
  children: false,
  media,
});

/**
 * Every block type must have an explicit capability entry.
 * Record<BlockType, ...> makes a missing type a compile error.
 */
export const BLOCK_CAPABILITIES: Readonly<Record<BlockType, BlockCapability>> = {
  paragraph: textBlock(true),
  heading1: textBlock(true),
  heading2: textBlock(true),
  heading3: textBlock(true),
  heading4: textBlock(true),
  bulleted_list_item: textBlock(true),
  numbered_list_item: textBlock(true),
  task: textBlock(true),
  toggle: textBlock(true),
  quote: textBlock(true),
  callout: textBlock(true),
  code: textBlock(false),
  equation: leafBlock(false),
  divider: leafBlock(false),
  image: leafBlock(true),
  video: leafBlock(true),
  audio: leafBlock(true),
  file: leafBlock(true),
  pdf: leafBlock(true),
  bookmark: leafBlock(false),
  embed: leafBlock(false),
  link_preview: leafBlock(false),
  table: { text: false, children: true, media: false },
  table_row: { text: false, children: true, media: false },
  columns: { text: false, children: true, media: false },
  column: { text: false, children: true, media: false },
  child_page: leafBlock(false),
  child_database: leafBlock(false),
  synced_block: { text: false, children: true, media: false },
  template: { text: true, children: true, media: false },
  table_of_contents: leafBlock(false),
  breadcrumb: leafBlock(false),
  tabs: { text: false, children: true, media: false },
  tab: { text: false, children: true, media: false },
  link_to_page: leafBlock(false),
  meeting_notes: { text: false, children: true, media: false },
  unsupported: leafBlock(false),
};

export function supportsChildren(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].children;
}

export function isTextBlock(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].text;
}
