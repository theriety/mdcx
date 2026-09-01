import { parseInlineAnnotation } from './annotation';
import { parseFormattedText } from './format';
import { parseLink } from './link';
import { parseMedia } from './media';
import { createTextNode } from './text';

import type { InlineNode, Range } from '#types';

/**
 * parses inline content string into array of InlineNodes
 *
 * handles: text, bold, italic, code, links, media, inline annotations
 * @param content raw inline content string
 * @param baseRange optional position offset for accurate tracking; when omitted, nodes have undefined ranges
 * @returns array of parsed inline nodes
 */
export function parseInlineContent(
  content: string,
  baseRange?: Range,
): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  const currentTextChars: string[] = [];
  let currentTextStart = 0;

  const flushText = (): void => {
    if (currentTextChars.length) {
      const currentText = currentTextChars.join('');
      const endIndex = currentTextStart + currentText.length;
      nodes.push(
        createTextNode({
          text: currentText,
          baseRange,
          startOffset: currentTextStart,
          endOffset: endIndex,
        }),
      );
      currentTextChars.length = 0;
    }
  };

  while (i < content.length) {
    const result =
      parseMedia({ content, startIndex: i, baseRange }) ??
      parseInlineAnnotation({ content, startIndex: i, baseRange }) ??
      parseLink({ content, startIndex: i, baseRange }) ??
      parseFormattedText({ content, startIndex: i, baseRange });

    if (result) {
      flushText();
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }

    const char = content[i] as string | undefined;

    if (char === undefined) {
      break;
    }

    if (!currentTextChars.length) {
      currentTextStart = i;
    }
    currentTextChars.push(char);
    i++;
  }

  flushText();

  return nodes;
}
