import { translatedRange } from './recovery-source';
import {
  recoverMarkerScopes,
  recoverSkippedIndentation,
} from './recovery-tokens';

import type { Token } from '#lexer/types';

import type { RecoverySource } from './recovery-source';
import type { ParseOptions } from './types';

export { recoverSourceIndentation } from './recovery-source';

/** parameters for applying token-level recovery */
export interface RecoverTokensParams {
  tokens: Token[];
  source: RecoverySource;
  options: Extract<ParseOptions, { mode: 'recover' }>;
}

/**
 * restores token coordinates to the original pre-recovery source
 * @param tokens normalized recovery token stream
 * @param source original source mapping
 */
export function restoreTokenRanges(
  tokens: Token[],
  source: RecoverySource,
): void {
  for (const token of tokens) {
    token.range = translatedRange(token.range, source.lines);
  }
}

/**
 * applies every token-level recovery in normative order
 * @param params mutable recovery token stream, source mapping, and parser options
 * @param params.tokens mutable recovery token stream
 * @param params.source original source mapping
 * @param params.options explicit recovery parser options
 */
export function recoverTokens(params: RecoverTokensParams): void {
  const { tokens, source, options } = params;
  recoverMarkerScopes({ tokens, source, onDiagnostic: options.onDiagnostic });
  recoverSkippedIndentation({
    tokens,
    source,
    onDiagnostic: options.onDiagnostic,
  });
}
