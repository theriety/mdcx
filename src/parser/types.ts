import type { SetOptional } from 'type-fest';

import type { Annotations, BlockNode, InlineNode, Range } from '#types';

// TYPES //

/** parser operating mode */
export type ParseMode = 'strict' | 'recover';

/** stable recovery diagnostic categories */
export type ParseDiagnosticCode =
  | 'MDC_TAB_INDENT_RECOVERED'
  | 'MDC_ODD_INDENT_RECOVERED'
  | 'MDC_SKIPPED_INDENT_RECOVERED'
  | 'MDC_MARKER_SCOPE_RECOVERED';

/** deterministic parser repair reported in recovery mode */
export interface ParseDiagnostic {
  code: ParseDiagnosticCode;
  severity: 'warning';
  message: string;
  range: Range;
  change: {
    from: {
      indent?: number;
      text?: string;
    };
    to: {
      indent?: number;
      text?: string;
    };
  };
}

/** options shared by strict and recovery parsing */
export interface BaseParseOptions {
  /** default document type (e.g., 'notion', 'excel') */
  type?: string;

  /** default annotations merged after the directive, so option values take precedence */
  annotations?: Annotations;

  /** middleware to transform or filter content during parsing */
  onContent?: (
    content: string,
    context: OnContentContext,
  ) => SetOptional<BlockNode, 'annotations' | 'children' | 'content'> | null;
}

/** configuration options for parsing tokens into AST */
export type ParseOptions =
  | (BaseParseOptions & {
      mode?: 'strict';
      onDiagnostic?: never;
    })
  | (BaseParseOptions & {
      mode: 'recover';
      onDiagnostic: (diagnostic: ParseDiagnostic) => void;
    });

/**
 * result of parsing an inline element with the next position
 * @template T the type of node parsed (defaults to InlineNode)
 */
export interface ParseResult<T = InlineNode> {
  /** the parsed node */
  node: T;
  /** the index to continue parsing from */
  nextIndex: number;
}

/** context passed to block transformation middleware during parsing */
export interface OnContentContext extends ContentBlockContext {
  /** default parser for the content string, returning a partial BlockNode */
  parseContent: (
    content: string,
  ) => SetOptional<BlockNode, 'annotations' | 'children' | 'content'>;
}

/** context describing a parsed block's metadata, used during content transformation middleware */
export interface ContentBlockContext {
  /** inferred or explicit block type */
  type?: string;
  /** optional unique reference identifier */
  ref?: string;
  /** block-level annotations (excluding ref and type) */
  annotations?: Annotations;
  /** source position for error reporting */
  range: Range;
}
