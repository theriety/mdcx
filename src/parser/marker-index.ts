import { ParseError } from '#errors';

import { parseAnnotationMapping } from './annotation-profile';
import { parseClosingMarker } from './closing';

import type { Token } from '#lexer/types';
import type { Range } from '#types';

/** uniquely paired referenced source interval used only by recovery mode */
export interface MarkerInterval {
  ref: string;
  openingIndex: number;
  closingIndex: number;
  openingRange: Range;
  parent?: MarkerInterval;
}

/** recovery-only index of unique, non-crossing marker intervals */
export interface MarkerIndex {
  intervals: MarkerInterval[];
}

interface MarkerCandidate {
  index: number;
  range: Range;
}

interface MarkerCandidates {
  openings: Map<string, MarkerCandidate[]>;
  closings: Map<string, MarkerCandidate[]>;
}

interface IntervalLookup {
  byOpening: Map<number, MarkerInterval>;
  byClosing: Map<number, MarkerInterval>;
}

interface AppendCandidateParams {
  candidates: Map<string, MarkerCandidate[]>;
  ref: string;
  candidate: MarkerCandidate;
}

/**
 * appends one parsed marker candidate by ref
 * @param params marker candidate append inputs
 * @param params.candidates candidates grouped by parsed ref
 * @param params.ref parsed ref string
 * @param params.candidate source candidate
 */
function appendCandidate(params: AppendCandidateParams): void {
  const { candidates, ref, candidate } = params;
  const entries = candidates.get(ref);
  if (entries) {
    entries.push(candidate);
  } else {
    candidates.set(ref, [candidate]);
  }
}

/**
 * parses one complete opening annotation candidate
 * @param tokens complete token stream
 * @param index annotation-start token index
 * @returns parsed ref and complete opening range
 */
function openingCandidate(
  tokens: Token[],
  index: number,
): { ref?: string; range: Range } {
  const start = tokens[index];
  // Token indexes come from dense tokens.entries().
  /* c8 ignore start */
  if (start === undefined) {
    throw new RangeError(`Missing annotation start token at index ${index}.`);
  }
  /* c8 ignore stop */
  if (index + 2 >= tokens.length) {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Block annotation token sequence is incomplete.',
      start.range.start,
    );
  }
  const content = tokens[index + 1];
  const end = tokens[index + 2];
  if (
    content === undefined ||
    end === undefined ||
    content.type !== 'ANNOTATION' ||
    end.type !== 'ANNOTATION_END'
  ) {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Block annotation token sequence is incomplete.',
      start.range.start,
    );
  }
  const mapping = parseAnnotationMapping({
    source: content.value,
    context: {
      baseLine: content.range.start.line,
      name: 'Block annotation',
      position: content.range.start,
    },
  });

  return {
    ref: mapping.ref,
    range: { start: start.range.start, end: end.range.end },
  };
}

/**
 * collects parsed opening and closing candidates in one token pass
 * @param tokens complete token stream
 * @returns candidates grouped by parsed ref
 */
function collectCandidates(tokens: Token[]): MarkerCandidates {
  const openings = new Map<string, MarkerCandidate[]>();
  const closings = new Map<string, MarkerCandidate[]>();
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'ANNOTATION_START') {
      const opening = openingCandidate(tokens, index);
      if (opening.ref) {
        appendCandidate({
          candidates: openings,
          ref: opening.ref,
          candidate: { index, range: opening.range },
        });
      }
    } else if (token.type === 'CLOSING_MARKER') {
      const ref = parseClosingMarker(token);
      appendCandidate({
        candidates: closings,
        ref,
        candidate: { index, range: token.range },
      });
    }
  }

  return { openings, closings };
}

/**
 * throws the stable error for non-unique marker candidates
 * @param ref ambiguous parsed ref
 * @param token first closing token for the ref
 */
function ambiguousPair(ref: string, token: Token): never {
  throw new ParseError(
    'MDC_CLOSING_MARKER_INVALID',
    `Recovery requires one unique opening and closing marker for ref "${ref}".`,
    token.range.start,
  );
}

/**
 * pairs every closing ref with exactly one preceding opening
 * @param candidates collected marker candidates
 * @param tokens complete token stream
 * @returns interval lookups by opening and closing token index
 */
function pairCandidates(
  candidates: MarkerCandidates,
  tokens: Token[],
): IntervalLookup {
  const byOpening = new Map<number, MarkerInterval>();
  const byClosing = new Map<number, MarkerInterval>();
  for (const [ref, closingCandidates] of candidates.closings) {
    const openingCandidates = candidates.openings.get(ref) ?? [];
    const firstClosing = closingCandidates[0];
    // Closing map entries are created from appended candidates.
    /* c8 ignore start */
    if (firstClosing === undefined) {
      throw new RangeError(
        `Missing closing marker candidate for ref "${ref}".`,
      );
    }
    /* c8 ignore stop */
    if (openingCandidates.length !== 1 || closingCandidates.length !== 1) {
      const token = tokens[firstClosing.index];
      // Candidate indexes come from dense tokens.entries().
      /* c8 ignore start */
      if (token === undefined) {
        throw new RangeError(
          `Missing closing marker token at index ${firstClosing.index}.`,
        );
      }
      /* c8 ignore stop */
      ambiguousPair(ref, token);
    }
    const opening = openingCandidates[0];
    // The uniqueness guard proves index zero is present.
    /* c8 ignore start */
    if (opening === undefined) {
      throw new RangeError(
        `Missing opening marker candidate for ref "${ref}".`,
      );
    }
    /* c8 ignore stop */
    if (opening.index >= firstClosing.index) {
      throw new ParseError(
        'MDC_CLOSING_MARKER_INVALID',
        `Closing marker for ref "${ref}" must follow its opening annotation.`,
        firstClosing.range.start,
      );
    }
    const interval: MarkerInterval = {
      ref,
      openingIndex: opening.index,
      closingIndex: firstClosing.index,
      openingRange: opening.range,
    };
    byOpening.set(opening.index, interval);
    byClosing.set(firstClosing.index, interval);
  }

  return { byOpening, byClosing };
}

/**
 * validates interval nesting with a local marker stack
 * @param tokens complete token stream
 * @param lookup paired intervals by token index
 * @returns intervals in opening-source order with parents assigned
 */
function validateIntervals(
  tokens: Token[],
  lookup: IntervalLookup,
): MarkerInterval[] {
  const intervals: MarkerInterval[] = [];
  const stack: MarkerInterval[] = [];
  for (const [index, token] of tokens.entries()) {
    const opening = lookup.byOpening.get(index);
    if (opening) {
      opening.parent = stack.at(-1);
      stack.push(opening);
      intervals.push(opening);
    }
    const closing = lookup.byClosing.get(index);
    if (closing) {
      if (stack.at(-1) !== closing) {
        throw new ParseError(
          'MDC_CLOSING_MARKER_INVALID',
          `Closing marker for ref "${closing.ref}" crosses another marker interval.`,
          token.range.start,
        );
      }
      stack.pop();
    }
  }

  return intervals;
}

/**
 * builds unique marker intervals in linear time for recovery mode
 * @param tokens normalized lexer token stream
 * @returns unique, stack-valid marker intervals
 */
export function buildMarkerIndex(tokens: Token[]): MarkerIndex {
  const candidates = collectCandidates(tokens);
  const lookup = pairCandidates(candidates, tokens);

  return { intervals: validateIntervals(tokens, lookup) };
}
