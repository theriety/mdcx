import { ParseError } from '#errors';
import { tokenize } from '#lexer/tokenize';

import { parseOneBlock } from './block-parser';
import { validateClosingMarker } from './closing';
import { parseDirective } from './directive';
import { TokenCursor } from './token-cursor';

import type { Token } from '#lexer/types';
import type { Annotations, BlockNode, DocumentNode } from '#types';

import type { ParseOptions } from './types';

/** maximum block depth accepted before recursive descent fails closed */
const MAX_BLOCK_NESTING_DEPTH = 128;

/**
 * builds an AST from a token stream
 * @param tokens lexer token stream
 * @param options parser configuration
 * @returns parsed document
 */
export function buildAst(
  tokens: Token[],
  options?: ParseOptions,
): DocumentNode {
  return new AstBuilder(tokens, options).document;
}

/** strict recursive-descent builder for indentation-owned block structure */
class AstBuilder {
  readonly #cursor: TokenCursor;

  readonly #options: ParseOptions;

  #documentAnnotations: Annotations = {};

  public readonly document: DocumentNode;

  /**
   * creates and immediately builds a document
   * @param tokens lexer token stream
   * @param options parser configuration
   */
  constructor(tokens: Token[], options?: ParseOptions) {
    this.#cursor = new TokenCursor(tokens);
    this.#options = { ...options };
    this.document = this.#build();
  }

  /**
   * parses raw content for intrinsic layout cells using identical options
   * @param document raw nested MDC source
   * @returns parsed child blocks
   */
  #blockParser = (document: string): BlockNode[] =>
    buildAst(tokenize(document), this.#options).children;

  /**
   * builds the document root and rejects unowned final markers
   * @returns document node
   */
  #build(): DocumentNode {
    if (this.#cursor.peek()?.type === 'DIRECTIVE_START') {
      this.#parseDirective();
    }
    const children = this.#parseBlocks(0);
    const token = this.#cursor.peek();
    if (token?.type === 'CLOSING_MARKER') {
      throw new ParseError(
        'MDC_CLOSING_MARKER_INVALID',
        'Unexpected closing marker without a local block owner.',
        token.range.start,
      );
    }

    return {
      type: this.#options.type ?? 'document',
      annotations: {
        ...this.#documentAnnotations,
        ...this.#options.annotations,
      },
      children,
    };
  }

  /** collects and parses the optional front-matter directive */
  #parseDirective(): void {
    this.#cursor.advance();
    this.#cursor.skipNewlines();
    const tokens: Token[] = [];
    while (
      !this.#cursor.isAtEnd() &&
      this.#cursor.peek()?.type !== 'DIRECTIVE_END'
    ) {
      const token = this.#cursor.advance();
      if (token) {
        tokens.push(token);
      }
    }
    this.#cursor.advance();
    this.#cursor.skipNewlines();
    this.#documentAnnotations = parseDirective(tokens);
  }

  /**
   * parses sibling blocks at exactly one indentation level
   * @param expectedIndent required logical indentation level
   * @returns sibling blocks at that level
   */
  #parseBlocks(expectedIndent: number): BlockNode[] {
    const blocks: BlockNode[] = [];
    while (!this.#cursor.isAtEnd()) {
      this.#cursor.skipNewlines();
      const token = this.#cursor.peek();
      if (!token || token.type === 'EOF' || token.type === 'CLOSING_MARKER') {
        break;
      }
      if (!this.#acceptsIndent(token, expectedIndent)) {
        break;
      }

      const parsed = parseOneBlock({
        cursor: this.#cursor,
        options: this.#options,
        blockParser: this.#blockParser,
      });
      const children = this.#parseBlocks(expectedIndent + 1);
      if (!parsed.block) {
        continue;
      }
      const block: BlockNode = {
        ...parsed.block,
        children: [...(parsed.block.children ?? []), ...children],
      } as BlockNode;

      const marker = this.#cursor.peek();
      if (marker?.type === 'CLOSING_MARKER') {
        if (marker.indent < expectedIndent) {
          blocks.push(block);
          break;
        }
        validateClosingMarker({
          token: marker,
          block,
          blockIndent: expectedIndent,
        });
        this.#cursor.advance();
        this.#cursor.skipNewlines();
      }
      blocks.push(block);
    }

    return blocks;
  }

  /**
   * checks whether one token belongs to the current indentation level
   * @param token next nonblank token
   * @param expectedIndent required logical indentation level
   * @returns whether the token belongs to this sibling collection
   */
  #acceptsIndent(token: Token, expectedIndent: number): boolean {
    if (token.indent < expectedIndent) {
      return false;
    }
    if (token.indent > expectedIndent) {
      throw new ParseError(
        'MDC_INDENTATION_INVALID',
        `Skipped indentation level: expected level ${expectedIndent}, found level ${token.indent}.`,
        token.range.start,
      );
    }
    if (expectedIndent > MAX_BLOCK_NESTING_DEPTH) {
      throw new ParseError(
        'MDC_INDENTATION_INVALID',
        `Block nesting exceeds the limit of ${MAX_BLOCK_NESTING_DEPTH} levels.`,
        token.range.start,
      );
    }

    return true;
  }
}
