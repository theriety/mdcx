/**
 * character scanner for lexer with position tracking
 *
 * tracks position (line, column, offset) while scanning source and
 * provides methods for peeking, advancing, and matching characters
 */

import { ParseError } from '#errors';

import type { Position } from '#types';

/** stateful character-by-character scanner for lexer token extraction */
export class Scanner {
  /** source string being scanned */
  readonly #source: string;

  /** current character offset (0-based) */
  #offset: number;

  /** current line number (1-based) */
  #line: number;

  /** current column number (1-based) */
  #column: number;

  /**
   * creates a new Scanner for the given source string
   * @param source the source string to scan
   */
  constructor(source: string) {
    this.#source = source;
    this.#offset = 0;
    this.#line = 1;
    this.#column = 1;
  }

  /** complete immutable source being scanned */
  public get source(): string {
    return this.#source;
  }

  /**
   * returns the current character without consuming it
   * @returns current character or empty string if at end
   */
  public peek(): string {
    if (this.isAtEnd()) {
      return '';
    }

    return this.#source.charAt(this.#offset);
  }

  /**
   * returns character n positions ahead without consuming
   * @param n the number of positions to look ahead (1 = next character)
   * @returns character at offset + n or empty string if beyond end
   */
  public peekAhead(n: number): string {
    const index = this.#offset + n;

    if (index >= this.#source.length) {
      return '';
    }

    return this.#source.charAt(index);
  }

  /**
   * returns n characters as string without consuming
   * @param n the number of characters to peek
   * @returns string of n characters from current position
   */
  public peekN(n: number): string {
    return this.#source.slice(this.#offset, this.#offset + n);
  }

  /**
   * consumes and returns the current character
   *
   * updates position tracking:
   * - increments offset
   * - increments line and resets column on newline
   * - otherwise increments column
   * @returns consumed character or empty string if at end
   */
  public advance(): string {
    if (this.isAtEnd()) {
      return '';
    }

    const char = this.#source.charAt(this.#offset);
    this.#offset++;

    if (char === '\n') {
      this.#line++;
      this.#column = 1;
    } else {
      this.#column++;
    }

    return char;
  }

  /**
   * consumes n characters and returns them as a string
   * @param n the number of characters to consume
   * @returns consumed characters (may be shorter if hitting end)
   */
  public advanceN(n: number): string {
    const chars: string[] = [];

    for (let i = 0; i < n && !this.isAtEnd(); i++) {
      chars.push(this.advance());
    }

    return chars.join('');
  }

  /**
   * checks if scanner has reached end of source
   * @returns true if at or beyond end of source
   */
  public isAtEnd(): boolean {
    return this.#offset >= this.#source.length;
  }

  /**
   * checks if source at current position matches expected string
   *
   * does not consume characters regardless of match result
   * @param expected the string to match against
   * @returns true if source matches expected at current position
   */
  public match(expected: string): boolean {
    if (this.#offset + expected.length > this.#source.length) {
      return false;
    }

    const slice = this.#source.slice(
      this.#offset,
      this.#offset + expected.length,
    );

    return slice === expected;
  }

  /**
   * consumes expected string if it matches at current position
   * @param expected the string to match and consume
   * @returns true if matched and consumed, false otherwise
   */
  public consumeIf(expected: string): boolean {
    if (this.match(expected)) {
      this.advanceN(expected.length);

      return true;
    }

    return false;
  }

  /**
   * returns current position in source
   * @returns object with line, column, and offset
   */
  public getRange(): Position {
    return {
      line: this.#line,
      column: this.#column,
      offset: this.#offset,
    };
  }

  /**
   * checks if scanner is at start of a line
   * @returns true if at column 1
   */
  public isAtLineStart(): boolean {
    return this.#column === 1;
  }

  /**
   * counts leading spaces and returns indent level (2 spaces = 1 level)
   *
   * consumes the complete prefix after validating exact two-space levels
   * @returns indent level (0 = no indent, 1 = 2 spaces, 2 = 4 spaces, etc.)
   */
  public measureIndent(): number {
    let spaces = 0;
    let pos = this.#offset;

    while (pos < this.#source.length && this.#source[pos] === ' ') {
      spaces++;
      pos++;
    }
    if (spaces % 2 !== 0) {
      throw new ParseError(
        'MDC_INDENTATION_INVALID',
        `Odd indentation of ${spaces} spaces is invalid; MDC requires exactly two spaces per level.`,
        this.getRange(),
      );
    }
    this.advanceN(spaces);

    return spaces / 2;
  }

  /**
   * consumes until end of line (not including newline)
   * @returns consumed characters up to newline
   */
  public consumeUntilNewline(): string {
    const chars: string[] = [];

    while (!this.isAtEnd() && this.peek() !== '\n') {
      chars.push(this.advance());
    }

    return chars.join('');
  }
}
