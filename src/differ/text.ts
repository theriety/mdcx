/**
 * text extraction utilities for the differ module
 *
 * provides helper functions for extracting text content from AST nodes
 */

import type { BlockNode, InlineNode } from '#types/ast';

/**
 * extracts text content from a block node for similarity comparison
 * @param node block node to extract text from
 * @returns concatenated text content
 */
export function extractTextContent(node: BlockNode): string {
  if ('content' in node && Array.isArray(node.content)) {
    return node.content
      .map((inline: InlineNode) => (inline.type === 'text' ? inline.text : ''))
      .join(' ')
      .trim();
  }

  return '';
}
