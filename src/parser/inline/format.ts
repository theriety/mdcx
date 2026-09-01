import { createInlineRange } from '#parser/position';

import type { InlineTextFormat, InlineTextNode, Range } from '#types';

import type { ParseResult } from '../types';

/** parameters for parsing one formatted text span */
export interface ParseFormattedTextParams {
  content: string;
  startIndex: number;
  baseRange?: Range;
  endIndexLimit?: number;
}

/** inline format pattern definition */
interface FormatPattern {
  /** start delimiter string */
  start: string;
  /** end delimiter string */
  end: string;
  /** format type to apply */
  format: InlineTextFormat;
}

/** format patterns for inline text formatting */
const FORMAT_PATTERNS: FormatPattern[] = [
  { start: '__', end: '__', format: 'underline' },
  { start: '**', end: '**', format: 'bold' },
  { start: '*', end: '*', format: 'italic' },
  { start: '_', end: '_', format: 'italic' },
  { start: '~~', end: '~~', format: 'strikethrough' },
  { start: '`', end: '`', format: 'code' },
];

/**
 * unwraps a nested formatted span so its formats accumulate with an outer one
 *
 * when the whole inner text is itself a single formatted span (e.g. the
 * `` `x` `` inside `` **`x`** ``), the inner markup is unwrapped and the outer
 * format is prepended to the accumulated chain. otherwise the inner text is
 * kept literal under the single outer format
 * @param text inner text already stripped of the outer delimiter
 * @param format the outer format to prepend
 * @returns the resolved inner text and ordered format chain
 */
function mergeNestedFormats(
  text: string,
  format: InlineTextFormat,
): { text: string; formats: InlineTextFormat[] } {
  const nested = parseFormattedText({ content: text, startIndex: 0 });
  const isFullyNested = nested?.nextIndex === text.length;

  if (!isFullyNested) {
    return { text, formats: [format] };
  }

  return {
    text: nested.node.text,
    formats: [format, ...nested.node.formats!],
  };
}

/**
 * parses formatted text: **bold**, *italic*, ~~strike~~, `code`
 * @param params formatted content and parsing boundaries
 * @param params.content full content string to parse
 * @param params.startIndex index to start parsing from
 * @param params.baseRange optional base position for source mapping; when omitted, node has undefined range
 * @param params.endIndexLimit optional end boundary to prevent parsing beyond a caption span
 * @returns parsed node and next index, or null if not formatted text
 */
export function parseFormattedText(
  params: ParseFormattedTextParams,
): ParseResult<InlineTextNode> | null {
  const { content, startIndex, baseRange, endIndexLimit } = params;

  for (const { start, end, format } of FORMAT_PATTERNS) {
    if (!content.startsWith(start, startIndex)) {
      continue;
    }

    const contentStart = startIndex + start.length;
    const endIndex = content.indexOf(end, contentStart);

    if (endIndex === -1) {
      continue;
    }

    if (endIndexLimit !== undefined && endIndex >= endIndexLimit) {
      continue;
    }

    const text = content.slice(contentStart, endIndex);

    if (!text || text.includes('\n')) {
      continue;
    }

    const merged = mergeNestedFormats(text, format);

    return {
      node: {
        type: 'text',
        text: merged.text,
        formats: merged.formats,
        range: baseRange
          ? createInlineRange(baseRange, startIndex, endIndex + end.length)
          : undefined,
      },
      nextIndex: endIndex + end.length,
    };
  }

  return null;
}
