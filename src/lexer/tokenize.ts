import { ParseError } from '#errors';

import { Scanner } from './scanner';
import { scanBlockAnnotation, scanClosingMarker } from './tokenize-annotations';

import type { Token, TokenType } from './types';

// TYPES //

/** mutable state passed to all scan functions */
export interface ScanContext {
  scanner: Scanner;
  tokens: Token[];
  currentIndent: number;
  isInCodeFence: boolean;
  isDocStart: boolean;
}

interface TokenParams {
  type: TokenType;
  value: string;
  start: { line: number; column: number; offset: number };
  end?: { line: number; column: number; offset: number };
}

interface CreateTokenParams {
  type: TokenType;
  value: string;
  context: ScanContext;
}

interface PushDirectiveAnnotationParams {
  context: ScanContext;
  contentStart: { line: number; column: number; offset: number };
  contentChars: string[];
}

// CONSTANTS //

/** character count for delimiter markers (---, ```) */
const DELIMITER_LENGTH = 3;

/** pattern to identify table bounding rows */
const BOUNDING_PATTERN = /^\|.*\|$/;

// TOKEN HELPERS //

/**
 * creates initial scan context for tokenization
 * @param source the raw MDC document string
 * @returns initialized scan context for tokenization
 */
function createContext(source: string): ScanContext {
  return {
    scanner: new Scanner(source),
    tokens: [],
    currentIndent: 0,
    isInCodeFence: false,
    isDocStart: true,
  };
}

/**
 * creates a token at current position
 * @param params token data and active scan context
 * @param params.type the token type discriminator
 * @param params.value the raw string content
 * @param params.context the current scan context
 * @returns token with position and indentation information
 */
function createToken(params: CreateTokenParams): Token {
  const { type, value, context } = params;
  const pos = context.scanner.getRange();

  return {
    type,
    value,
    range: { start: pos, end: pos },
    indent: context.currentIndent,
  };
}

/**
 * creates and pushes a token with explicit start and optional end position
 * @param context current scan context
 * @param params token data
 * @param params.type token type discriminator
 * @param params.value raw string content
 * @param params.start explicit start position coordinates
 * @param params.start.line one-based line number
 * @param params.start.column one-based column number
 * @param params.start.offset zero-based character offset
 * @param params.end explicit end position coordinates; defaults to scanner position
 * @param params.end.line one-based line number
 * @param params.end.column one-based column number
 * @param params.end.offset zero-based character offset
 */
function pushToken(context: ScanContext, params: TokenParams): void {
  const { type, value, start, end } = params;

  context.tokens.push({
    type,
    value,
    range: { start, end: end ?? context.scanner.getRange() },
    indent: context.currentIndent,
  });
}

/**
 * advances a position by the length of the provided value
 * @param start the start position coordinates
 * @param start.line 1-based line number
 * @param start.column 1-based column number
 * @param start.offset 0-based character offset
 * @param value the raw string content
 * @returns end position after consuming the value
 */
function advanceRange(
  start: { line: number; column: number; offset: number },
  value: string,
): { line: number; column: number; offset: number } {
  let line = start.line;
  let column = start.column;
  let offset = start.offset;

  for (const char of value) {
    const width = char.length;
    offset += width;

    if (char === '\n') {
      line += 1;
      column = 1;
    } else {
      column += width;
    }
  }

  return { line, column, offset };
}

/**
 * consumes and emits a newline token when present
 * @param type token type to emit for the newline
 * @param context the current scan context
 */
function pushNewlineToken(type: TokenType, context: ScanContext): void {
  if (context.scanner.peek() !== '\n') {
    return;
  }

  const start = context.scanner.getRange();
  pushToken(context, {
    type,
    value: context.scanner.advance(),
    start,
  });
}

/**
 * trims trailing newline characters from a string
 * @param value the raw string content
 * @returns string without trailing newlines
 */
function trimTrailingNewlines(value: string): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === '\n') {
    end -= 1;
  }

  return value.slice(0, end);
}

/**
 * emits nonempty directive content as one annotation token
 * @param params accumulated directive content and its source position
 * @param params.context the current scan context
 * @param params.contentStart the directive content start position
 * @param params.contentChars the accumulated raw directive characters
 */
function pushDirectiveAnnotation(params: PushDirectiveAnnotationParams): void {
  const { context, contentStart, contentChars } = params;
  const trimmed = trimTrailingNewlines(contentChars.join(''));

  if (!trimmed) {
    return;
  }

  pushToken(context, {
    type: 'ANNOTATION',
    value: trimmed,
    start: contentStart,
    end: advanceRange(contentStart, trimmed),
  });
}

/**
 * finds a fenced code delimiter after indentation
 * @param scanner the active scanner
 * @param indentSpaces the indentation to skip (in spaces)
 * @returns number of spaces to skip before delimiter or null if not found
 */
function findIndentedFence(
  scanner: Scanner,
  indentSpaces: number,
): number | null {
  // caller guarantees scanner.isAtLineStart() is true (verified in scanCodeFenceContent)
  let skipped = 0;

  while (skipped < indentSpaces && scanner.peekAhead(skipped) === ' ') {
    skipped += 1;
  }

  if (skipped < indentSpaces) {
    return null;
  }

  let extra = 0;

  if (scanner.peekAhead(skipped) === ' ') {
    extra = 1;
  }

  const total = skipped + extra;
  const slice = scanner.peekN(total + DELIMITER_LENGTH);

  if (slice.slice(total) === '```') {
    return total;
  }

  return null;
}

/**
 * skips indentation spaces up to the given count
 * @param scanner the active scanner
 * @param indentSpaces the indentation to skip (in spaces)
 */
function skipIndentSpaces(scanner: Scanner, indentSpaces: number): void {
  let skipped = 0;

  while (skipped < indentSpaces && scanner.peek() === ' ') {
    scanner.advance();
    skipped += 1;
  }
}

/**
 * rejects tabs anywhere on a structural source line
 * @param scanner scanner positioned at the start of a line
 */
function validateStructuralLineTabs(scanner: Scanner): void {
  const start = scanner.getRange();
  for (let offset = 0; scanner.peekAhead(offset) !== '\n'; offset++) {
    const character = scanner.peekAhead(offset);
    if (character === '') {
      return;
    }
    if (character === '\t') {
      throw new ParseError(
        'MDC_INDENTATION_INVALID',
        'Tabs are forbidden outside opaque fenced-code content.',
        {
          line: start.line,
          column: start.column + offset,
          offset: start.offset + offset,
        },
      );
    }
  }
}

// SCANNERS //

/**
 * routes to appropriate scanner based on current context
 * @param context the current scan context
 */
function scanLine(context: ScanContext): void {
  const { scanner } = context;

  // check for directive at document start BEFORE measuring indent
  if (context.isDocStart && scanner.match('---')) {
    context.isDocStart = false;
    scanDirective(context);

    return;
  }
  context.isDocStart = false;

  // handle different contexts - directive and code fence preserve spaces
  if (context.isInCodeFence) {
    scanCodeFenceContent(context);

    return;
  }

  validateStructuralLineTabs(scanner);

  // measure indentation at start of line (only for regular content)
  // main loop guarantees scanner is at line start when scanLine is called
  context.currentIndent = scanner.measureIndent();

  scanContentLine(context);
}

// DIRECTIVE SCANNING //

/**
 * scans directive block and emits it as directive + annotation tokens
 * @param context the current scan context
 */
function scanDirective(context: ScanContext): void {
  const { scanner } = context;

  // opening delimiter
  const openStart = scanner.getRange();
  scanner.advanceN(DELIMITER_LENGTH); // consume ---
  pushToken(context, {
    type: 'DIRECTIVE_START',
    value: '---',
    start: openStart,
  });

  // move to start of YAML content (skip immediate newline)
  if (scanner.peek() === '\n') {
    scanner.advance();
  }

  const contentStart = scanner.getRange();
  const contentChars: string[] = [];

  while (!scanner.isAtEnd()) {
    // closing delimiter must be at line start
    if (scanner.match('---') && scanner.isAtLineStart()) {
      pushDirectiveAnnotation({ context, contentStart, contentChars });

      const closeStart = scanner.getRange();
      scanner.advanceN(DELIMITER_LENGTH);
      pushToken(context, {
        type: 'DIRECTIVE_END',
        value: '---',
        start: closeStart,
      });

      pushNewlineToken('NEWLINE', context);

      return;
    }

    contentChars.push(scanner.advance());
  }

  // emit any remaining content if closing delimiter missing
  pushDirectiveAnnotation({ context, contentStart, contentChars });
}

// CODE FENCE SCANNING //

/**
 * scans code fence content or closing delimiter
 * @param context the current scan context
 */
function scanCodeFenceContent(context: ScanContext): void {
  const { scanner } = context;
  const indentSpaces = context.currentIndent * 2;

  // check for closing ``` (main loop guarantees scanner is at line start)
  const fenceOffset = findIndentedFence(scanner, indentSpaces);

  if (fenceOffset !== null) {
    if (fenceOffset > 0) {
      scanner.advanceN(fenceOffset);
    }

    const start = scanner.getRange();
    scanner.advanceN(DELIMITER_LENGTH);
    pushToken(context, {
      type: 'CODE_END',
      value: '```',
      start,
    });
    context.isInCodeFence = false;

    pushNewlineToken('NEWLINE', context);

    return;
  }

  if (indentSpaces > 0) {
    skipIndentSpaces(scanner, indentSpaces);
  }

  // inside code fence, everything is opaque code
  const start = scanner.getRange();
  const content = scanner.consumeUntilNewline();

  if (content) {
    pushToken(context, { type: 'CODE', value: content, start });
  }

  pushNewlineToken('CODE', context);
}

// CONTENT SCANNING //

/**
 * scans a regular content line (not in directive or code fence)
 * @param context the current scan context
 */
function scanContentLine(context: ScanContext): void {
  const { scanner } = context;

  // check for code fence
  if (scanner.match('```')) {
    scanCodeFenceOpen(context);

    return;
  }

  // check for block annotation at line start ({{ ... }} syntax)
  if (scanner.match('{{')) {
    scanBlockAnnotation(context);

    return;
  }

  // check for closing marker at line start (--{ ref: xxx }-- syntax)
  if (scanner.match('--{')) {
    scanClosingMarker(context);

    return;
  }

  // scan regular content with inline annotations
  scanContent(context);
}

/**
 * scans code fence opening delimiter and language identifier
 * @param context the current scan context
 */
function scanCodeFenceOpen(context: ScanContext): void {
  const { scanner } = context;
  const start = scanner.getRange();
  scanner.advanceN(DELIMITER_LENGTH); // consume ```
  pushToken(context, {
    type: 'CODE_START',
    value: '```',
    start,
  });
  context.isInCodeFence = true;

  // capture language identifier
  const langStart = scanner.getRange();
  const language = scanner.consumeUntilNewline();

  if (language) {
    pushToken(context, {
      type: 'CODE_TYPE',
      value: language,
      start: langStart,
    });
  }

  pushNewlineToken('CODE', context);
}

/**
 * scans content with potential inline annotations
 * @param context the current scan context
 */
function scanContent(context: ScanContext): void {
  const { scanner } = context;
  const start = scanner.getRange();
  const content = scanner.consumeUntilNewline();

  // emit entire line as single CONTENT token
  // inline annotations like [text]{{ props }} are parsed during inline content parsing
  // this keeps the block structure simpler
  if (content.trim().length > 0) {
    pushToken(context, {
      type: BOUNDING_PATTERN.test(content.trim()) ? 'BOUNDING' : 'CONTENT',
      value: content,
      start,
    });
  }

  pushNewlineToken('NEWLINE', context);
}

// EXPORTS //

/**
 * tokenizes raw MDC string into a stream of typed tokens
 *
 * the tokenizer is **delimiter-focused** - it identifies MDC-specific syntax
 * (annotations, directives, code fences) but does not parse markdown
 * block types. content is returned as CONTENT tokens for the parser
 * to interpret, while code fences emit CODE/CODE_TYPE tokens
 * @param source the raw MDC document string
 * @returns array of tokens with position and indentation information
 * @example
 * ```typescript
 * const tokens = tokenize('{{ ref: intro }}\n# Hello');
 * // tokens[0] = { type: 'ANNOTATION_START', value: '{', indent: 0, ... }
 * // tokens[1] = { type: 'ANNOTATION', value: '{ ref: intro }', indent: 0, ... }
 * // tokens[2] = { type: 'ANNOTATION_END', value: '}', indent: 0, ... }
 * // tokens[3] = { type: 'NEWLINE', value: '\n', indent: 0, ... }
 * // tokens[4] = { type: 'CONTENT', value: '# Hello', indent: 0, ... }
 * ```
 */
export function tokenize(source: string): Token[] {
  const context = createContext(source);

  while (!context.scanner.isAtEnd()) {
    scanLine(context);
  }

  context.tokens.push(createToken({ type: 'EOF', value: '', context }));

  return context.tokens;
}
