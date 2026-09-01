import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('position tracking', () => {
    it('should preserve position information', () => {
      const source = '# Title';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 8, offset: 7 },
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

    it('should track multi-line positions', () => {
      const source = '# Title\n\nParagraph';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 8, offset: 7 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 8, offset: 7 },
            end: { line: 2, column: 1, offset: 8 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 1, offset: 8 },
            end: { line: 3, column: 1, offset: 9 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Paragraph',
          range: {
            start: { line: 3, column: 1, offset: 9 },
            end: { line: 3, column: 10, offset: 18 },
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

    it('should include position in every token', () => {
      const source = '# Title\n\nParagraph';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 8, offset: 7 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 8, offset: 7 },
            end: { line: 2, column: 1, offset: 8 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 1, offset: 8 },
            end: { line: 3, column: 1, offset: 9 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Paragraph',
          range: {
            start: { line: 3, column: 1, offset: 9 },
            end: { line: 3, column: 10, offset: 18 },
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

    it('should track position for heading on line 1', () => {
      const source = '# Title';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 8, offset: 7 },
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

    it('should track position through annotation', () => {
      const source = '{{ ref: intro }}\n# Title';

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
          value: '# Title',
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
  });

  describe('EOF', () => {
    it('should end with EOF token', () => {
      const source = 'test';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: 'test',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 },
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

    it('should handle empty source', () => {
      const source = '';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });
  });

  describe('NEWLINE tokens', () => {
    it('should emit NEWLINE tokens', () => {
      const source = 'line1\nline2';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: 'line1',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 6, offset: 5 },
            end: { line: 2, column: 1, offset: 6 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'line2',
          range: {
            start: { line: 2, column: 1, offset: 6 },
            end: { line: 2, column: 6, offset: 11 },
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

    it('should tokenize multiple newlines', () => {
      const source = 'a\n\nb';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: 'a',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 2, column: 1, offset: 2 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 1, offset: 2 },
            end: { line: 3, column: 1, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'b',
          range: {
            start: { line: 3, column: 1, offset: 3 },
            end: { line: 3, column: 2, offset: 4 },
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

    it('should handle trailing newline', () => {
      const source = '# Title\n';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 8, offset: 7 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 8, offset: 7 },
            end: { line: 2, column: 1, offset: 8 },
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
});
