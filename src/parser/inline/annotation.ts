import { createInlineRange } from '#parser/position';

import { parseAnnotationMapping } from '../annotation-profile';

import { parseInlineCaption } from './caption';

import { findDelimiter, parseAnnotationSpan } from './delimiters';

import type { Annotations, Range } from '#types';

import type { ParseResult } from '../types';

/** parameters for parsing one inline annotation */
export interface ParseInlineAnnotationParams {
  content: string;
  startIndex: number;
  baseRange?: Range;
}

interface BuildInlineAnnotationResultParams {
  content: string;
  startIndex: number;
  bracketEnd: number;
  baseRange?: Range;
  annotationSpan: { raw: string; endIndex: number };
}

/**
 * parses inline annotation: [content]{{ params }}
 * @param params inline annotation parsing inputs
 * @param params.content full content string to parse
 * @param params.startIndex index to start parsing from
 * @param params.baseRange optional base position for source mapping; when omitted, node has undefined range
 * @returns parsed node and next index, or null if not an annotation
 */
export function parseInlineAnnotation(
  params: ParseInlineAnnotationParams,
): ParseResult | null {
  const { content, startIndex, baseRange } = params;
  if (content[startIndex] !== '[') {
    return null;
  }

  // find closing bracket
  const bracketEnd = findDelimiter({
    content,
    startIndex: startIndex + 1,
    delimiter: ']',
  });

  if (bracketEnd === -1) {
    return null;
  }

  // check for {{ immediately after ]
  if (!content.startsWith('{{', bracketEnd + 1)) {
    return null;
  }

  const annoResult = parseAnnotationSpan(content, bracketEnd + 1)!;

  return buildInlineAnnotationResult({
    content,
    startIndex,
    bracketEnd,
    baseRange,
    annotationSpan: annoResult,
  });
}

/**
 * builds the parsed node for a complete inline annotation
 * @param params annotation content, caption boundary, and parsed span
 * @param params.content full content string
 * @param params.startIndex annotation opening bracket index
 * @param params.bracketEnd annotation caption closing bracket index
 * @param params.baseRange optional base position for source mapping
 * @param params.annotationSpan parsed annotation span
 * @returns parsed inline annotation node and next index
 */
function buildInlineAnnotationResult(
  params: BuildInlineAnnotationResultParams,
): ParseResult {
  const { content, startIndex, bracketEnd, baseRange, annotationSpan } = params;
  const caption = parseInlineCaption({
    content,
    startIndex: startIndex + 1,
    endIndex: bracketEnd,
    baseRange,
  });
  const annoContent = annotationSpan.raw;
  const annotations = parseAnnotationMapping({
    source: annoContent,
    context: {
      baseLine: baseRange?.start.line ?? 0,
      name: 'Inline annotation',
      position: baseRange?.start,
    },
  });

  return {
    node: {
      type: 'meta',
      caption,
      annotations,
      range: baseRange
        ? createInlineRange(baseRange, startIndex, annotationSpan.endIndex)
        : undefined,
    },
    nextIndex: annotationSpan.endIndex,
  };
}

/**
 * parses optional trailing annotation: {{ params }}
 * @param content the string to parse
 * @param context context with baseLine and startIndex for parsing
 * @param context.baseLine optional base line number for error reporting; defaults to 0
 * @param context.startIndex index where the opening braces should be
 * @returns annotations and end index, or null if no valid annotation
 */
export function parseTrailingAnnotation(
  content: string,
  context: {
    baseLine?: number;
    startIndex: number;
  },
): { annotations: Annotations; endIndex: number } | null {
  const span = parseAnnotationSpan(content, context.startIndex);

  if (!span) {
    return null;
  }

  const annotations = parseAnnotationMapping({
    source: span.raw,
    context: {
      baseLine: context.baseLine ?? 0,
      name: 'Trailing annotation',
    },
  });

  return { annotations, endIndex: span.endIndex };
}
