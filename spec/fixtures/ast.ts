import { makeStartRange } from './positions';
import { DEFAULT_RANGE } from './ranges';

import type {
  Annotations,
  BlockNode,
  BulletNode,
  CodeNode,
  EnumNode,
  HeadingNode,
  ParagraphNode,
  QuoteNode,
  Range,
  InlineTextNode,
  TodoNode,
} from '#types';

/** options for creating block nodes */
export interface BlockNodeOptions {
  ref?: string;
  annotations?: Annotations;
  range?: Range;
}

/**
 * creates a test ParagraphNode
 * @param text the paragraph text content
 * @param options optional ref, annotations, and position
 * @param options.ref optional unique reference identifier
 * @param options.annotations block-level annotations
 * @param options.range source position for the node
 * @returns a ParagraphNode for testing
 * @example
 * ```typescript
 * const para = createParagraph('Hello world');
 * ```
 */
export const createParagraph = (
  text: string,
  options?: BlockNodeOptions,
): ParagraphNode => ({
  type: 'paragraph',
  ref: options?.ref,
  annotations: options?.annotations,
  content: [createText(text)],
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test TextNode
 * @param text the text content
 * @param formats optional formatting (bold, italic, code, strikethrough)
 * @param options optional ref, annotations, and position
 * @param options.ref optional unique reference identifier
 * @param options.annotations inline-level annotations
 * @param options.range source position for the node
 * @returns a TextNode for testing
 * @example
 * ```typescript
 * const plain = createText('Hello');
 * const bold = createText('Important', ['bold']);
 * const formatted = createText('Code', ['code', 'bold']);
 * ```
 */
export const createText = (
  text: string,
  formats?: Array<'bold' | 'italic' | 'code' | 'strikethrough'>,
  options?: { ref?: string; annotations?: Annotations; range?: Range },
): InlineTextNode => ({
  type: 'text',
  ref: options?.ref,
  annotations: options?.annotations,
  text,
  formats: formats && formats.length > 0 ? formats : undefined,
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test HeadingNode
 * @param text the heading text content
 * @param depth the heading level (1, 2, or 3)
 * @param options optional ref, annotations, and position
 * @returns a HeadingNode for testing
 * @example
 * ```typescript
 * const h1 = createHeading('Title', 1);
 * const h2 = createHeading('Subtitle', 2, { ref: 'intro' });
 * ```
 */
export const createHeading = (
  text: string,
  depth: 1 | 2 | 3,
  options?: BlockNodeOptions,
): HeadingNode => ({
  type: 'heading',
  ref: options?.ref,
  content: [createText(text)],
  annotations: { ...options?.annotations, depth },
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test BulletNode
 * @param text the bullet item text content
 * @param options optional ref, annotations, and position
 * @returns a BulletNode for testing
 * @example
 * ```typescript
 * const item = createBullet('List item');
 * ```
 */
export const createBullet = (
  text: string,
  options?: BlockNodeOptions,
): BulletNode => ({
  type: 'bullet',
  ref: options?.ref,
  annotations: options?.annotations,
  content: [createText(text)],
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test EnumNode (numbered list item)
 * @param text the enum item text content
 * @param options optional ref, annotations, and position
 * @returns an EnumNode for testing
 * @example
 * ```typescript
 * const numbered = createEnum('First item');
 * ```
 */
export const createEnum = (
  text: string,
  options?: BlockNodeOptions,
): EnumNode => ({
  type: 'enum',
  ref: options?.ref,
  annotations: options?.annotations,
  content: [createText(text)],
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test QuoteNode
 * @param text the quote text content
 * @param options optional ref, annotations, and position
 * @returns a QuoteNode for testing
 * @example
 * ```typescript
 * const quote = createQuote('Important quote');
 * ```
 */
export const createQuote = (
  text: string,
  options?: BlockNodeOptions,
): QuoteNode => ({
  type: 'quote',
  ref: options?.ref,
  annotations: options?.annotations,
  content: [createText(text)],
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test TodoNode
 * @param text the item text content
 * @param checked whether the node is checked
 * @param options optional ref, annotations, and position
 * @returns a TodoNode for testing
 * @example
 * ```typescript
 * const pending = createTodo('Task to do', false);
 * const done = createTodo('Completed task', true);
 * ```
 */
export const createTodo = (
  text: string,
  checked: boolean,
  options?: BlockNodeOptions,
): TodoNode => ({
  type: 'todo',
  ref: options?.ref,
  content: [createText(text)],
  annotations: { ...options?.annotations, checked },
  children: [],
  range: options?.range ?? makeStartRange(text.length),
});

/**
 * creates a test CodeNode
 * @param code the code content (can be multiline)
 * @param language optional language identifier
 * @param options optional ref, annotations, and position
 * @returns a CodeNode for testing
 * @example
 * ```typescript
 * const code = createCode('const x = 1;', 'typescript');
 * ```
 */
export const createCode = (
  code: string,
  language?: string,
  options?: BlockNodeOptions,
): CodeNode => ({
  type: 'code',
  ref: options?.ref,
  annotations: options?.annotations,
  content: [createText(code)],
  language,
  children: [],
  range: options?.range ?? makeStartRange(code.length),
});

/**
 * creates a generic BlockNode for testing (useful for custom types or minimal nodes)
 * @param type node discriminator for the minimal fixture
 * @param ref optional unique reference identifier
 * @returns a BlockNode for testing
 * @example
 * ```typescript
 * const node = createBlockNode('paragraph', 'my-ref');
 * ```
 */
export const createBlockNode = (type: string, ref?: string): BlockNode =>
  ({
    type,
    ref,
    children: [],
    range: DEFAULT_RANGE,
  }) as BlockNode;
