import type { Position } from '#types';

// TYPES //

/** stable machine-readable parse failure categories */
export type ParseErrorCode =
  | 'MDC_ANNOTATION_INVALID'
  | 'MDC_ANNOTATION_PROFILE_VIOLATION'
  | 'MDC_CLOSING_MARKER_INVALID'
  | 'MDC_CLOSING_MARKER_MISMATCH'
  | 'MDC_INDENTATION_INVALID'
  | 'MDC_RECOVERY_CONFIGURATION_INVALID';

// CLASSES //

/** parse failure with a stable code and optional source position */
export class ParseError extends Error {
  /** stable machine-readable error category */
  public readonly code: ParseErrorCode;

  /** source position where the error occurred */
  public readonly position?: Position;

  /**
   * creates a new ParseError
   * @param code stable machine-readable error category
   * @param message error message describing the parse failure
   * @param position optional source position where the error occurred
   */
  constructor(code: ParseErrorCode, message: string, position?: Position) {
    super(
      position
        ? `${message} (line ${position.line}, column ${position.column})`
        : message,
    );
    this.name = 'ParseError';
    this.code = code;
    this.position = position;
  }
}
