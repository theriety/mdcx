import { ParseError } from '#errors';

import { parseAnnotationMapping } from './annotation-profile';

import type { Token } from '#lexer/types';
import type { Annotations, BlockNode } from '#types';

interface ValidateClosingMarkerParams {
  token: Token;
  block: BlockNode;
  blockIndent: number;
}

/**
 * parses a closing marker through the MDC Annotation Profile
 * @param token complete closing-marker token
 * @returns asserted block reference
 */
export function parseClosingMarker(token: Token): string {
  let mapping: Annotations;
  try {
    mapping = parseAnnotationMapping({
      source: token.value,
      context: {
        name: 'Closing marker mapping',
        position: token.range.start,
      },
    });
  } catch (exception) {
    const error = exception as ParseError;
    throw new ParseError(
      'MDC_CLOSING_MARKER_INVALID',
      error.message.replace(/ \(line \d+, column \d+\)$/, ''),
      error.position,
    );
  }

  const keys = Object.keys(mapping);
  if (
    keys.length !== 1 ||
    keys[0] !== 'ref' ||
    typeof mapping.ref !== 'string' ||
    mapping.ref.trim() === ''
  ) {
    throw new ParseError(
      'MDC_CLOSING_MARKER_INVALID',
      'A closing marker must contain exactly one non-empty string property named "ref".',
      token.range.start,
    );
  }

  return mapping.ref;
}

/**
 * validates a local marker against an already-built block
 * @param params closing marker validation inputs
 * @param params.token closing marker immediately following the block and its children
 * @param params.block completed block
 * @param params.blockIndent visible block indentation
 */
export function validateClosingMarker(
  params: ValidateClosingMarkerParams,
): void {
  const { token, block, blockIndent } = params;
  if (token.indent !== blockIndent) {
    throw new ParseError(
      'MDC_CLOSING_MARKER_INVALID',
      `Closing marker indentation level ${token.indent} must match block level ${blockIndent}.`,
      token.range.start,
    );
  }
  const closingRef = parseClosingMarker(token);
  if (!block.ref || closingRef !== block.ref) {
    throw new ParseError(
      'MDC_CLOSING_MARKER_MISMATCH',
      `Closing marker ref "${closingRef}" does not match block ref "${block.ref ?? ''}".`,
      token.range.start,
    );
  }
}
