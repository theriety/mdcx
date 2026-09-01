/**
 * table parsing utilities for MDC documents
 *
 * provides functions for building TableNode structures from pipe-delimited content
 */

import {
  computeLineOffsets,
  createLineRange,
  splitTableRowWithRanges,
} from '#parser/position';

import { parseInlineContent } from './inline';

import type { CellNode, HeaderNode, Range, RowNode, TableNode } from '#types';

import type { ContentBlockContext } from './types';

/** alignment type for table columns */
export type Alignment = 'left' | 'center' | 'right';

interface HeaderNodesParams {
  headerLine: string;
  range: Range;
  lineOffset: number;
  alignments: Array<Alignment | undefined>;
}

interface DataRowsParams {
  restLines: string[];
  range: Range;
  lineOffsets: number[];
}

interface AllLinesAsRowsParams {
  lines: string[];
  range: Range;
  lineOffsets: number[];
}

interface HeaderNodeParams {
  content: string;
  range: Range;
  alignment?: Alignment;
}

// for detecting table, row or column
const BOUNDING_PATTERN = /^\|.*\|$/;

/**
 * checks if a content string represents a table row
 *
 * table rows are identified by starting and ending with pipe characters
 * @param content the raw content string to check
 * @returns true if the content matches the table row pattern
 */
export function isBoundingLine(content: string): boolean {
  return BOUNDING_PATTERN.test(content.trim());
}

/**
 * checks if a content string represents a table separator line
 *
 * separator lines contain dashes (with optional colons for alignment) between pipes
 * they appear after the header row to separate it from data rows
 * @param content the raw content string to check
 * @returns true if the content is a valid table separator line
 */
export function isTableSeparatorLine(content: string): boolean {
  if (!isBoundingLine(content)) {
    return false;
  }

  return splitTableRow(content).every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * parses alignment from a separator cell string
 *
 * alignment is determined by the presence of colons:
 * - `:---` (colon at start) -> left aligned
 * - `:---:` (colons at both ends) -> center aligned
 * - `---:` (colon at end only) -> right aligned
 * - `---` (no colons) -> undefined (default alignment)
 * @param cell the separator cell content (e.g., ":---", "---:", ":---:")
 * @returns the alignment or undefined for default
 */
export function parseCellAlignment(cell: string): Alignment | undefined {
  const trimmed = cell.trim();
  const startsWithColon = trimmed.startsWith(':');
  const endsWithColon = trimmed.endsWith(':');

  if (startsWithColon && endsWithColon) {
    return 'center';
  }

  if (startsWithColon) {
    return 'left';
  }

  if (endsWithColon) {
    return 'right';
  }

  return undefined;
}

/**
 * parses alignments from a table separator line
 *
 * extracts alignment information from each cell in the separator row
 * @param separatorLine the separator line content (e.g., "|:---|:---:|---:|")
 * @returns array of alignments corresponding to each column
 */
export function parseAlignments(
  separatorLine: string,
): Array<Alignment | undefined> {
  return splitTableRow(separatorLine).map(parseCellAlignment);
}

/**
 * splits a table row string into individual cell contents
 *
 * removes leading and trailing pipes, then splits on remaining pipe characters
 * by default, each cell's content is trimmed of whitespace
 * @param row the raw table row string (e.g., "| cell1 | cell2 |")
 * @param preserveLeading when true, preserves leading whitespace for indentation detection
 * @returns array of cell content strings
 */
export function splitTableRow(row: string, preserveLeading = false): string[] {
  const trimmed = row.trim();
  let inner = trimmed;

  if (inner.startsWith('|')) {
    inner = inner.slice(1);
  }

  if (inner.endsWith('|')) {
    inner = inner.slice(0, -1);
  }

  return inner
    .split('|')
    .map((cell) => (preserveLeading ? cell.trimEnd() : cell.trim()));
}

/**
 * checks if a content line is a column annotation row
 *
 * column annotation rows contain only annotation syntax ({{ ... }}) or empty cells
 * @param content the raw content string to check
 * @returns true if the line contains column annotations in pipe format
 */
export function isColumnAnnotationRow(content: string): boolean {
  if (!isBoundingLine(content)) {
    return false;
  }

  const cells = splitTableRow(content);

  return cells.every((cell) => {
    const trimmed = cell.trim();

    // empty cells or cells with {{ ... }} annotation format
    return trimmed === '' || /^\{\{.*\}\}$/.test(trimmed);
  });
}

/**
 * constructs a TableNode from content string
 *
 * when a separator line exists:
 * - first line becomes the header row
 * - subsequent non-separator lines become data rows
 * - alignment info is extracted from separator and applied to header nodes
 *
 * when no separator line exists:
 * - headers is undefined
 * - all lines become data rows
 * @param content the raw table content with newline-separated rows
 * @param context the content block context with position and annotations
 * @returns a TableNode with optional headers array and row children
 */
export function buildTableNode(
  content: string,
  context: ContentBlockContext,
): TableNode {
  const { range, ref, annotations } = context;
  const lines = content.split('\n');
  const lineOffsets = computeLineOffsets(content);

  // find separator line to determine if headers exist
  const separatorIndex = lines.findIndex((line) => isTableSeparatorLine(line));
  const separatorLine = lines[separatorIndex] as string | undefined;

  if (separatorLine !== undefined) {
    // traditional table: first line is header, separator separates from data
    const [headerLine = '', ...restLines] = lines;
    const alignments = parseAlignments(separatorLine);

    const headers = buildHeaderNodes({
      headerLine,
      range,
      lineOffset: lineOffsets[0]!,
      alignments,
    });
    const rows = buildDataRows({ restLines, range, lineOffsets });

    return { type: 'table', ref, annotations, headers, children: rows, range };
  }

  // no separator: all lines are data rows, no headers
  const rows = buildAllLinesAsRows({ lines, range, lineOffsets });

  return { type: 'table', ref, annotations, children: rows, range };
}

/**
 * builds header nodes from the header row
 * @param params header line content and position metadata with column alignments
 * @param params.headerLine raw header line content
 * @param params.range parent range for position calculation
 * @param params.lineOffset source position for the header's first character
 * @param params.alignments column alignments from separator
 * @returns parsed header nodes
 */
function buildHeaderNodes(params: HeaderNodesParams): HeaderNode[] {
  const { headerLine, range, lineOffset, alignments } = params;
  const headerCells = splitTableRowWithRanges(headerLine);

  return headerCells.map((cellInfo, index) => {
    const cellRange = createLineRange({
      baseRange: range,
      lineIndex: 0,
      lineStartOffset: lineOffset,
      columnOffset: cellInfo.columnOffset,
      length: cellInfo.length,
    });

    return createHeaderNode({
      content: cellInfo.content,
      range: cellRange,
      alignment: alignments[index],
    });
  });
}

/**
 * builds data rows from remaining lines
 * @param params lines after the header and their position metadata
 * @param params.restLines lines after the header
 * @param params.range parent range for position calculation
 * @param params.lineOffsets array of line offsets
 * @returns array of RowNode
 */
function buildDataRows(params: DataRowsParams): RowNode[] {
  const { restLines, range, lineOffsets } = params;
  const rows: RowNode[] = [];
  let lineIndex = 1;

  for (const line of restLines) {
    if (isTableSeparatorLine(line)) {
      lineIndex++;
      continue;
    }

    const cellInfos = splitTableRowWithRanges(line);
    // computeLineOffsets returns one offset per content line.
    const lineOffset = lineOffsets[lineIndex]!;
    const rowRange = createLineRange({
      baseRange: range,
      lineIndex,
      lineStartOffset: lineOffset,
      columnOffset: 0,
      length: line.length,
    });

    const children: CellNode[] = cellInfos.map((cellInfo) => {
      const cellRange = createLineRange({
        baseRange: range,
        lineIndex,
        lineStartOffset: lineOffset,
        columnOffset: cellInfo.columnOffset,
        length: cellInfo.length,
      });

      return createCellNode(cellInfo.content, cellRange);
    });

    rows.push({ type: 'row', children, range: rowRange });
    lineIndex++;
  }

  return rows;
}

/**
 * builds all lines as data rows (when no separator exists)
 * @param params lines to process as data rows and their position metadata
 * @param params.lines all lines to process as data rows
 * @param params.range parent range for position calculation
 * @param params.lineOffsets array of line offsets
 * @returns array of RowNode
 */
function buildAllLinesAsRows(params: AllLinesAsRowsParams): RowNode[] {
  const { lines, range, lineOffsets } = params;
  const rows: RowNode[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const cellInfos = splitTableRowWithRanges(line);
    // computeLineOffsets returns one offset per content line.
    const lineOffset = lineOffsets[lineIndex]!;
    const rowRange = createLineRange({
      baseRange: range,
      lineIndex,
      lineStartOffset: lineOffset,
      columnOffset: 0,
      length: line.length,
    });

    const children: CellNode[] = cellInfos.map((cellInfo) => {
      const cellRange = createLineRange({
        baseRange: range,
        lineIndex,
        lineStartOffset: lineOffset,
        columnOffset: cellInfo.columnOffset,
        length: cellInfo.length,
      });

      return createCellNode(cellInfo.content, cellRange);
    });

    rows.push({ type: 'row', children, range: rowRange });
  }

  return rows;
}

/**
 * creates a HeaderNode from header cell content string
 *
 * parses the cell content for inline formatting (bold, italic, links, etc.)
 * empty cells result in an empty content array
 * @param params header content, source range, and optional alignment
 * @param params.content the raw header cell content string
 * @param params.range the source position for error reporting and source mapping
 * @param params.alignment optional column alignment
 * @returns a HeaderNode with parsed inline content and optional alignment
 */
function createHeaderNode(params: HeaderNodeParams): HeaderNode {
  const { content, range, alignment } = params;
  const trimmed = content.trim();

  return {
    type: 'header',
    content: parseInlineContent(trimmed, range),
    ...(alignment && { alignment }),
    range,
  };
}

/**
 * creates a CellNode from cell content string
 *
 * parses the cell content for inline formatting (bold, italic, links, etc.)
 * empty cells result in an empty content array
 * @param content the raw cell content string
 * @param range the source position for error reporting and source mapping
 * @returns a CellNode with parsed inline content
 */
function createCellNode(content: string, range: Range): CellNode {
  const trimmed = content.trim();

  return {
    type: 'cell',
    content: parseInlineContent(trimmed, range),
    range,
  };
}
