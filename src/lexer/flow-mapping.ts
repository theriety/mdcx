import { ParseError } from '#errors';

import type { ParseErrorCode } from '#errors';
import type { Position } from '#types';

import type { Scanner } from './scanner';

/** context used to classify and locate flow-mapping scan failures */
export interface FlowMappingScanOptions {
  context?: string;
  errorCode?: ParseErrorCode;
  position?: Position;
}

interface FlowState {
  mappingDepth: number;
  sequenceDepth: number;
  quote: 'single' | 'double' | null;
  doubleQuoteEscaped: boolean;
  bytes: number;
}

/** parameters for locating a balanced flow mapping */
export interface FindFlowMappingEndParams {
  source: string;
  startIndex: number;
  options?: FlowMappingScanOptions;
}

/** parameters for scanning a complete flow mapping */
export interface ScanFlowMappingParams {
  scanner: Scanner;
  options?: FlowMappingScanOptions;
}

interface ConsumeQuotedCharacterParams {
  state: FlowState;
  source: string;
  index: number;
  character: string;
  width: number;
  options?: FlowMappingScanOptions;
}

interface FlowStateUpdate {
  state: FlowState;
  complete: boolean;
}

interface QuotedCharacterResult {
  state: FlowState;
  nextIndex: number;
}

interface AddBytesParams {
  state: FlowState;
  character: string;
  options?: FlowMappingScanOptions;
}

interface ScanErrorParams {
  message: string;
  options?: FlowMappingScanOptions;
}

/** maximum encoded size of one MDC annotation mapping */
export const MAX_ANNOTATION_BYTES = 16_384;

const SINGLE_BYTE_MAX = 0x7f;
const DOUBLE_BYTE_MAX = 0x7ff;
const TRIPLE_BYTE_MAX = 0xffff;
const THREE_BYTES = 3;
const FOUR_BYTES = 4;

/**
 * finds the end of one balanced single-line YAML flow mapping
 * @param params flow mapping source and scan context
 * @param params.source source containing the mapping
 * @param params.startIndex index of the opening mapping brace
 * @param params.options scan error context
 * @returns index immediately after the balanced closing brace, or null when unclosed
 */
export function findFlowMappingEnd(
  params: FindFlowMappingEndParams,
): number | null {
  const { source, startIndex, options } = params;

  if (source[startIndex] !== '{') {
    return null;
  }

  let state: FlowState = {
    mappingDepth: 0,
    sequenceDepth: 0,
    quote: null,
    doubleQuoteEscaped: false,
    bytes: 0,
  };

  for (let index = startIndex; index < source.length; ) {
    const character = String.fromCodePoint(source.codePointAt(index)!);
    const width = character.length;
    state = addBytes({ state, character, options });
    if (character === '\n' || character === '\r') {
      throw scanError({
        message: 'must be a single-line flow mapping.',
        options,
      });
    }

    const quoteResult = consumeQuotedCharacter({
      state,
      source,
      index,
      character,
      width,
      options,
    });
    if (quoteResult !== null) {
      state = quoteResult.state;
      index = quoteResult.nextIndex;
      continue;
    }
    const flowStateUpdate = updateFlowState(state, character);
    state = flowStateUpdate.state;
    if (flowStateUpdate.complete) {
      return index + width;
    }
    if (state.mappingDepth < 0 || state.sequenceDepth < 0) {
      throw scanError({
        message: 'contains an unmatched closing delimiter.',
        options,
      });
    }
    index += width;
  }

  return null;
}

/**
 * consumes one balanced flow mapping from a Scanner
 * @param params scanner and scan error context
 * @param params.scanner scanner positioned at the mapping opening brace
 * @param params.options scan error context
 * @returns complete mapping including braces
 */
export function scanFlowMapping(params: ScanFlowMappingParams): string {
  const { scanner, options } = params;
  const start = scanner.getRange().offset;
  const end = findFlowMappingEnd({
    source: scanner.source,
    startIndex: start,
    options: {
      ...options,
      position: options?.position ?? scanner.getRange(),
    },
  });

  if (end === null) {
    throw scanError({
      message: 'is missing a balanced closing brace.',
      options: {
        ...options,
        position: options?.position ?? scanner.getRange(),
      },
    });
  }

  return scanner.advanceN(end - start);
}

/**
 * measures one Unicode code point as encoded UTF-8
 * @param character one complete Unicode code point
 * @returns encoded byte length
 */
function utf8ByteLength(character: string): number {
  const codePoint = character.codePointAt(0)!;

  if (codePoint <= SINGLE_BYTE_MAX) {
    return 1;
  }
  if (codePoint <= DOUBLE_BYTE_MAX) {
    return 2;
  }
  if (codePoint <= TRIPLE_BYTE_MAX) {
    return THREE_BYTES;
  }

  return FOUR_BYTES;
}

/**
 * creates a classified annotation scanning error
 * @param params scan context and error message
 * @param params.message explanation of the invalid mapping
 * @param params.options scan context and source position
 * @returns parse error for the caller to throw
 */
function scanError(params: ScanErrorParams): ParseError {
  const { message, options } = params;

  return new ParseError(
    options?.errorCode ?? 'MDC_ANNOTATION_INVALID',
    `${options?.context ?? 'Annotation'} ${message}`,
    options?.position,
  );
}

/**
 * accounts for one code point and enforces the profile size limit
 * @param params byte accounting state and scan context
 * @param params.state current flow scan state
 * @param params.character one complete Unicode code point
 * @param params.options scan error context and source position
 * @returns state with updated byte count
 */
function addBytes(params: AddBytesParams): FlowState {
  const { state, character, options } = params;
  const bytes = state.bytes + utf8ByteLength(character);
  if (bytes > MAX_ANNOTATION_BYTES) {
    throw scanError({
      message: 'exceeds the 16,384-byte UTF-8 limit.',
      options,
    });
  }

  return { ...state, bytes };
}

/**
 * consumes quote syntax without interpreting delimiters inside the scalar
 * @param params quoted character scan state and context
 * @returns updated scan state and next index, or null when unquoted
 */
function consumeQuotedCharacter(
  params: ConsumeQuotedCharacterParams,
): QuotedCharacterResult | null {
  const { state, source, index, character, width, options } = params;

  if (state.quote === 'double') {
    const quote =
      character === '"' && !state.doubleQuoteEscaped ? null : state.quote;
    const doubleQuoteEscaped =
      character === '\\' ? !state.doubleQuoteEscaped : false;

    return {
      state: { ...state, quote, doubleQuoteEscaped },
      nextIndex: index + width,
    };
  }
  if (state.quote !== 'single') {
    return null;
  }
  if (character === "'" && source[index + width] === "'") {
    return {
      state: addBytes({ state, character: "'", options }),
      nextIndex: index + width + 1,
    };
  }

  return {
    state: character === "'" ? { ...state, quote: null } : state,
    nextIndex: index + width,
  };
}

/**
 * updates collection and quote state for an unquoted code point
 * @param state current flow scan state
 * @param character current Unicode code point
 * @returns updated state and whether the root mapping has closed
 */
function updateFlowState(state: FlowState, character: string): FlowStateUpdate {
  let nextState = state;

  if (character === '"') {
    nextState = { ...state, quote: 'double' };
  } else if (character === "'") {
    nextState = { ...state, quote: 'single' };
  } else if (character === '{') {
    nextState = { ...state, mappingDepth: state.mappingDepth + 1 };
  } else if (character === '[') {
    nextState = { ...state, sequenceDepth: state.sequenceDepth + 1 };
  } else if (character === ']') {
    nextState = { ...state, sequenceDepth: state.sequenceDepth - 1 };
  } else if (character === '}') {
    nextState = { ...state, mappingDepth: state.mappingDepth - 1 };
  }

  return {
    state: nextState,
    complete: nextState.mappingDepth === 0 && nextState.sequenceDepth === 0,
  };
}
