import { DEFAULT_RANGE } from './ranges';

import type {
  InlineMetaNode,
  InlineNode,
  InlineLinkNode,
  InlineMediaNode,
  InlineTextNode,
} from '#types';

/**
 * creates a TextNode for testing
 * @param text the text content
 * @param overrides optional property overrides (formats, annotations, range)
 * @returns a TextNode for testing
 * @example
 * ```typescript
 * const plain = createTextNode('Hello');
 * const bold = createTextNode('Important', { formats: ['bold'] });
 * ```
 */
export function createTextNode(
  text: string,
  overrides?: Partial<InlineTextNode>,
): InlineTextNode {
  return {
    type: 'text',
    text,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates a LinkNode for testing
 * @param text the link display text
 * @param link the URL/href
 * @param overrides optional property overrides
 * @returns a LinkNode for testing
 * @example
 * ```typescript
 * const link = createLinkNode('Click here', 'https://example.com');
 * ```
 */
export function createLinkNode(
  text: string,
  link: string,
  overrides?: Partial<InlineLinkNode>,
): InlineLinkNode {
  const caption = [createTextNode(text)];

  return {
    type: 'link',
    caption,
    link,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates a MediaNode for testing
 * @param text the alt text
 * @param src the media source URL
 * @param overrides optional property overrides
 * @returns a MediaNode for testing
 * @example
 * ```typescript
 * const image = createMediaNode('A photo', 'https://example.com/photo.jpg');
 * ```
 */
export function createMediaNode(
  text: string,
  src: string,
  overrides?: Partial<InlineMediaNode>,
): InlineMediaNode {
  const caption = [createTextNode(text)];

  return {
    type: 'media',
    caption,
    src,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates a MetaNode with annotations for testing metadata-style inline content
 * @param text the text content
 * @param overrides optional property overrides (must include annotations)
 * @returns a MetaNode with annotations
 * @example
 * ```typescript
 * const meta = createMetaNode('+12%', { annotations: { type: 'delta' } });
 * ```
 */
export function createMetaNode(
  text: string,
  overrides?: Partial<InlineMetaNode>,
): InlineMetaNode {
  const caption = [createTextNode(text)];

  return {
    type: 'meta',
    caption,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates an InlineNode (generic text node) for testing
 * @param text the text content
 * @returns an InlineNode for testing
 * @example
 * ```typescript
 * const node = createInlineNode('Hello');
 * ```
 */
export function createInlineNode(text: string): InlineNode {
  return {
    type: 'text',
    text,
    range: DEFAULT_RANGE,
  };
}
