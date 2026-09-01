import type { Range } from '#types';

/**
 * creates a Range for a single-line string at document start
 * @param length the length of the content
 * @returns a Range spanning from column 1 to column length+1
 * @example
 * ```typescript
 * const pos = makeStartRange(5); // for "Hello"
 * // pos.start = { line: 1, column: 1, offset: 0 }
 * // pos.end = { line: 1, column: 6, offset: 5 }
 * ```
 */
export const makeStartRange = (length: number): Range => ({
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1 + length, offset: length },
});

/**
 * creates a zero-width Range at document start
 * useful for testing inline content parsing entry points
 * @returns a Range with identical start and end at (1,1,0)
 */
export const START_RANGE: Range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

/**
 * computes the EOF position for a source string
 * @param source the full source string
 * @returns a zero-width Range at the end of the source
 * @example
 * ```typescript
 * const source = 'hello\nworld';
 * const pos = getEofRange(source);
 * // pos.start = { line: 2, column: 6, offset: 11 }
 * // pos.end = { line: 2, column: 6, offset: 11 }
 * ```
 */
export const getEofRange = (source: string): Range => {
  const offset = source.length;
  const line = source.split('\n').length;
  const lastNewline = source.lastIndexOf('\n');
  const column = lastNewline === -1 ? offset + 1 : offset - lastNewline;

  return {
    start: { line, column, offset },
    end: { line, column, offset },
  };
};

/**
 * finds the position of a match within an MDCX source string
 * @param source the full MDCX source string
 * @param match the substring to locate
 * @param startOffset optional offset to start searching from (for multiple occurrences)
 * @returns Range with computed line, column, and offset coordinates
 * @throws {Error} if match is not found
 * @example
 * ```typescript
 * const source = 'hello\nworld';
 * const pos = getRange(source, 'world');
 * // pos.start = { line: 2, column: 1, offset: 6 }
 * // pos.end = { line: 2, column: 6, offset: 11 }
 * ```
 */
export const getRange = (
  source: string,
  match: string,
  startOffset = 0,
): Range => {
  const offset = source.indexOf(match, startOffset);

  if (offset === -1) {
    const message =
      startOffset > 0
        ? `match '${match}' not found in source starting from offset ${startOffset}`
        : `match '${match}' not found in source`;
    throw new Error(message);
  }

  // calculate start coordinates
  const textBeforeMatch = source.slice(0, offset);
  const startLine = textBeforeMatch.split('\n').length;
  const lastNewlineBeforeMatch = textBeforeMatch.lastIndexOf('\n');
  const startColumn =
    lastNewlineBeforeMatch === -1
      ? offset + 1
      : offset - lastNewlineBeforeMatch;

  // calculate end coordinates
  const endOffset = offset + match.length;
  const textBeforeEnd = source.slice(0, endOffset);
  const endLine = textBeforeEnd.split('\n').length;
  const lastNewlineBeforeEnd = textBeforeEnd.lastIndexOf('\n');
  const endColumn =
    lastNewlineBeforeEnd === -1
      ? endOffset + 1
      : endOffset - lastNewlineBeforeEnd;

  return {
    start: { line: startLine, column: startColumn, offset },
    end: { line: endLine, column: endColumn, offset: endOffset },
  };
};
