import { createInlineRange } from '#parser/position';

import { parseTrailingAnnotation } from './annotation';
import { parseInlineCaption } from './caption';
import { findDelimiter } from './delimiters';

import type { Range } from '#types';

import type { ParseResult } from '../types';

/** parameters for parsing one markdown link */
export interface ParseLinkParams {
  content: string;
  startIndex: number;
  baseRange?: Range;
}

/**
 * parses markdown link: [text](url)
 * @param params link parsing inputs
 * @param params.content full content string to parse
 * @param params.startIndex index to start parsing from
 * @param params.baseRange optional base position for source mapping; when omitted, node has undefined range
 * @returns parsed node and next index, or null if not a link
 */
export function parseLink(params: ParseLinkParams): ParseResult | null {
  const { content, startIndex, baseRange } = params;
  if (content[startIndex] !== '[') {
    return null;
  }

  const bracketEnd = findDelimiter({
    content,
    startIndex: startIndex + 1,
    delimiter: ']',
  });

  if (bracketEnd === -1 || content[bracketEnd + 1] !== '(') {
    return null;
  }

  const parenEnd = findDelimiter({
    content,
    startIndex: bracketEnd + 2,
    delimiter: ')',
  });

  if (parenEnd === -1) {
    return null;
  }

  const caption = parseInlineCaption({
    content,
    startIndex: startIndex + 1,
    endIndex: bracketEnd,
    baseRange,
  });
  const link = content.slice(bracketEnd + 2, parenEnd);
  let endIndex = parenEnd + 1;

  // check for optional annotation after link
  const annoResult = parseTrailingAnnotation(content, {
    baseLine: baseRange?.start.line,
    startIndex: parenEnd + 1,
  });
  const annotations = annoResult?.annotations;

  if (annoResult) {
    endIndex = annoResult.endIndex;
  }

  return {
    node: {
      type: 'link',
      caption,
      link,
      annotations,
      range: baseRange
        ? createInlineRange(baseRange, startIndex, endIndex)
        : undefined,
    },
    nextIndex: endIndex,
  };
}
