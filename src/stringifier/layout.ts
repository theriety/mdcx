import { stringifyAnnotations } from './annotations';
import { indent, padCell } from './utilities';

import type { Annotations, BlockNode, ColumnNode, LayoutNode } from '#types';

import type { StringifyOptions } from './types';

/** function signature for stringifying a BlockNode (injected to avoid circular dependency) */
export type StringifyBlockFn = (
  node: BlockNode,
  options?: StringifyOptions,
) => string[];

/** parameters for computing inline layout column widths */
interface ComputeLayoutColumnWidthsParams {
  columns: ColumnNode[];
  hasAnnotations: boolean;
  options?: StringifyOptions;
  stringifyBlockFn: StringifyBlockFn;
}

/** parameters for rendering the inline layout annotation row */
interface RenderInlineLayoutAnnotationRowParams {
  columns: ColumnNode[];
  columnWidths: number[];
}

/** parameters for rendering inline layout rows */
interface RenderInlineLayoutRowsParams {
  columns: ColumnNode[];
  columnWidths: number[];
  options?: StringifyOptions;
  stringifyBlockFn: StringifyBlockFn;
}

/** parameters for rendering one inline layout row */
interface RenderInlineLayoutRowParams {
  columns: ColumnNode[];
  columnWidths: number[];
  rowIndex: number;
  options?: StringifyOptions;
  stringifyBlockFn: StringifyBlockFn;
}

/** parameters for measuring rendered content in a layout column */
export interface MeasureColumnContentWidthParams {
  column: ColumnNode;
  stringifyBlockFn: StringifyBlockFn;
  options?: StringifyOptions;
}

/** parameters for deciding whether a layout fits inline format */
export interface ShouldUseInlineFormatParams {
  layout: LayoutNode;
  stringifyBlockFn: StringifyBlockFn;
  options?: StringifyOptions;
}

/** parameters for stringifying a layout in a selected format */
export interface StringifyLayoutParams {
  node: LayoutNode;
  options?: StringifyOptions;
  stringifyBlockFn: StringifyBlockFn;
}

/** default page width for layout formatting */
export const PAGE_WIDTH = 80;

// FUNCTIONS //

/**
 * computes the maximum width per column for inline layout format
 * @param columnCount number of columns in the layout
 * @returns maximum character width per column
 */
export function computeMaxColumnWidth(columnCount: number): number {
  // formula: floor(80 / (N + (N-1)/2))
  // N columns need N-1 separators, each separator is ~0.5 column width
  return Math.floor(PAGE_WIDTH / (columnCount + (columnCount - 1) / 2));
}

/**
 * returns one required width from the dense column-width projection
 * @param columnWidths widths mapped from the current layout columns
 * @param columnIndex index from the same layout column projection
 * @returns measured width for the requested column
 */
function requiredColumnWidth(
  columnWidths: number[],
  columnIndex: number,
): number {
  const width = columnWidths[columnIndex];

  // Widths are mapped from the same dense column array consumed by rendering.
  /* c8 ignore start */
  if (width === undefined) {
    throw new RangeError(`Missing layout width for column ${columnIndex}.`);
  }
  /* c8 ignore stop */

  return width;
}

/**
 * calculates the maximum rendered width across all children of a column
 *
 * delegates to the generic block stringifier so any block type (paragraph,
 * child_page, child_database, future block types) is measured consistently
 * @param params column-width measurement inputs
 * @param params.column the ColumnNode to measure
 * @param params.stringifyBlockFn function to stringify BlockNode (injected to avoid circular dependency)
 * @param params.options StringifyOptions configuration
 * @returns maximum width of any row in the column
 */
export function measureColumnContentWidth(
  params: MeasureColumnContentWidthParams,
): number {
  const { column, stringifyBlockFn, options } = params;
  let maxWidth = 0;

  for (const child of column.children) {
    const rendered = stringifyBlockFn(child, options).join(' ');

    maxWidth = Math.max(maxWidth, rendered.length);
  }

  return maxWidth;
}

/**
 * determines if a layout should use inline table format
 * @param params inline-format decision inputs
 * @param params.layout the LayoutNode to evaluate
 * @param params.stringifyBlockFn function to stringify BlockNode (injected to avoid circular dependency)
 * @param params.options StringifyOptions configuration
 * @returns true if all columns fit within width constraints
 */
export function shouldUseInlineFormat(
  params: ShouldUseInlineFormatParams,
): boolean {
  const { layout, stringifyBlockFn, options } = params;
  const columnCount = layout.children.length;

  if (columnCount === 0) {
    return true;
  }

  const maxColumnWidth = computeMaxColumnWidth(columnCount);

  return layout.children.every(
    (column) =>
      measureColumnContentWidth({ column, stringifyBlockFn, options }) <=
      maxColumnWidth,
  );
}

/**
 * stringifies a layout node, choosing inline or nested format based on content width
 * @param params layout stringification inputs
 * @param params.node the LayoutNode to stringify
 * @param params.options StringifyOptions configuration
 * @param params.stringifyBlockFn function to stringify BlockNode (injected to avoid circular dependency)
 * @returns the stringified layout
 */
export function stringifyLayout(params: StringifyLayoutParams): string[] {
  const { node, options, stringifyBlockFn } = params;

  return shouldUseInlineFormat({ layout: node, stringifyBlockFn, options })
    ? stringifyLayoutInline({ node, options, stringifyBlockFn })
    : stringifyLayoutNested({ node, options, stringifyBlockFn });
}

/**
 * computes column widths for inline layout format
 *
 * cell width measurement delegates to the generic block stringifier to stay
 * consistent with the actual rendered output (including block-level annotations
 * and adapter-formatted blocks like child_page / child_database)
 * @param params inputs for computing column widths
 * @returns array of column widths
 */
function computeLayoutColumnWidths(
  params: ComputeLayoutColumnWidthsParams,
): number[] {
  const { columns, hasAnnotations, options, stringifyBlockFn } = params;

  return columns.map((col) => {
    let maxWidth = 0;

    // include annotation row width if present
    if (hasAnnotations && !options?.omitAnnotations) {
      const annotationStr = stringifyAnnotations({
        ...col.annotations,
        ref: col.ref,
      });
      maxWidth = Math.max(maxWidth, annotationStr.length);
    }

    // measure max content width across all rows via generic stringifier
    for (const child of col.children) {
      const content = stringifyBlockFn(child, options).join(' ');
      maxWidth = Math.max(maxWidth, content.length);
    }

    return maxWidth;
  });
}

/**
 * stringifies a layout in inline table format (pipe-delimited)
 *
 * each column cell is rendered by delegating to the generic block stringifier;
 * the layout writer holds no per-block-type knowledge. multi-line block output
 * is collapsed into a single cell via space-join so any block (paragraph,
 * child_page, child_database, future types) renders consistently
 * @param params inline layout stringification inputs
 * @param params.node the LayoutNode to stringify
 * @param params.options StringifyOptions configuration
 * @param params.stringifyBlockFn function to stringify BlockNode (injected to avoid circular dependency)
 * @returns the stringified inline layout
 */
export function stringifyLayoutInline(params: StringifyLayoutParams): string[] {
  const { node, options, stringifyBlockFn } = params;
  const columns = node.children;
  const renderableColumns = columns.map(
    (column): ColumnNode => ({
      ...column,
      annotations: getRenderableColumnAnnotations(column),
    }),
  );
  const hasColumnAnnotations = columns.some(hasRenderableColumnAnnotations);
  const columnWidths = computeLayoutColumnWidths({
    columns: renderableColumns,
    hasAnnotations: hasColumnAnnotations,
    options,
    stringifyBlockFn,
  });

  const annotationRows =
    !options?.omitAnnotations && hasColumnAnnotations
      ? [renderInlineLayoutAnnotationRow({ columns, columnWidths })]
      : [];

  return [
    ...annotationRows,
    ...renderInlineLayoutRows({
      columns,
      columnWidths,
      options,
      stringifyBlockFn,
    }),
  ];
}

/**
 * removes the structural column type from visible annotations
 * @param column column whose annotations are being filtered
 * @returns annotations that may be rendered in inline layout format
 */
function getRenderableColumnAnnotations(column: ColumnNode): Annotations {
  const { type: _type, ...rest } = column.annotations ?? {};

  return rest;
}

/**
 * determines whether a column has annotations visible in inline format
 * @param column column to inspect
 * @returns true when the column has renderable annotations or a reference
 */
function hasRenderableColumnAnnotations(column: ColumnNode): boolean {
  return (
    Object.keys(getRenderableColumnAnnotations(column)).length > 0 ||
    column.ref !== undefined
  );
}

/**
 * renders the annotation row for an inline layout
 * @param params annotation row inputs
 * @returns one pipe-delimited annotation row
 */
function renderInlineLayoutAnnotationRow(
  params: RenderInlineLayoutAnnotationRowParams,
): string {
  const { columns, columnWidths } = params;
  const cells = columns.map((column, colIndex) => {
    const content = stringifyAnnotations({
      ...getRenderableColumnAnnotations(column),
      ref: column.ref,
    });

    return padCell(content, requiredColumnWidth(columnWidths, colIndex));
  });

  return `| ${cells.join(' | ')} |`;
}

/**
 * renders all content rows for an inline layout
 * @param params content row inputs
 * @returns pipe-delimited content rows
 */
function renderInlineLayoutRows(
  params: RenderInlineLayoutRowsParams,
): string[] {
  const { columns, columnWidths, options, stringifyBlockFn } = params;
  const maxRows = Math.max(
    ...columns.map((column) => column.children.length),
    0,
  );
  const rows: string[] = [];

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    rows.push(
      renderInlineLayoutRow({
        columns,
        columnWidths,
        rowIndex,
        options,
        stringifyBlockFn,
      }),
    );
  }

  return rows;
}

/**
 * renders one content row for an inline layout
 * @param params content row inputs
 * @returns one pipe-delimited content row
 */
function renderInlineLayoutRow(params: RenderInlineLayoutRowParams): string {
  const { columns, columnWidths, rowIndex, options, stringifyBlockFn } = params;
  const cells = columns.map((column, colIndex) => {
    const child = column.children[rowIndex] as BlockNode | undefined;

    // runtime guard: columns may have fewer children than maxRows
    if (rowIndex >= column.children.length || child === undefined) {
      return padCell('', requiredColumnWidth(columnWidths, colIndex));
    }

    const rendered = stringifyBlockFn(child, options).join(' ');

    return padCell(rendered, requiredColumnWidth(columnWidths, colIndex));
  });

  return `| ${cells.join(' | ')} |`;
}

/**
 * stringifies a layout in nested block format (indented columns)
 * @param params nested layout stringification inputs
 * @param params.node the LayoutNode to stringify
 * @param params.options StringifyOptions configuration
 * @param params.stringifyBlockFn function to stringify BlockNode (injected to avoid circular dependency)
 * @returns the stringified nested layout
 */
export function stringifyLayoutNested(params: StringifyLayoutParams): string[] {
  const { node, options, stringifyBlockFn } = params;
  const lines: string[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const column = node.children[i] as ColumnNode | undefined;

    if (column === undefined) {
      continue;
    }

    // column annotation (always output type: column for nested format)
    if (!options?.omitAnnotations) {
      lines.push(
        stringifyAnnotations({
          ...column.annotations,
          type: 'column',
          ref: column.ref,
        }),
      );
    }

    // column children (indented by 2 levels)
    for (const child of column.children) {
      lines.push(...stringifyBlockFn(child, options).map(indent));
    }

    // blank line between columns (except after the last one)
    if (i < node.children.length - 1) {
      lines.push('');
    }
  }

  // indent after the {{ type: layout }} annotation block
  return lines.map(indent);
}
