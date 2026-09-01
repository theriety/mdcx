import { createInlineRange } from '#parser/position';

import type { InlineTextNode, Range } from '#types';

interface TextNodeParams {
  text: string;
  baseRange: Range | undefined;
  startOffset: number;
  endOffset: number;
}

/**
 * creates a text node with the given content and position
 * @param params text node construction arguments
 * @param params.text raw text content for the node
 * @param params.baseRange optional base position to use for the node; when omitted, node has undefined range
 * @param params.startOffset starting character offset
 * @param params.endOffset ending character offset
 * @returns new TextNode
 */
export function createTextNode(params: TextNodeParams): InlineTextNode {
  const { text, baseRange, startOffset, endOffset } = params;

  return {
    type: 'text',
    text,
    range: baseRange
      ? createInlineRange(baseRange, startOffset, endOffset)
      : undefined,
  };
}
