import { describe, expect, it } from 'vitest';

import { parseClosingMarker, validateClosingMarker } from '#parser/closing';

import { makeStartRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';
import type { BlockNode } from '#types';

const closingToken = (value: string, indent = 0): Token => ({
  type: 'CLOSING_MARKER',
  value,
  indent,
  range: makeStartRange(value.length),
});

const block = (ref?: string): BlockNode =>
  ({
    type: 'paragraph',
    ref,
    annotations: {},
    content: [],
    children: [],
    range: makeStartRange(0),
  }) as BlockNode;

describe('fn:parseClosingMarker', () => {
  it.each([
    ['{ ref: intro }', 'intro'],
    ['{ ref: "section with spaces" }', 'section with spaces'],
    ['{ ref: "section with } character" }', 'section with } character'],
    ["{ ref: 'punctuation: []{}' }", 'punctuation: []{}'],
  ])('parses profile-valid mapping %s', (source, expected) => {
    expect(parseClosingMarker(closingToken(source))).toBe(expected);
  });

  it.each([
    '{ type: paragraph }',
    '{ ref: "" }',
    '{ ref: 42 }',
    '{ ref: null }',
    '{ ref: intro, type: paragraph }',
    '{ ref: intro # comment }',
    '{ &marker ref: intro }',
    '{ source: &source intro, ref: *source }',
  ])('rejects invalid closing mapping %s', (source) => {
    expect(() => parseClosingMarker(closingToken(source))).toThrow(
      expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }),
    );
  });
});

describe('fn:validateClosingMarker', () => {
  it('should accept a marker that asserts the completed block', () => {
    expect(() =>
      validateClosingMarker({
        token: closingToken('{ ref: intro }'),
        block: block('intro'),
        blockIndent: 0,
      }),
    ).not.toThrow();
  });

  it('should reject marker indentation that differs from the block', () => {
    expect(() =>
      validateClosingMarker({
        token: closingToken('{ ref: intro }', 1),
        block: block('intro'),
        blockIndent: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }));
  });

  it('should reject a mismatched marker ref', () => {
    expect(() =>
      validateClosingMarker({
        token: closingToken('{ ref: other }'),
        block: block('intro'),
        blockIndent: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'MDC_CLOSING_MARKER_MISMATCH' }));
  });

  it('should reject a marker for an unreferenced block', () => {
    expect(() =>
      validateClosingMarker({
        token: closingToken('{ ref: intro }'),
        block: block(),
        blockIndent: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'MDC_CLOSING_MARKER_MISMATCH' }));
  });
});
