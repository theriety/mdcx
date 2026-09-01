import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('directive', () => {
    it('should tokenize directive delimiters', () => {
      const source = '---\ntype: doc\n---';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'DIRECTIVE_START',
          value: '---',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: 'type: doc',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 2, column: 10, offset: 13 },
          },
          indent: 0,
        },
        {
          type: 'DIRECTIVE_END',
          value: '---',
          range: {
            start: { line: 3, column: 1, offset: 14 },
            end: { line: 3, column: 4, offset: 17 },
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

    it('should return directive content as ANNOTATION token', () => {
      const source = '---\ntype: doc\nauthor: Jane\n---';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'DIRECTIVE_START',
          value: '---',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: 'type: doc\nauthor: Jane',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 3, column: 13, offset: 26 },
          },
          indent: 0,
        },
        {
          type: 'DIRECTIVE_END',
          value: '---',
          range: {
            start: { line: 4, column: 1, offset: 27 },
            end: { line: 4, column: 4, offset: 30 },
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

    it('should measure directive ranges in UTF-16 code units', () => {
      const source = '---\nicon: 😀\n---';

      const tokens = tokenize(source);

      expect(tokens).toContainEqual({
        type: 'ANNOTATION',
        value: 'icon: 😀',
        range: {
          start: { line: 2, column: 1, offset: 4 },
          end: { line: 2, column: 9, offset: 12 },
        },
        indent: 0,
      } satisfies Token);
    });

    it('should only recognize directive at document start', () => {
      const source = '# Title\n---\nnot directive\n---';

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
          type: 'CONTENT',
          value: '---',
          range: {
            start: { line: 2, column: 1, offset: 8 },
            end: { line: 2, column: 4, offset: 11 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 4, offset: 11 },
            end: { line: 3, column: 1, offset: 12 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'not directive',
          range: {
            start: { line: 3, column: 1, offset: 12 },
            end: { line: 3, column: 14, offset: 25 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 3, column: 14, offset: 25 },
            end: { line: 4, column: 1, offset: 26 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '---',
          range: {
            start: { line: 4, column: 1, offset: 26 },
            end: { line: 4, column: 4, offset: 29 },
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

    it('should treat --- lines after a directive block as content', () => {
      const source = '---\ntype: doc\n---\n# Title\n---\nScene';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'DIRECTIVE_START',
          value: '---',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: 'type: doc',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 2, column: 10, offset: 13 },
          },
          indent: 0,
        },
        {
          type: 'DIRECTIVE_END',
          value: '---',
          range: {
            start: { line: 3, column: 1, offset: 14 },
            end: { line: 3, column: 4, offset: 17 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 3, column: 4, offset: 17 },
            end: { line: 4, column: 1, offset: 18 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '# Title',
          range: {
            start: { line: 4, column: 1, offset: 18 },
            end: { line: 4, column: 8, offset: 25 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 4, column: 8, offset: 25 },
            end: { line: 5, column: 1, offset: 26 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '---',
          range: {
            start: { line: 5, column: 1, offset: 26 },
            end: { line: 5, column: 4, offset: 29 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 5, column: 4, offset: 29 },
            end: { line: 6, column: 1, offset: 30 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Scene',
          range: {
            start: { line: 6, column: 1, offset: 30 },
            end: { line: 6, column: 6, offset: 35 },
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
