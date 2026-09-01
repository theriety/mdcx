import { tokenize } from '#lexer/tokenize';
import { buildAst } from '#parser/build';
import { validateParseOptions } from '#parser/diagnostics';
import {
  recoverSourceIndentation,
  recoverTokens,
  restoreTokenRanges,
} from '#parser/recovery';

import type { ParseOptions } from '#parser/types';
import type { DocumentNode } from '#types';

export { parseInlineContent } from '#parser/inline/content';

// FUNCTIONS //

/**
 * parses an MDC document string into a typed Abstract Syntax Tree
 * @param mdc the MDC document string to parse
 * @param options optional configuration object
 * @returns the root document node containing all parsed content
 * @example
 * ```typescript
 * // basic usage
 * const ast = parse(mdcString);
 *
 * // with default annotations
 * const ast = parse(mdcString, {
 *   type: 'document',
 *   annotations: { author: 'system' },
 * });
 *
 * ```
 */
export function parse(mdc: string, options?: ParseOptions): DocumentNode {
  validateParseOptions(options);
  if (options?.mode === 'recover') {
    const recovered = recoverSourceIndentation(mdc, options.onDiagnostic);
    const tokens = tokenize(recovered.source);
    recoverTokens({ tokens, source: recovered, options });
    restoreTokenRanges(tokens, recovered);

    return buildAst(tokens, options);
  }
  const tokens = tokenize(mdc);

  return buildAst(tokens, options);
}
