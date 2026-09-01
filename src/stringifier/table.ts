import { stringifyInlineContent } from './inline';

import { measureVisibleWidth, padCell } from './utilities';

import type { CellNode, HeaderNode, RowNode, TableNode } from '#types';

import type { StringifyOptions } from './types';
import type { CellAlignment } from './utilities';

// CONSTANTS //

/** minimum width for table separator cells (3 chars for :--) */
const MIN_SEPARATOR_WIDTH = 3;

// TYPE DEFINITIONS //

/** metadata for a table column including width and alignment */
interface ColumnMeta {
  /** computed width for the column */
  width: number;
  /** alignment for the column (default is 'left' for padding) */
  alignment: CellAlignment;
}

interface StringifyTableRowWithPaddingParams {
  row: RowNode;
  columnMeta: ColumnMeta[];
  options?: StringifyOptions;
}

// FUNCTIONS //

/**
 * extracts alignment from a header node
 * @param header the HeaderNode to extract alignment from
 * @returns the alignment or undefined if not set
 */
function getHeaderAlignment(
  header: HeaderNode,
): 'left' | 'center' | 'right' | undefined {
  // runtime check: alignment may be set directly by parser or in annotations
  return (
    (header as { alignment?: 'left' | 'center' | 'right' }).alignment ??
    header.annotations?.alignment
  );
}

/**
 * computes column metadata (width and alignment) for each column
 * @param headers array of header nodes
 * @param dataRows array of data row nodes
 * @returns array of column metadata
 */
function computeColumnMeta(
  headers: HeaderNode[],
  dataRows: RowNode[],
): ColumnMeta[] {
  return headers.map((header, colIndex) => {
    // measure header width
    const headerWidth = measureVisibleWidth(header.content);

    // measure max data row width for this column
    const maxDataWidth = dataRows.reduce((max, row) => {
      const cell = row.children[colIndex] as CellNode | undefined;

      if (!cell) {
        return max;
      }

      return Math.max(max, measureVisibleWidth(cell.content));
    }, 0);

    const width = Math.max(headerWidth, maxDataWidth, MIN_SEPARATOR_WIDTH);
    const alignment = getHeaderAlignment(header) ?? 'left';

    return { width, alignment };
  });
}

/**
 * creates a separator cell with dashes and alignment markers
 * @param width the target width for the separator
 * @param alignment the column alignment
 * @returns the separator string (e.g., ':---:', '---:', ':---', '---')
 */
function createSeparatorCell(
  width: number,
  alignment: 'left' | 'center' | 'right' | undefined,
): string {
  switch (alignment) {
    case 'left':
      return ':' + '-'.repeat(width - 1);
    case 'center':
      return ':' + '-'.repeat(width - 2) + ':';
    case 'right':
      return '-'.repeat(width - 1) + ':';
    default:
      return '-'.repeat(width);
  }
}

/**
 * stringifies a table data row
 * @param row the RowNode to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified table row
 */
export function stringifyTableRow(
  row: RowNode,
  options?: StringifyOptions,
): string {
  const cells = row.children.map((cell) =>
    stringifyInlineContent(cell.content, options),
  );

  return `| ${cells.join(' | ')} |`;
}

/**
 * stringifies a table data row with column width padding
 * @param params padded-row stringification inputs
 * @param params.row the RowNode to stringify
 * @param params.columnMeta array of column metadata for padding
 * @param params.options StringifyOptions configuration
 * @returns the stringified and padded table row
 */
function stringifyTableRowWithPadding(
  params: StringifyTableRowWithPaddingParams,
): string {
  const { row, columnMeta, options } = params;
  const cells = columnMeta.map((meta, colIndex) => {
    const cell = row.children[colIndex] as CellNode | undefined;

    if (!cell) {
      return ' '.repeat(meta.width);
    }

    const content = stringifyInlineContent(cell.content, options);

    // skip padding if stringified content already exceeds column width
    // (e.g., formatted text like **Bold** has more chars than visible text)
    if (content.length >= meta.width) {
      return content;
    }

    const paddingNeeded = meta.width - content.length;

    // apply padding based on alignment
    switch (meta.alignment) {
      case 'right':
        return ' '.repeat(paddingNeeded) + content;
      case 'center': {
        const leftPad = Math.floor(paddingNeeded / 2);
        const rightPad = paddingNeeded - leftPad;

        return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
      }
      case 'left':
      default:
        return content + ' '.repeat(paddingNeeded);
    }
  });

  return `| ${cells.join(' | ')} |`;
}

/**
 * stringifies a table node with optional header, separator, and data rows
 *
 * when headers is undefined, only data rows are rendered (identical to layout)
 * @param node the TableNode to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified table
 */
export function stringifyTable(
  node: TableNode,
  options?: StringifyOptions,
): string[] {
  const { headers } = node;

  // if no headers, render only data rows (like a layout) without padding
  if (!headers || headers.length === 0) {
    return node.children.map((row) => stringifyTableRow(row, options));
  }

  // compute column widths and alignments
  const columnMeta = computeColumnMeta(headers, node.children);

  // stringify header row with padding
  const headerCells = columnMeta.map((meta, colIndex) => {
    const header = headers[colIndex] as HeaderNode | undefined;

    if (!header) {
      return padCell('', meta.width);
    }

    const content = stringifyInlineContent(header.content, options);

    return padCell(content, meta.width);
  });
  const headerRow = `| ${headerCells.join(' | ')} |`;

  // create separator with proper width
  const separatorCells = columnMeta.map((meta, colIndex) => {
    const header = headers[colIndex] as HeaderNode | undefined;

    if (!header) {
      return createSeparatorCell(meta.width, undefined);
    }

    return createSeparatorCell(meta.width, getHeaderAlignment(header));
  });
  const separator = `| ${separatorCells.join(' | ')} |`;

  // stringify data rows with padding
  const dataRows = node.children.map((row) =>
    stringifyTableRowWithPadding({ row, columnMeta, options }),
  );

  return [headerRow, separator, ...dataRows];
}
