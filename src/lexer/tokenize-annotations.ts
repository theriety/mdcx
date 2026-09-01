import { ParseError } from '#errors';

import { scanFlowMapping } from './flow-mapping';

import type { ScanContext } from './tokenize';
import type { TokenType } from './types';

interface TokenPositionParams {
  type: TokenType;
  value: string;
  start: { line: number; column: number; offset: number };
  context: ScanContext;
}

interface RequireAnnotationLineEndParams {
  context: ScanContext;
  code: 'MDC_ANNOTATION_INVALID' | 'MDC_CLOSING_MARKER_INVALID';
  message: string;
}

/**
 * appends a token spanning an explicitly captured start and current position
 * @param params token data and active tokenizer context
 * @param params.type discriminator for the emitted token
 * @param params.value source value represented by the token
 * @param params.start captured token start position
 * @param params.start.line one-based line
 * @param params.start.column one-based column
 * @param params.start.offset zero-based source offset
 * @param params.context active tokenizer context
 */
function pushToken(params: TokenPositionParams): void {
  const { type, value, start, context } = params;

  context.tokens.push({
    type,
    value,
    range: { start, end: context.scanner.getRange() },
    indent: context.currentIndent,
  });
}

/**
 * consumes and appends a newline token when present
 * @param context active tokenizer context
 */
function pushNewline(context: ScanContext): void {
  if (context.scanner.peek() !== '\n') {
    return;
  }
  const start = context.scanner.getRange();
  pushToken({
    type: 'NEWLINE',
    value: context.scanner.advance(),
    start,
    context,
  });
}

/**
 * consumes optional horizontal space and enforces end-of-line
 * @param params line-end validation inputs
 * @param params.context active tokenizer context
 * @param params.code parse error code
 * @param params.message error message for trailing content
 */
function requireAnnotationLineEnd(
  params: RequireAnnotationLineEndParams,
): void {
  const { context, code, message } = params;

  while (context.scanner.peek() === ' ') {
    context.scanner.advance();
  }
  if (context.scanner.peek() !== '\n' && !context.scanner.isAtEnd()) {
    throw new ParseError(code, message, context.scanner.getRange());
  }
}

/**
 * scans a block annotation with an inner YAML flow mapping
 * @param context active tokenizer context
 */
export function scanBlockAnnotation(context: ScanContext): void {
  const { scanner } = context;
  const openStart = scanner.getRange();
  scanner.advance();
  pushToken({
    type: 'ANNOTATION_START',
    value: '{',
    start: openStart,
    context,
  });

  const contentStart = scanner.getRange();
  const content = scanFlowMapping({
    scanner,
    options: { context: 'Block annotation' },
  });
  pushToken({
    type: 'ANNOTATION',
    value: content,
    start: contentStart,
    context,
  });
  if (scanner.peek() !== '}') {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Block annotation requires an outer closing brace after its flow mapping.',
      scanner.getRange(),
    );
  }
  const closeStart = scanner.getRange();
  pushToken({
    type: 'ANNOTATION_END',
    value: scanner.advance(),
    start: closeStart,
    context,
  });
  requireAnnotationLineEnd({
    context,
    code: 'MDC_ANNOTATION_INVALID',
    message: 'Block annotation may only be followed by whitespace on its line.',
  });
  pushNewline(context);
}

/**
 * scans a closing marker while retaining its complete flow mapping
 * @param context active tokenizer context
 */
export function scanClosingMarker(context: ScanContext): void {
  const { scanner } = context;
  const start = scanner.getRange();
  scanner.advanceN(2);
  const value = scanFlowMapping({
    scanner,
    options: {
      context: 'Closing marker mapping',
      errorCode: 'MDC_CLOSING_MARKER_INVALID',
    },
  });
  if (!scanner.consumeIf('--')) {
    throw new ParseError(
      'MDC_CLOSING_MARKER_INVALID',
      'Closing marker requires the exact }-- terminator.',
      scanner.getRange(),
    );
  }
  requireAnnotationLineEnd({
    context,
    code: 'MDC_CLOSING_MARKER_INVALID',
    message: 'Closing marker may only be followed by whitespace on its line.',
  });
  pushToken({ type: 'CLOSING_MARKER', value, start, context });
  pushNewline(context);
}
