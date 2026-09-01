import type { Position, Range } from '#types';

import type { ParseDiagnostic } from './types';

/** original and normalized indentation metadata for one source line */
export interface RecoveryLine {
  line: number;
  originalStart: number;
  originalPrefix: string;
  normalizedPrefix: string;
}

/** source normalized before strict tokenization, with original position mapping */
export interface RecoverySource {
  source: string;
  lines: RecoveryLine[];
}

interface OpaqueState {
  inDirective: boolean;
  inFence: boolean;
}

interface OpaqueStateUpdateParams {
  state: OpaqueState;
  lineIndex: number;
  prefix: string;
  normalizedPrefix: string;
  content: string;
}

interface RecoveryRecord extends RecoveryLine {
  content: string;
  recoverable: boolean;
}

/**
 * creates the original source range for a line's indentation
 * @param line original and normalized line metadata
 * @returns original indentation range
 */
export function indentationRange(line: RecoveryLine): Range {
  return {
    start: { line: line.line, column: 1, offset: line.originalStart },
    end: {
      line: line.line,
      column: line.originalPrefix.length + 1,
      offset: line.originalStart + line.originalPrefix.length,
    },
  };
}

/**
 * translates a normalized lexer position back to original source coordinates
 * @param position position in normalized source
 * @param lines line mapping
 * @returns corresponding original source position
 */
function translatedPosition(
  position: Position,
  lines: RecoveryLine[],
): Position {
  const line = lines[position.line - 1];
  if (line === undefined) {
    throw new RangeError(`Missing recovery source line ${position.line}.`);
  }
  if (position.column === 1) {
    return { line: position.line, column: 1, offset: line.originalStart };
  }
  const normalizedContentColumn = line.normalizedPrefix.length + 1;
  if (position.column < normalizedContentColumn) {
    return position;
  }
  const column =
    position.column - line.normalizedPrefix.length + line.originalPrefix.length;

  return {
    line: position.line,
    column,
    offset: line.originalStart + column - 1,
  };
}

/**
 * translates a normalized same-line range to original source coordinates
 * @param range normalized range
 * @param lines line mapping
 * @returns original source range
 */
export function translatedRange(range: Range, lines: RecoveryLine[]): Range {
  return {
    start: translatedPosition(range.start, lines),
    end: translatedPosition(range.end, lines),
  };
}

/**
 * adds warning severity to a deterministic repair
 * @param diagnostic recovery diagnostic without fixed severity
 * @returns warning diagnostic
 */
function warning(
  diagnostic: Omit<ParseDiagnostic, 'severity'>,
): ParseDiagnostic {
  return { ...diagnostic, severity: 'warning' };
}

/**
 * performs the leading-tab phase for every structural line
 * @param records collected source lines
 * @param onDiagnostic required diagnostic sink
 */
function recoverTabs(
  records: RecoveryRecord[],
  onDiagnostic: (diagnostic: ParseDiagnostic) => void,
): void {
  for (const line of records) {
    if (!line.recoverable) {
      continue;
    }
    const tabNormalized = line.originalPrefix.replaceAll('\t', '  ');
    if (tabNormalized === line.originalPrefix) {
      continue;
    }
    onDiagnostic(
      warning({
        code: 'MDC_TAB_INDENT_RECOVERED',
        message:
          'Leading indentation tabs were replaced with two spaces per tab.',
        range: indentationRange(line),
        change: {
          from: { text: line.originalPrefix },
          to: { text: tabNormalized },
        },
      }),
    );
    line.normalizedPrefix = tabNormalized;
  }
}

/**
 * performs the odd-space phase after every tab repair
 * @param records collected source lines
 * @param onDiagnostic required diagnostic sink
 */
function recoverOddSpaces(
  records: RecoveryRecord[],
  onDiagnostic: (diagnostic: ParseDiagnostic) => void,
): void {
  for (const line of records) {
    if (!line.recoverable || line.normalizedPrefix.length % 2 === 0) {
      continue;
    }
    const evenPrefix = line.normalizedPrefix.slice(0, -1);
    onDiagnostic(
      warning({
        code: 'MDC_ODD_INDENT_RECOVERED',
        message: `Odd indentation was rounded down from ${line.normalizedPrefix.length} to ${evenPrefix.length} spaces.`,
        range: indentationRange(line),
        change: {
          from: { text: line.normalizedPrefix },
          to: { text: evenPrefix },
        },
      }),
    );
    line.normalizedPrefix = evenPrefix;
  }
}

/**
 * updates opaque front-matter/fenced-code state after a line
 * @param params opaque state update inputs
 * @param params.state current opaque state
 * @param params.lineIndex zero-based line index
 * @param params.prefix original indentation prefix
 * @param params.normalizedPrefix normalized indentation prefix
 * @param params.content non-indentation line content
 */
function updateOpaqueState(params: OpaqueStateUpdateParams): void {
  const { state, lineIndex, prefix, normalizedPrefix, content } = params;
  if (lineIndex === 0 && content === '---') {
    state.inDirective = true;
  } else if (state.inDirective && prefix === '' && content === '---') {
    state.inDirective = false;
  } else if (!normalizedPrefix.includes('\t') && content.startsWith('```')) {
    state.inFence = !state.inFence;
  }
}

/**
 * records line mappings and opaque status in one source pass
 * @param source original MDC source
 * @returns source line records
 */
function collectRecoveryLines(source: string): RecoveryRecord[] {
  const records: RecoveryRecord[] = [];
  const state: OpaqueState = { inDirective: false, inFence: false };
  let originalStart = 0;
  for (const [index, originalLine] of source.split('\n').entries()) {
    const originalPrefix = /^[ \t]*/u.exec(originalLine)![0];
    const content = originalLine.slice(originalPrefix.length);
    const recoverable = !state.inFence && !state.inDirective;
    const tabPrefix = recoverable
      ? originalPrefix.replaceAll('\t', '  ')
      : originalPrefix;
    const structuralPrefix =
      tabPrefix.length % 2 === 0 ? tabPrefix : tabPrefix.slice(0, -1);
    records.push({
      line: index + 1,
      originalStart,
      originalPrefix,
      normalizedPrefix: originalPrefix,
      content,
      recoverable,
    });
    updateOpaqueState({
      state,
      lineIndex: index,
      prefix: originalPrefix,
      normalizedPrefix: structuralPrefix,
      content,
    });
    originalStart += originalLine.length + 1;
  }

  return records;
}

/**
 * performs leading-tab then odd-space recovery before strict tokenization
 * @param source original MDC source
 * @param onDiagnostic required recovery diagnostic sink
 * @returns normalized source and original-line mapping
 */
export function recoverSourceIndentation(
  source: string,
  onDiagnostic: (diagnostic: ParseDiagnostic) => void,
): RecoverySource {
  const records = collectRecoveryLines(source);
  recoverTabs(records, onDiagnostic);
  recoverOddSpaces(records, onDiagnostic);
  const lines: RecoveryLine[] = records;
  const normalizedLines = records.map(
    (line) => `${line.normalizedPrefix}${line.content}`,
  );

  return { source: normalizedLines.join('\n'), lines };
}
