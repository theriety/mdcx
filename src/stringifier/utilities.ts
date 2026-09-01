import type { InlineNode } from '#types';

// TYPE DEFINITIONS //

/** cell text alignment type */
export type CellAlignment = 'left' | 'center' | 'right';

// FUNCTIONS //

/**
 * indents a line by two spaces (non-blank lines only)
 * @param line the line to indent
 * @returns the indented line
 */
export function indent(line: string): string {
  // indent non-blank lines only
  return line ? `  ${line}` : '';
}

/**
 * measures the visible width of inline content (excludes formatting markers)
 * @param content array of inline nodes to measure
 * @returns total visible character width
 */
export function measureVisibleWidth(content: InlineNode[]): number {
  return content.reduce((sum, node) => sum + measureInlineNodeWidth(node), 0);
}

/**
 * calculates the content width of an inline node (excluding annotations and formatting markers)
 * @param node InlineNode to measure
 * @returns character width of visible text content
 */
export function measureInlineNodeWidth(node: InlineNode): number {
  return node.type === 'text'
    ? node.text.length
    : node.caption.reduce((sum, { text }) => sum + text.length, 0);
}

/**
 * pads a cell string to the specified width with the given alignment
 * @param content the cell content string
 * @param width the target width to pad to
 * @param alignment the cell alignment (defaults to 'left')
 * @returns the padded string
 */
export function padCell(
  content: string,
  width: number,
  alignment: CellAlignment = 'left',
): string {
  const contentWidth = content.length;
  const padding = width - contentWidth;

  if (padding <= 0) {
    return content;
  }

  switch (alignment) {
    case 'right':
      return ' '.repeat(padding) + content;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;

      return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
    }
    case 'left':
    default:
      return content + ' '.repeat(padding);
  }
}
