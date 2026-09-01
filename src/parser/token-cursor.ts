import type { Token } from '#lexer/types';

/** mutable cursor over an immutable token stream */
export class TokenCursor {
  /** current token index */
  public position = 0;

  /**
   * creates a token cursor
   * @param tokens immutable token stream
   */
  constructor(public readonly tokens: Token[]) {}

  /**
   * reads a token relative to the current position
   * @param offset relative token offset
   * @returns token at the requested position
   */
  public peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  /**
   * consumes and returns the current token
   * @returns consumed token, or undefined beyond the stream
   */
  public advance(): Token | undefined {
    if (this.isAtEnd()) {
      return undefined;
    }

    return this.tokens[this.position++];
  }

  /**
   * reports whether the cursor has passed the token stream
   * @returns whether no token remains
   */
  public isAtEnd(): boolean {
    return this.position >= this.tokens.length;
  }

  /** consumes consecutive newline separators */
  public skipNewlines(): void {
    while (this.peek()?.type === 'NEWLINE') {
      this.advance();
    }
  }
}
