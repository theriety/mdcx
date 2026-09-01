import type { Range } from '#types';

// TYPES //

/** information about a cell extracted from a table row */
export interface CellInfo {
  /** trimmed cell content */
  content: string;
  /** 0-based column offset within the line (position of content start) */
  columnOffset: number;
  /** length of the cell content */
  length: number;
}

/** parameters for creating a range for content at a specific line */
export interface LineRangeParams {
  /** the block's starting position */
  baseRange: Range;
  /** 0-based line index within the block */
  lineIndex: number;
  /** character offset from block start to this line */
  lineStartOffset: number;
  /** 0-based column offset within the line */
  columnOffset: number;
  /** content length */
  length: number;
}

// FUNCTIONS //

/**
 * shifts a position by a fixed number of characters
 * @param range the original source position
 * @param offset the character offset to apply (positive moves forward)
 * @returns a new Range with offset applied to columns and offsets
 */
export function offsetRange(range: Range, offset: number): Range {
  if (offset === 0) {
    return range;
  }

  return {
    start: {
      line: range.start.line,
      column: range.start.column + offset,
      offset: range.start.offset + offset,
    },
    end: {
      line: range.end.line,
      column: range.end.column + offset,
      offset: range.end.offset + offset,
    },
  };
}

/**
 * creates a position for inline content relative to a base position
 * @param baseRange the starting Range context
 * @param startOffset character index where content starts
 * @param endOffset character index where content ends
 * @returns Range with computed start/end coordinates
 */
export function createInlineRange(
  baseRange: Range,
  startOffset: number,
  endOffset: number,
): Range {
  const base = baseRange.start;

  return {
    start: {
      line: base.line,
      column: base.column + startOffset,
      offset: base.offset + startOffset,
    },
    end: {
      line: base.line,
      column: base.column + endOffset,
      offset: base.offset + endOffset,
    },
  };
}

/**
 * computes the character offset for each line in a multi-line string
 * @param content multi-line string
 * @returns array of offsets where each line starts (index 0 = 0)
 */
export function computeLineOffsets(content: string): number[] {
  const offsets = [0];
  let index = 0;

  while (index < content.length) {
    const newlineIndex = content.indexOf('\n', index);

    if (newlineIndex === -1) {
      break;
    }

    offsets.push(newlineIndex + 1);
    index = newlineIndex + 1;
  }

  return offsets;
}

/**
 * creates a position for content at a specific line relative to a base position
 * @param params parameters for range creation
 * @returns Range with computed start/end coordinates
 */
export function createLineRange(params: LineRangeParams): Range {
  const { baseRange, lineIndex, lineStartOffset, columnOffset, length } =
    params;
  const base = baseRange.start;

  return {
    start: {
      line: base.line + lineIndex,
      column: columnOffset + 1,
      offset: base.offset + lineStartOffset + columnOffset,
    },
    end: {
      line: base.line + lineIndex,
      column: columnOffset + 1 + length,
      offset: base.offset + lineStartOffset + columnOffset + length,
    },
  };
}

/**
 * splits a table row and tracks column positions for each cell
 * @param row the raw table row string (e.g., "| cell1 | cell2 |")
 * @returns array of cell info with content and column offsets
 */
export function splitTableRowWithRanges(row: string): CellInfo[] {
  const cells: CellInfo[] = [];

  // find the actual content start (skip leading whitespace on the row)
  const rowTrimStart = row.length - row.trimStart().length;
  let currentOffset = rowTrimStart;

  // skip leading pipe if present
  if (row[currentOffset] === '|') {
    currentOffset++;
  }

  // find each cell by scanning for pipes
  let cellStart = currentOffset;

  for (let i = currentOffset; i <= row.length; i++) {
    const char = row[i];

    if (char === '|' || i === row.length) {
      // extract cell content
      const rawContent = row.slice(cellStart, i);
      const trimmedContent = rawContent.trim();

      // calculate the actual position of trimmed content within the cell
      // for empty cells, position at cell content start area
      let contentOffset: number;

      if (trimmedContent.length === 0) {
        // empty cell: position at start of cell content area
        // skip only the leading space that's standard table padding
        const hasLeadingSpace =
          rawContent.length > 0 && rawContent.startsWith(' ');
        contentOffset = cellStart + (hasLeadingSpace ? 1 : 0);
      } else {
        // non-empty cell: position at actual content start
        const leadingWhitespace =
          rawContent.length - rawContent.trimStart().length;
        contentOffset = cellStart + leadingWhitespace;
      }

      cells.push({
        content: trimmedContent,
        columnOffset: contentOffset,
        length: trimmedContent.length,
      });

      cellStart = i + 1;
    }
  }

  // remove trailing empty cell if row ended with pipe
  if (cells.length > 0 && row.trimEnd().endsWith('|')) {
    cells.pop();
  }

  return cells;
}
