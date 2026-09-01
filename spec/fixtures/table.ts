import { createInlineNode } from './inline';
import { DEFAULT_RANGE } from './ranges';

import type {
  CellNode,
  HeaderNode,
  InlineNode,
  RowNode,
  TableNode,
} from '#types';

/**
 * creates a CellNode for testing
 * @param text the cell text content
 * @returns a CellNode for testing
 * @example
 * ```typescript
 * const cell = createCell('Value');
 * ```
 */
export function createCell(text: string): CellNode {
  return {
    type: 'cell',
    content: text ? [createInlineNode(text)] : [],
    range: DEFAULT_RANGE,
  };
}

/**
 * creates a RowNode with cells from string array
 * @param cells array of cell text values
 * @returns a RowNode for testing
 * @example
 * ```typescript
 * const row = createRow(['A', 'B', 'C']);
 * ```
 */
export function createRow(cells: string[]): RowNode {
  return {
    type: 'row',
    children: cells.map(createCell),
    range: DEFAULT_RANGE,
  };
}

/**
 * creates a HeaderNode for testing
 * @param text the header text content
 * @param alignment optional column alignment
 * @returns a HeaderNode for testing
 * @example
 * ```typescript
 * const header = createHeader('Name');
 * const rightAligned = createHeader('Price', 'right');
 * ```
 */
export function createHeader(
  text: string,
  alignment?: 'left' | 'center' | 'right',
): HeaderNode {
  return {
    type: 'header',
    content: text ? [createInlineNode(text)] : [],
    annotations: alignment ? { alignment } : undefined,
    range: DEFAULT_RANGE,
  };
}

/**
 * creates a TableNode for testing
 * @param headers array of HeaderNodes
 * @param rows array of RowNodes
 * @param overrides optional property overrides
 * @returns a TableNode for testing
 * @example
 * ```typescript
 * const table = createTable(
 *   [createHeader('A'), createHeader('B')],
 *   [createRow(['1', '2'])]
 * );
 * ```
 */
export function createTable(
  headers: HeaderNode[],
  rows: RowNode[],
  overrides?: Partial<TableNode>,
): TableNode {
  return {
    type: 'table',
    headers,
    children: rows,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates a CellNode with custom inline content
 * @param content array of InlineNodes
 * @returns a CellNode for testing
 * @example
 * ```typescript
 * const cell = createCellWithContent([
 *   { type: 'text', text: 'Bold', formats: ['bold'], range: DEFAULT_RANGE }
 * ]);
 * ```
 */
export function createCellWithContent(content: InlineNode[]): CellNode {
  return {
    type: 'cell',
    content,
    range: DEFAULT_RANGE,
  };
}
