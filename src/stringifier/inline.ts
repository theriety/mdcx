import { stringifyAnnotations } from './annotations';

import type { InlineNode, InlineTextNode } from '#types';

import type { StringifyOptions } from './types';

// FUNCTIONS //

/**
 * stringifies an array of inline nodes to a text string
 * @param content the InlineNode array to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified inline content
 */
export function stringifyInlineContent(
  content?: InlineNode[],
  options?: StringifyOptions,
): string {
  return (
    content?.map((node) => stringifyInlineNode(node, options)).join('') ?? ''
  );
}

/**
 * stringifies a formatted text node into markdown
 * @param node inline text node to stringify
 * @returns markdown string for the text node
 */
function stringifyInlineTextNode(node: InlineTextNode): string {
  return (node.formats ?? []).reduce<string>((text, format) => {
    switch (format) {
      case 'bold':
        return `**${text}**`;
      case 'italic':
        return `*${text}*`;
      case 'strikethrough':
        return `~~${text}~~`;
      case 'code':
        return `\`${text}\``;
      case 'underline':
        return `__${text}__`;
      default:
        // unknown format types are passed through unchanged
        return text;
    }
  }, node.text);
}

/**
 * stringifies a single inline node
 * @param node the InlineNode to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified inline node
 */
export function stringifyInlineNode(
  node: InlineNode,
  options?: StringifyOptions,
): string {
  // step 1: apply format wrappers (bold, italic, etc.)
  const formattedText =
    node.type === 'text'
      ? stringifyInlineTextNode(node)
      : node.caption.map(stringifyInlineTextNode).join('');

  // step 2: compute the annotation string (skip if omitAnnotations is true)
  const annotation = options?.omitAnnotations
    ? ''
    : stringifyAnnotations(node.annotations);

  // step 3: apply link/media/meta wrapper
  switch (node.type) {
    case 'link':
      return `[${formattedText}](${node.link})${annotation}`;
    case 'media':
      return `![${formattedText}](${node.src})${annotation}`;
    default:
      // skip wrapping if there is no annotation
      return annotation ? `[${formattedText}]${annotation}` : formattedText;
  }
}
