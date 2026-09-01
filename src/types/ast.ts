import type { JsonValue } from 'type-fest';

// TYPE DEFINITIONS //

/** YAML-stringifyable annotation object for block and inline metadata */
export interface Annotations {
  type?: string;
  ref?: string;
  [key: string]: JsonValue | undefined;
}

/** source document position with start and end coordinates */
export interface Range {
  /** starting position in source */
  start: Position;
  /** ending position in source */
  end: Position;
}

/** source position with line, column, and offset information */
export interface Position {
  line: number;
  column: number;
  offset: number;
}

/** root AST node representing the entire MDC document */
export interface DocumentNode {
  /** document type identifier (e.g., 'notion', 'markdown') */
  type: string;
  /** optional unique reference identifier */
  ref?: string;
  /** document-level annotations from directive */
  annotations?: Annotations;
  /** top-level block nodes in the document */
  children: BlockNode[];
}

// BLOCK NODES //

/** heading level: 1 for h1, 2 for h2, 3 for h3 */
export type HeadingDepth = 1 | 2 | 3;

/** base structure shared by all block-level nodes */
export interface CustomNode<T extends string = string> {
  /** block type discriminator */
  type: T;
  /** optional unique reference identifier */
  ref?: string;
  /** block-level annotations */
  annotations?: Annotations;
  /** inline content for content-based blocks */
  content?: InlineNode[];
  /** nested block children */
  children?: BlockNode[];
  /** source position for error reporting and editing */
  range?: Range;
  /** extensible properties for domain-specific data */
  [key: string]: unknown;
}

/** container node without inline content, only children */
export interface ContainerNode extends CustomNode {
  type: string;
  /** a container doesn't have content */
  content?: never;
  children: BlockNode[];
}

/** text-based content node with inline elements */
export interface ContentNode extends CustomNode {
  /** inline content for the block */
  content: InlineNode[];
}

/** heading block node with depth levels 1-3 */
export interface HeadingNode extends ContentNode {
  type: 'heading';
  annotations?: {
    /** heading level (1 = h1, 2 = h2, 3 = h3) */
    depth: HeadingDepth;
  } & Annotations;
}

/** paragraph block containing inline content */
export interface ParagraphNode extends ContentNode {
  type: 'paragraph';
}

/** unordered list item with inline content */
export interface BulletNode extends ContentNode {
  type: 'bullet';
}

/** numbered list item with inline content */
export interface EnumNode extends ContentNode {
  type: 'enum';
}

/** block quote containing inline content */
export interface QuoteNode extends ContentNode {
  type: 'quote';
}

/** fenced code block with optional language */
export interface CodeNode extends ContentNode {
  type: 'code';
  annotations?: {
    /** programming language for syntax highlighting */
    language?: string;
  } & Annotations;
}

/** table block container */
export interface TableNode extends ContainerNode {
  type: 'table';
  /** header row for the table (undefined when no separator line present) */
  headers?: HeaderNode[];
  /** data rows for the table */
  children: RowNode[];
}

/** table header row */
export interface HeaderNode extends ContentNode {
  type: 'header';
  annotations?: {
    /** horizontal alignment of column content */
    alignment?: 'left' | 'center' | 'right';
  } & Annotations;
  /** a header root cannot have further nested child blocks */
  children?: never;
}

/** layout block containing multiple columns */
export interface LayoutNode extends ContainerNode {
  type: 'layout';
  /** columns within this layout */
  children: ColumnNode[];
}

/** column within a layout with proportional sizing */
export interface ColumnNode extends ContainerNode {
  type: 'column';
  annotations?: {
    /** proportional width ratio of this column relative to siblings */
    ratio?: number;
  } & Annotations;
  /** block content within this column */
  children: BlockNode[];
}

/** table row containing cells */
export interface RowNode extends ContainerNode {
  type: 'row';
  children: CellNode[];
}

/** table cell with inline content */
export interface CellNode extends ContentNode {
  type: 'cell';
  /** a cell can't have a children */
  children?: never;
}

/** checkbox item with optional completion flag */
export interface TodoNode extends ContentNode {
  type: 'todo';
  annotations?: {
    /** whether the checkbox item is completed */
    checked?: boolean;
  } & Annotations;
}

/** horizontal rule separator */
export interface DividerNode extends CustomNode {
  type: 'divider';
  /** dividers have no content */
  content?: never;
  /** dividers have no children */
  children?: never;
}

/** block-level math display equation */
export interface EquationNode extends ContentNode {
  type: 'equation';
}

/** string literal union of all supported native block type identifiers */
export type NativeBlockType = NativeBlockNode['type'];

/** union of all native block node types in the AST */
export type NativeBlockNode =
  | HeadingNode
  | ParagraphNode
  | BulletNode
  | EnumNode
  | QuoteNode
  | CodeNode
  | TableNode
  | LayoutNode
  | ColumnNode
  | HeaderNode
  | RowNode
  | CellNode
  | TodoNode
  | DividerNode
  | EquationNode;

/** union of native and custom block nodes */
export type BlockNode = NativeBlockNode | CustomNode;

// INLINE NODES //

/** base structure shared by all inline-level nodes */
export interface InlineNodeBase {
  /** inline node type discriminator */
  type: string;
  /** source position for error reporting and editing */
  range?: Range;
  /** optional unique reference identifier */
  ref?: string;
  /** inline-level annotations */
  annotations?: Annotations;
}

/** text formatting style applied to inline text */
export type InlineTextFormat =
  | 'bold'
  | 'italic'
  | 'code'
  | 'strikethrough'
  | 'underline';

/** plain or formatted text span */
export interface InlineTextNode extends InlineNodeBase {
  type: 'text';
  /** raw text content of the inline text node */
  text: string;
  /** text formatting styles applied to this span */
  formats?: InlineTextFormat[];
}

/** hyperlink element with caption and target URL */
export interface InlineLinkNode extends InlineNodeBase {
  type: 'link';
  /** text nodes for the caption */
  caption: InlineTextNode[];
  /** target URL or reference */
  link: string;
}

/** inline media element with caption and source URL */
export interface InlineMediaNode extends InlineNodeBase {
  type: 'media';
  /** text nodes for the caption */
  caption: InlineTextNode[];
  /** target media URL */
  src: string;
}

/** metadata inline element for special semantic content */
export interface InlineMetaNode extends InlineNodeBase {
  type: 'meta';
  /** text nodes for the caption */
  caption: InlineTextNode[];
}

/** union of all inline node types in the AST */
export type InlineNode =
  | InlineTextNode
  | InlineLinkNode
  | InlineMediaNode
  | InlineMetaNode;
