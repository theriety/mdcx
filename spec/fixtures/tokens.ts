import type { Token, TokenType } from '#lexer/types';

/**
 * creates a test Token with smart position calculation
 * @param value raw string content of the token
 * @param options optional configuration for token creation
 * @param options.type token type discriminator
 * @param options.indent indentation level
 * @param options.line 1-based line number
 * @param options.column 1-based column number
 * @param options.offset 0-based character offset
 * @returns a Token object for testing
 * @example
 * ```typescript
 * // create a simple content token
 * const token = createToken('Hello');
 * // token.type === 'CONTENT'
 * // token.range.end.column === 6
 *
 * // create with custom type and position
 * const directive = createToken('---', { type: 'DIRECTIVE_START', line: 1 });
 * ```
 */
export const createToken = (
  value: string,
  options?: {
    type?: TokenType;
    indent?: number;
    line?: number;
    column?: number;
    offset?: number;
  },
): Token => {
  const type = options?.type ?? 'CONTENT';
  const indent = options?.indent ?? 0;
  const startLine = options?.line ?? 1;
  const startColumn = options?.column ?? 1;
  const startOffset = options?.offset ?? 0;

  return {
    type,
    value,
    range: {
      start: { line: startLine, column: startColumn, offset: startOffset },
      end: {
        line: startLine,
        column: startColumn + value.length,
        offset: startOffset + value.length,
      },
    },
    indent,
  };
};

/**
 * creates an ANNOTATION token with default position
 * @param value the YAML annotation content (including braces)
 * @returns a Token with type 'ANNOTATION'
 * @example
 * ```typescript
 * const token = createAnnotationToken('{ ref: intro }');
 * // token.type === 'ANNOTATION'
 * ```
 */
export const createAnnotationToken = (value: string): Token =>
  createToken(value, { type: 'ANNOTATION' });

/**
 * creates a CONTENT token with optional indentation
 * @param value the content string
 * @param indent indentation level (0 = root, 1 = 2 spaces, etc.)
 * @returns a Token with type 'CONTENT'
 * @example
 * ```typescript
 * const token = createContentToken('# Heading', 0);
 * const nestedToken = createContentToken('- Item', 1);
 * ```
 */
export const createContentToken = (value: string, indent = 0): Token =>
  createToken(value, { type: 'CONTENT', indent });
