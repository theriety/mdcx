import type { Range } from '#types';

/** token type discriminator for MDC lexer output */
export type TokenType =
  // DELIMITERS //
  | 'DIRECTIVE_START' // ---
  | 'DIRECTIVE_END' // ---
  | 'ANNOTATION_START' // {
  | 'ANNOTATION' // { content } (inner YAML with braces)
  | 'ANNOTATION_END' // }
  | 'CLOSING_MARKER' // --{ ref: xxx }--
  | 'CODE_START' // ``` (opening)
  | 'CODE_END' // ``` (closing)

  // CONTENT //
  | 'CODE_TYPE' // language identifier after code fence opening
  | 'CODE' // code fence content (including newlines)
  | 'CONTENT' // content block (header, list, quote, paragraph, etc.)
  | 'BOUNDING' // table row bounding (|...|)
  | 'NEWLINE' // \n
  | 'EOF'; // end of file

/** token produced by the MDC lexer */
export interface Token {
  /** token type discriminator */
  type: TokenType;
  /** raw string content */
  value: string;
  /** source position for error reporting and editing */
  range: Range;
  /** indentation level (0 = root, 1 = 2 spaces, 2 = 4 spaces, etc.) */
  indent: number;
}
