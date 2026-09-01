import { ParseError } from '#errors';
import { findFlowMappingEnd } from '#lexer/flow-mapping';

/** parameters for locating a delimiter in inline content */
export interface FindDelimiterParams {
  content: string;
  startIndex: number;
  delimiter: string;
}

/**
 * finds the index of a closing delimiter, stopping at newlines
 * @param params delimiter search inputs
 * @param params.content string to search
 * @param params.startIndex index where searching begins
 * @param params.delimiter delimiter to locate
 * @returns delimiter index, or -1 when absent before a newline
 */
export function findDelimiter(params: FindDelimiterParams): number {
  const { content, startIndex, delimiter } = params;
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === delimiter) {
      return i;
    }

    if (content[i] === '\n') {
      return -1;
    }
  }

  return -1;
}

/**
 * finds the closing }} of an annotation block, stopping at newlines
 * @param content the string to search in
 * @param startIndex index of the opening {{
 * @returns raw annotation content and end index, or null if invalid
 */
export function parseAnnotationSpan(
  content: string,
  startIndex: number,
): { raw: string; endIndex: number } | null {
  if (!content.startsWith('{{', startIndex)) {
    return null;
  }

  const mappingStart = startIndex + 1;
  const mappingEnd = findFlowMappingEnd({
    source: content,
    startIndex: mappingStart,
    options: { context: 'Inline annotation' },
  });
  if (mappingEnd === null || content[mappingEnd] !== '}') {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Inline annotation requires a balanced flow mapping and outer closing brace.',
    );
  }

  return {
    raw: content.slice(mappingStart, mappingEnd),
    endIndex: mappingEnd + 1,
  };
}
