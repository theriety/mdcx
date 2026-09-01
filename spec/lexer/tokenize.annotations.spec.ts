import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('block annotations', () => {
    it('should tokenize annotation delimiters', () => {
      const source = '{{ ref: intro }}\n# Intro';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'ANNOTATION_START',
          value: '{',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: '{ ref: intro }',
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 16, offset: 15 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 16, offset: 15 },
            end: { line: 1, column: 17, offset: 16 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 17, offset: 16 },
            end: { line: 2, column: 1, offset: 17 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '# Intro',
          range: {
            start: { line: 2, column: 1, offset: 17 },
            end: { line: 2, column: 8, offset: 24 },
          },
          indent: 0,
        },
        {
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });

    it('should tokenize braces and escaped quotes inside annotation strings', () => {
      const cases = [
        {
          source: '{{ equation: "x^{n}", ref: abc }}',
          value: '{ equation: "x^{n}", ref: abc }',
        },
        {
          source: "{{ note: 'has } brace', ref: id }}",
          value: "{ note: 'has } brace', ref: id }",
        },
        {
          source: '{{ text: "a\\"b}c", ref: id }}',
          value: '{ text: "a\\"b}c", ref: id }',
        },
      ];

      for (const { source, value } of cases) {
        const tokens = tokenize(source);

        expect(tokens).toEqual([
          expect.objectContaining({ type: 'ANNOTATION_START', value: '{' }),
          expect.objectContaining({ type: 'ANNOTATION', value }),
          expect.objectContaining({ type: 'ANNOTATION_END', value: '}' }),
          expect.objectContaining({ type: 'EOF' }),
        ]);
      }
    });

    it('should preserve nested mappings and sequences as one annotation token', () => {
      const source =
        '{{ style: {color: red, font: {weight: 700}}, values: [one, {two: 2}] }}';
      const tokens = tokenize(source);

      expect(tokens[1]).toMatchObject({
        type: 'ANNOTATION',
        value:
          '{ style: {color: red, font: {weight: 700}}, values: [one, {two: 2}] }',
      });
    });

    it('should preserve doubled YAML single quotes', () => {
      const source = "{{ note: 'it''s a } brace' }}";
      const tokens = tokenize(source);

      expect(tokens[1]).toMatchObject({
        type: 'ANNOTATION',
        value: "{ note: 'it''s a } brace' }",
      });
    });

    it('should handle annotation followed by newline', () => {
      const source = '{{ ref: intro }}\n';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'ANNOTATION_START',
          value: '{',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: '{ ref: intro }',
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 16, offset: 15 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 16, offset: 15 },
            end: { line: 1, column: 17, offset: 16 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 17, offset: 16 },
            end: { line: 2, column: 1, offset: 17 },
          },
          indent: 0,
        },
        {
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });
  });

  describe('closing markers', () => {
    it('should tokenize closing marker', () => {
      const source = '--{ ref: intro }--';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        expect.objectContaining({
          type: 'CLOSING_MARKER',
          value: '{ ref: intro }',
          indent: 0,
        }),
        expect.objectContaining({ type: 'EOF' }),
      ]);
    });

    it('should tokenize indented closing marker', () => {
      const source = '  --{ ref: child }--';

      const tokens = tokenize(source);

      expect(tokens[0]).toMatchObject({
        type: 'CLOSING_MARKER',
        value: '{ ref: child }',
        indent: 1,
      });
    });

    it('should reject a closing marker without the exact terminator', () => {
      expect(() => tokenize('--{ ref: orphan }')).toThrowError(
        expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }),
      );
    });

    it('should reject trailing marker content', () => {
      expect(() => tokenize('--{ ref: orphan }-- trailing')).toThrowError(
        expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }),
      );
    });

    it('should scan a quoted ref containing a closing brace', () => {
      const source = '--{ ref: "section with } character" }--';
      const tokens = tokenize(source);

      expect(tokens[0]).toMatchObject({
        type: 'CLOSING_MARKER',
        value: '{ ref: "section with } character" }',
      });
    });
  });

  it('should reject a block annotation missing its outer closing brace', () => {
    expect(() => tokenize('{{ ref: intro }')).toThrowError(
      expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
    );
  });
});
