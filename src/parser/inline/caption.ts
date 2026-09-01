import { parseFormattedText } from './format';
import { createTextNode } from './text';

import type { InlineTextNode, Range } from '#types';

/** parameters for parsing caption content into inline text nodes */
export interface ParseInlineCaptionParams {
  content: string;
  startIndex: number;
  endIndex: number;
  baseRange?: Range;
}

/**
 * parses caption content into inline text nodes (text + formatting only)
 * @param params caption content and parsing boundaries
 * @param params.content full content string to parse
 * @param params.startIndex zero-based offset where parsing begins
 * @param params.endIndex exclusive offset where parsing stops
 * @param params.baseRange optional base position for source mapping; when omitted, nodes have undefined ranges
 * @returns array of parsed caption text nodes
 */
export function parseInlineCaption(
  params: ParseInlineCaptionParams,
): InlineTextNode[] {
  const { startIndex, endIndex } = params;

  if (startIndex >= endIndex) {
    return [];
  }

  return parseCaptionText(params);
}

/**
 * parses caption text and formatting within validated boundaries
 * @param params caption content and parsing boundaries
 * @param params.content full content string to parse
 * @param params.startIndex zero-based offset where parsing begins
 * @param params.endIndex exclusive offset where parsing stops
 * @param params.baseRange optional base position for source mapping
 * @returns array of parsed caption text nodes
 */
function parseCaptionText(params: ParseInlineCaptionParams): InlineTextNode[] {
  const { content, startIndex, endIndex, baseRange } = params;

  const nodes: InlineTextNode[] = [];
  let i = startIndex;
  const currentTextChars: string[] = [];
  let currentTextStart = startIndex;

  const flushText = (): void => {
    if (!currentTextChars.length) {
      return;
    }

    const currentText = currentTextChars.join('');
    const textEnd = currentTextStart + currentText.length;
    nodes.push(
      createTextNode({
        text: currentText,
        baseRange,
        startOffset: currentTextStart,
        endOffset: textEnd,
      }),
    );
    currentTextChars.length = 0;
  };

  while (i < endIndex) {
    const formatResult = parseFormattedText({
      content,
      startIndex: i,
      baseRange,
      endIndexLimit: endIndex,
    });

    if (formatResult) {
      flushText();
      nodes.push(formatResult.node);
      i = formatResult.nextIndex;
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
