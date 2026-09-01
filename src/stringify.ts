import { shouldInsertBlankLine, stringifyBlock } from '#stringifier/blocks';
import { stringifyDirectives } from '#stringifier/directive';

import type { StringifyOptions } from '#stringifier/types';
import type { BlockNode, DocumentNode } from '#types';

export { stringifyInlineContent } from '#stringifier/inline';

/**
 * converts an MDC AST back into an MDC document string
 * @param ast the MDC AST to stringify
 * @param options optional configuration object
 * @returns the MDC document string
 * @example
 * ```typescript
 * // basic round-trip
 * const output = stringify(ast);
 *
 * // pure Markdown output (no annotations)
 * const markdown = stringify(ast, { omitAnnotations: true });
 *
 * // custom block formatting
 * const custom = stringify(ast, {
 *   format: (node, stringifyBlock) => {
 *     if (node.type === 'heading' && node.annotations?.depth === 1) {
 *       return `<!-- H1 -->${stringifyBlock(node)}`;
 *     }
 *     return stringifyBlock(node);
 *   },
 * });
 * ```
 */
export function stringify(
  ast: DocumentNode,
  options?: StringifyOptions,
): string {
  const lines: string[] = [];

  // stringify directive
  lines.push(...stringifyDirectives(ast));

  // stringify blocks
  for (let i = 0; i < ast.children.length; i++) {
    const block = ast.children[i] as BlockNode | undefined;

    if (block === undefined) {
      continue;
    }

    lines.push(...stringifyBlock(block, options));

    // add blank line between top-level blocks (except after the last one)
    if (i < ast.children.length - 1) {
      const next = ast.children[i + 1] as BlockNode | undefined;

      if (next !== undefined && shouldInsertBlankLine(block, next)) {
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
