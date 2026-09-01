import { ParseError } from '#errors';

import type { ParseOptions } from './types';

/**
 * validates the discriminated parsing configuration at the runtime boundary
 * @param options parser configuration to validate
 */
export function validateParseOptions(options?: ParseOptions): void {
  const candidate = options as
    | (Partial<ParseOptions> & { onDiagnostic?: unknown })
    | undefined;

  if (
    candidate?.mode === 'recover' &&
    typeof candidate.onDiagnostic !== 'function'
  ) {
    throw new ParseError(
      'MDC_RECOVERY_CONFIGURATION_INVALID',
      'Recovery mode requires an onDiagnostic callback.',
    );
  }

  if (candidate?.mode !== 'recover' && candidate?.onDiagnostic !== undefined) {
    throw new ParseError(
      'MDC_RECOVERY_CONFIGURATION_INVALID',
      'onDiagnostic is only valid when mode is "recover".',
    );
  }
}
