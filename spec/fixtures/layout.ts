import { DEFAULT_RANGE } from './ranges';

import type { BlockNode, ColumnNode, LayoutNode } from '#types';

/**
 * creates a ColumnNode for testing
 * @param children the block nodes inside the column
 * @param overrides optional property overrides (ref, annotations, range)
 * @returns a ColumnNode for testing
 * @example
 * ```typescript
 * const col = createColumn([createParagraph('Content')]);
 * const colWithRef = createColumn([], { ref: 'col1' });
 * ```
 */
export function createColumn(
  children: BlockNode[],
  overrides?: Partial<ColumnNode>,
): ColumnNode {
  return {
    type: 'column',
    children,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}

/**
 * creates a LayoutNode for testing
 * @param columns the column nodes inside the layout
 * @param overrides optional property overrides (ref, annotations, range)
 * @returns a LayoutNode for testing
 * @example
 * ```typescript
 * const layout = createLayout([createColumn([]), createColumn([])]);
 * const layoutWithRef = createLayout([], { ref: 'layout1' });
 * ```
 */
export function createLayout(
  columns: ColumnNode[],
  overrides?: Partial<LayoutNode>,
): LayoutNode {
  return {
    type: 'layout',
    children: columns,
    range: DEFAULT_RANGE,
    ...overrides,
  };
}
