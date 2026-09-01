/**
 * layout parsing utilities for MDC documents
 *
 * provides functions for building LayoutNode structures from pipe-delimited content
 */

import { ParseError } from '#errors';
import { computeLineOffsets, createLineRange } from '#parser/position';

import { parseAnnotationMapping } from './annotation-profile';
import { parseInlineContent } from './inline';
import { parseAnnotationSpan } from './inline/delimiters';
import {
  isColumnAnnotationRow,
  isTableSeparatorLine,
  splitTableRow,
} from './table';

import type {
  BlockNode,
  ColumnNode,
  LayoutNode,
  ParagraphNode,
  Range,
} from '#types';

import type { ContentBlockContext } from './types';

/** function type for parsing block content recursively */
export type BlockParser = (content: string) => BlockNode[];

/** line with content and position info for layout processing */
export interface TableLine {
  content: string;
  range: Range;
}

interface ApplyColumnAnnotationParams {
  content: string;
  column: ColumnNode;
  range: Range;
}

interface ProcessColumnAnnotationsParams {
  firstLine: TableLine;
  columns: ColumnNode[];
  range: Range;
  columnCount: number;
}

interface BlockParserColumnsParams {
  linesToProcess: TableLine[];
  columns: ColumnNode[];
  columnCount: number;
  blockParser: BlockParser;
}

interface InlineColumnsParams {
  linesToProcess: TableLine[];
  columns: ColumnNode[];
  columnCount: number;
}

interface BuildLayoutNodeParams {
  content: string;
  context: ContentBlockContext;
  blockParser?: BlockParser;
}

interface PrepareLayoutColumnsParams {
  rawLines: string[];
  range: Range;
}

interface PreparedLayoutColumns {
  linesToProcess: TableLine[];
  columns: ColumnNode[];
  columnCount: number;
}

/**
 * normalizes indentation by removing the minimum common leading whitespace
 *
 * finds the minimum leading whitespace across all non-empty lines and strips it
 * this preserves relative indentation while removing table cell padding
 * @param lines array of content lines with potential leading whitespace
 * @returns normalized content string with common leading whitespace removed
 */
export function normalizeIndentation(lines: string[]): string {
  if (lines.length === 0) {
    return '';
  }

  // find minimum leading whitespace among non-empty lines
  let minIndent = Infinity;

  for (const line of lines) {
    // skip empty lines when calculating minimum indent
    if (line.trim() === '') {
      continue;
    }
    const leadingSpaces = line.length - line.trimStart().length;

    minIndent = Math.min(minIndent, leadingSpaces);
  }

  // if no non-empty lines or no common indent, join as-is
  if (minIndent === Infinity || minIndent === 0) {
    return lines.join('\n');
  }

  // strip minimum common whitespace from each line
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

/**
 * constructs a LayoutNode from pipe-delimited content
 *
 * creates columns based on the number of cells in each row
 * the first row may contain column annotations ({{ ... }})
 *
 * when a blockParser is provided, content is aggregated vertically per column
 * and parsed as full block structure (supporting nested lists, headings, etc.)
 * without a blockParser, each cell becomes a paragraph with inline content only
 * @param params layout content and parsing context
 * @param params.content raw content string with pipe-delimited lines
 * @param params.context content block context with position and annotations
 * @param params.blockParser optional function to parse aggregated column content as blocks
 * @returns a LayoutNode with column children
 */
export function buildLayoutNode(params: BuildLayoutNodeParams): LayoutNode {
  const { content, context, blockParser } = params;
  const { range, ref, annotations } = context;
  const rawLines = content.split('\n');

  // persist annotations.type:'column_list' on the layout node so the parsed AST
  // carries the same annotation the notion-sync pull adapter writes; the
  // node-level `type` stays 'layout'. without this the differ sees a phantom
  // annotation change between pulled and parsed layouts.
  const layoutAnnotations = { ...annotations, type: 'column_list' };
  const emptyLayout: LayoutNode = {
    type: 'layout',
    ref,
    annotations: layoutAnnotations,
    children: [],
    range,
  };

  // handle empty content
  if (rawLines.length === 0 || (rawLines.length === 1 && rawLines[0] === '')) {
    return emptyLayout;
  }

  const { linesToProcess, columns, columnCount } = prepareLayoutColumns({
    rawLines,
    range,
  });

  // parse content based on whether blockParser is available
  // both branches receive blockParser so cell-level parsing can delegate to
  // the same pipeline used at the top level (preserving any `onContent`
  // middleware - critical for adapter-registered block types like child_page)
  if (blockParser) {
    parseColumnsWithBlockParser({
      linesToProcess,
      columns,
      columnCount,
      blockParser,
    });
  } else {
    parseColumnsAsInline({ linesToProcess, columns, columnCount });
  }

  return {
    type: 'layout',
    ref,
    annotations: layoutAnnotations,
    children: columns,
    range,
  };
}

/**
 * prepares layout lines, columns, and optional column annotations
 * @param params raw lines and parent source range
 * @param params.rawLines raw content lines
 * @param params.range parent block range for position calculation
 * @returns prepared lines and columns for layout parsing
 */
function prepareLayoutColumns(
  params: PrepareLayoutColumnsParams,
): PreparedLayoutColumns {
  const { rawLines, range } = params;
  const lines = createTableLines(rawLines, range);
  const firstLine = lines[0]!;
  const lastLine = lines.at(-1)!;
  const columnCount = splitTableRow(firstLine.content).length;

  // initialize columns with accurate positions spanning from first to last line.
  // persist annotations.type:'column' to mirror the pull adapter; node-level
  // `type` stays 'column'.
  const columns: ColumnNode[] = Array.from(
    { length: columnCount },
    (): ColumnNode => ({
      type: 'column',
      annotations: { type: 'column' },
      children: [],
      range: {
        start: firstLine.range.start,
        end: lastLine.range.end,
      },
    }),
  );

  let linesToProcess = lines;

  // process column annotation row if present
  if (isColumnAnnotationRow(firstLine.content)) {
    processColumnAnnotations({ firstLine, columns, range, columnCount });
    linesToProcess = lines.slice(1);
  }

  return { linesToProcess, columns, columnCount };
}

/**
 * converts raw content lines into TableLine objects with accurate position info
 * @param rawLines array of raw line strings
 * @param range the parent block's range for computing positions
 * @returns array of TableLine objects with content and range
 */
function createTableLines(rawLines: string[], range: Range): TableLine[] {
  const lineOffsets = computeLineOffsets(rawLines.join('\n'));

  return rawLines.map((line, index) => {
    const lineStartOffset = lineOffsets[index]!;

    return {
      content: line,
      range: createLineRange({
        baseRange: range,
        lineIndex: index,
        lineStartOffset,
        columnOffset: 0,
        length: line.length,
      }),
    };
  });
}

/**
 * applies one complete column annotation to its intrinsic column node
 * @param params column annotation parameters
 * @param params.content trimmed annotation cell content
 * @param params.column target column
 * @param params.range parent source range
 */
function applyColumnAnnotation({
  content,
  column,
  range,
}: ApplyColumnAnnotationParams): void {
  const span = parseAnnotationSpan(content, 0);
  if (span?.endIndex !== content.length) {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Column annotation must be exactly one complete annotation.',
      range.start,
    );
  }
  const annotations = parseAnnotationMapping({
    source: span.raw,
    context: {
      baseLine: range.start.line,
      name: 'Column annotation',
      position: range.start,
    },
  });
  if (typeof annotations.ref === 'string') {
    column.ref = annotations.ref;
  }
  if (typeof annotations.ratio === 'number') {
    column.ratio = annotations.ratio;
    column.annotations = { ...column.annotations, ratio: annotations.ratio };
  }
  if (typeof annotations.width_ratio === 'number') {
    column.annotations = {
      ...column.annotations,
      width_ratio: annotations.width_ratio,
    };
  }
}

/**
 * processes column annotations from the first row
 * @param params column annotation processing parameters
 * @param params.firstLine the first line containing annotations
 * @param params.columns column nodes to update
 * @param params.range parent range for position calculation
 * @param params.columnCount number of columns
 */
function processColumnAnnotations({
  firstLine,
  columns,
  range,
  columnCount,
}: ProcessColumnAnnotationsParams): void {
  const annoCells = splitTableRow(firstLine.content);

  for (let i = 0; i < Math.min(annoCells.length, columnCount); i++) {
    const annoCell = annoCells[i]!;
    const column = columns[i]!;

    const annoContent = annoCell.trim();

    if (annoContent.startsWith('{{')) {
      applyColumnAnnotation({ content: annoContent, column, range });
    }
  }
}

/**
 * parses column content using a block parser for full structure support
 * @param params block parser column processing parameters
 * @param params.linesToProcess lines to process (excluding annotation row)
 * @param params.columns column nodes to populate
 * @param params.columnCount number of columns
 * @param params.blockParser function to parse block content
 */
function parseColumnsWithBlockParser({
  linesToProcess,
  columns,
  columnCount,
  blockParser,
}: BlockParserColumnsParams): void {
  // aggregate content per column, preserving leading whitespace for indentation
  const columnContents: string[][] = Array.from(
    { length: columnCount },
    () => [],
  );

  for (const line of linesToProcess) {
    // skip separator lines
    if (isTableSeparatorLine(line.content)) {
      continue;
    }

    const cells = splitTableRow(line.content, true);

    for (let i = 0; i < Math.min(cells.length, columnCount); i++) {
      const cell = cells[i]!;
      const columnLines = columnContents[i]!;

      // always add the cell content (even if empty) to maintain line alignment
      // but only add non-empty lines to the aggregated content
      if (cell.trim()) {
        columnLines.push(cell);
      }
    }
  }

  // parse aggregated content for each column
  for (let i = 0; i < columnCount; i++) {
    const lines = columnContents[i]!;
    const column = columns[i]!;

    if (lines.length === 0) {
      continue;
    }

    // normalize indentation by removing common leading whitespace from all lines
    // this strips table cell padding while preserving relative indentation
    // lines only contains cells with truthy trim(), so normalized always has content
    const normalized = normalizeIndentation(lines);

    column.children = blockParser(normalized);
  }
}

/**
 * parses column content cell-by-cell, wrapping each cell as a paragraph
 *
 * used in the inline-only branch when no block parser is available; each cell
 * is turned into a paragraph block whose inline content is parsed in place,
 * preserving backward-compatible behavior for plain-prose cells
 * @param params inline column processing parameters
 * @param params.linesToProcess lines to process (excluding annotation row)
 * @param params.columns column nodes to populate
 * @param params.columnCount number of columns
 */
function parseColumnsAsInline({
  linesToProcess,
  columns,
  columnCount,
}: InlineColumnsParams): void {
  for (const line of linesToProcess) {
    // skip separator lines
    if (isTableSeparatorLine(line.content)) {
      continue;
    }

    const cells = splitTableRow(line.content);

    for (let i = 0; i < Math.min(cells.length, columnCount); i++) {
      const cell = cells[i]!;
      const column = columns[i]!;

      const cellContent = cell.trim();

      if (!cellContent) {
        continue;
      }

      const cellNode = parseCellAsParagraph(cellContent, line.range);

      column.children.push(cellNode);
    }
  }
}

/**
 * wraps a single cell content string in a paragraph block
 *
 * used in the inline-only branch (no blockParser available) to keep plain-prose
 * cells fully intact while still emitting a BlockNode that fits the column
 * children array
 * @param cellContent trimmed cell content string
 * @param range source range for position info
 * @returns paragraph BlockNode for the cell
 */
function parseCellAsParagraph(cellContent: string, range: Range): BlockNode {
  const paragraph: ParagraphNode = {
    type: 'paragraph',
    content: parseInlineContent(cellContent, range),
    range,
  };

  return paragraph;
}
