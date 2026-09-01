import { buildMarkerIndex } from './marker-index';
import { indentationRange, translatedRange } from './recovery-source';

import type { Token } from '#lexer/types';

import type { RecoverySource } from './recovery-source';
import type { ParseDiagnostic } from './types';

interface TokenLine {
  line: number;
  indices: number[];
  token: Token;
}

interface BlockUnit {
  lines: TokenLine[];
  indent: number;
}

interface ActiveMarkerInterval {
  closingIndex: number;
  openingIndent: number;
  shift: number;
}

/** parameters for promoting uniquely paired marker intervals */
export interface RecoverMarkerScopesParams {
  tokens: Token[];
  source: RecoverySource;
  onDiagnostic: (diagnostic: ParseDiagnostic) => void;
}

interface BoundingRunEndParams {
  lines: TokenLine[];
  start: number;
  indent: number;
}

interface SetUnitIndentParams {
  tokens: Token[];
  unit: BlockUnit;
  indent: number;
}

/** parameters for clamping skipped block indentation */
export interface RecoverSkippedIndentationParams {
  tokens: Token[];
  source: RecoverySource;
  onDiagnostic: (diagnostic: ParseDiagnostic) => void;
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
 * promotes uniquely paired under-indented child intervals in one token sweep
 * @param params recovery token stream, source mapping, and diagnostic sink
 * @param params.tokens mutable recovery token stream
 * @param params.source original source mapping
 * @param params.onDiagnostic required diagnostic sink
 */
export function recoverMarkerScopes(params: RecoverMarkerScopesParams): void {
  const { tokens, source, onDiagnostic } = params;
  const markerIndex = buildMarkerIndex(tokens);
  const openingIntervals = new Map(
    markerIndex.intervals.map((interval) => [interval.openingIndex, interval]),
  );
  const activeIntervals: ActiveMarkerInterval[] = [];
  let aggregateShift = 0;

  for (const [index, token] of tokens.entries()) {
    const interval = openingIntervals.get(index);
    if (interval) {
      const parent = activeIntervals.at(-1);
      const from = token.indent + aggregateShift;
      const expectedIndent = parent ? parent.openingIndent + 1 : from;
      const shift = Math.max(0, expectedIndent - from);
      aggregateShift += shift;
      activeIntervals.push({
        closingIndex: interval.closingIndex,
        openingIndent: from + shift,
        shift,
      });

      if (shift > 0) {
        onDiagnostic(
          warning({
            code: 'MDC_MARKER_SCOPE_RECOVERED',
            message: `Referenced child "${interval.ref}" was promoted from level ${from} to level ${expectedIndent} within unambiguous marker boundaries.`,
            range: translatedRange(interval.openingRange, source.lines),
            change: {
              from: { indent: from },
              to: { indent: expectedIndent },
            },
          }),
        );
      }
    }

    if (aggregateShift > 0) {
      token.indent += aggregateShift;
    }

    const active = activeIntervals.at(-1);
    if (active?.closingIndex === index) {
      aggregateShift -= active.shift;
      activeIntervals.pop();
    }
  }
}

/**
 * reports whether a token belongs to an opaque/non-structural line
 * @param token candidate token
 * @returns true when skipped by indentation normalization
 */
function isNonStructural(token: Token): boolean {
  return [
    'NEWLINE',
    'EOF',
    'CODE',
    'CODE_TYPE',
    'CODE_END',
    'DIRECTIVE_START',
    'DIRECTIVE_END',
  ].includes(token.type);
}

/**
 * groups structural tokens by source line in one pass
 * @param tokens recovery token stream
 * @returns structural token lines
 */
function structuralLines(tokens: Token[]): TokenLine[] {
  const lines: TokenLine[] = [];
  for (const [index, token] of tokens.entries()) {
    if (isNonStructural(token)) {
      continue;
    }
    const current = lines.at(-1);
    if (current?.line === token.range.start.line) {
      current.indices.push(index);
    } else {
      lines.push({
        line: token.range.start.line,
        indices: [index],
        token,
      });
    }
  }

  return lines;
}

/**
 * checks whether a line is the adjacent same-indent target of an annotation
 * @param annotation annotation token line
 * @param target candidate target line
 * @returns true when both belong to one source block
 */
function isAdjacentTarget(
  annotation: TokenLine,
  target: TokenLine | undefined,
): target is TokenLine {
  return (
    target?.line === annotation.line + 1 &&
    target.token.type !== 'CLOSING_MARKER' &&
    target.token.indent === annotation.token.indent
  );
}

/**
 * finds the end of a contiguous same-indent bounding-row run
 * @param params structural token lines and bounding-row constraints
 * @param params.lines structural token lines
 * @param params.start first bounding-row index
 * @param params.indent required row indentation
 * @returns exclusive line index after the run
 */
function boundingRunEnd(params: BoundingRunEndParams): number {
  const { lines, start, indent } = params;
  let end = start + 1;
  while (end < lines.length) {
    const previous = lines[end - 1];
    const next = lines[end];
    if (
      previous === undefined ||
      next?.line !== previous.line + 1 ||
      next.token.type !== 'BOUNDING' ||
      next.token.indent !== indent
    ) {
      break;
    }
    end += 1;
  }

  return end;
}

/**
 * groups annotation/target and intrinsic bounding rows into repair units
 * @param lines structural token lines
 * @returns indentation repair units
 */
function blockUnits(lines: TokenLine[]): BlockUnit[] {
  const units: BlockUnit[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    // structuralLines returns a dense array.
    /* c8 ignore start */
    if (line === undefined) {
      throw new RangeError(
        `Missing structural recovery line at index ${cursor}.`,
      );
    }
    /* c8 ignore stop */
    if (line.token.type === 'CLOSING_MARKER') {
      cursor += 1;
      continue;
    }
    let end = cursor + 1;
    const target = lines[end];
    if (
      line.token.type === 'ANNOTATION_START' &&
      isAdjacentTarget(line, target)
    ) {
      end += 1;
      if (target.token.type === 'BOUNDING') {
        end = boundingRunEnd({
          lines,
          start: end - 1,
          indent: line.token.indent,
        });
      }
    } else if (line.token.type === 'BOUNDING') {
      end = boundingRunEnd({
        lines,
        start: cursor,
        indent: line.token.indent,
      });
    }
    units.push({ lines: lines.slice(cursor, end), indent: line.token.indent });
    cursor = end;
  }

  return units;
}

/**
 * applies one logical indentation to every token in a block unit
 * @param params recovery token stream, block unit, and normalized indentation
 * @param params.tokens mutable recovery token stream
 * @param params.unit grouped source block
 * @param params.indent normalized indentation
 */
function setUnitIndent(params: SetUnitIndentParams): void {
  const { tokens, unit, indent } = params;
  for (const line of unit.lines) {
    for (const index of line.indices) {
      const token = tokens[index];
      // Unit token indexes come from dense tokens.entries().
      /* c8 ignore start */
      if (token === undefined) {
        throw new RangeError(`Missing recovery token at index ${index}.`);
      }
      /* c8 ignore stop */
      token.indent = indent;
    }
  }
}

/**
 * clamps skipped block levels after marker-scope recovery
 * @param params recovery token stream, source mapping, and diagnostic sink
 * @param params.tokens mutable recovery token stream
 * @param params.source original source mapping
 * @param params.onDiagnostic required diagnostic sink
 */
export function recoverSkippedIndentation(
  params: RecoverSkippedIndentationParams,
): void {
  const { tokens, source, onDiagnostic } = params;
  const units = blockUnits(structuralLines(tokens));
  let allowedIndent = 0;
  let sourceLine = 1;
  const closingByLine = new Map(
    tokens
      .filter((token) => token.type === 'CLOSING_MARKER')
      .map((token) => [token.range.start.line, token.indent]),
  );

  for (const unit of units) {
    const firstLine = unit.lines[0];
    // blockUnits only emits non-empty slices.
    /* c8 ignore start */
    if (firstLine === undefined) {
      throw new RangeError(
        'Recovery block unit must contain at least one line.',
      );
    }
    /* c8 ignore stop */
    while (sourceLine < firstLine.line) {
      const closingIndent = closingByLine.get(sourceLine);
      if (closingIndent !== undefined) {
        allowedIndent = closingIndent;
      }
      sourceLine += 1;
    }
    const normalized = Math.min(unit.indent, allowedIndent);
    if (normalized !== unit.indent) {
      setUnitIndent({ tokens, unit, indent: normalized });
      const line = source.lines[firstLine.line - 1];
      // Recovery source lines are derived from the same normalized source.
      /* c8 ignore start */
      if (line === undefined) {
        throw new RangeError(`Missing recovery source line ${firstLine.line}.`);
      }
      /* c8 ignore stop */
      onDiagnostic(
        warning({
          code: 'MDC_SKIPPED_INDENT_RECOVERED',
          message: `Skipped indentation was clamped from level ${unit.indent} to level ${normalized}.`,
          range: indentationRange(line),
          change: {
            from: { indent: unit.indent },
            to: { indent: normalized },
          },
        }),
      );
    }
    allowedIndent = normalized + 1;
  }
}
