import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('content blocks', () => {
    it('should return heading as CONTENT token (not parsed)', () => {
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
  });

  describe('indentation tracking', () => {
    it('should track indent level on tokens', () => {
      const source = '- Parent\n  - Child\n    - Grandchild';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '- Parent',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 9, offset: 8 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 9, offset: 8 },
            end: { line: 2, column: 1, offset: 9 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '- Child',
          range: {
            start: { line: 2, column: 3, offset: 11 },
            end: { line: 2, column: 10, offset: 18 },
          },
          indent: 1,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 10, offset: 18 },
            end: { line: 3, column: 1, offset: 19 },
          },
          indent: 1,
        },
        {
          type: 'CONTENT',
          value: '- Grandchild',
          range: {
            start: { line: 3, column: 5, offset: 23 },
            end: { line: 3, column: 17, offset: 35 },
          },
          indent: 2,
        },
        {
          type: 'EOF',
          value: '',
          range: {
            start: { line: 3, column: 17, offset: 35 },
            end: { line: 3, column: 17, offset: 35 },
          },
          indent: 2,
        },
      ] satisfies Token[]);
    });

    it('should preserve indent level through annotations', () => {
      const source = '  {{ ref: child }}\n  Child content';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'ANNOTATION_START',
          value: '{',
          range: {
            start: { line: 1, column: 3, offset: 2 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 1,
        },
        {
          type: 'ANNOTATION',
          value: '{ ref: child }',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 1, column: 18, offset: 17 },
          },
          indent: 1,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 18, offset: 17 },
            end: { line: 1, column: 19, offset: 18 },
          },
          indent: 1,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 19, offset: 18 },
            end: { line: 2, column: 1, offset: 19 },
          },
          indent: 1,
        },
        {
          type: 'CONTENT',
          value: 'Child content',
          range: {
            start: { line: 2, column: 3, offset: 21 },
            end: { line: 2, column: 16, offset: 34 },
          },
          indent: 1,
        },
        {
          type: 'EOF',
          value: '',
          range: {
            start: { line: 2, column: 16, offset: 34 },
            end: { line: 2, column: 16, offset: 34 },
          },
          indent: 1,
        },
      ] satisfies Token[]);
    });

    it('should reset indent on new lines', () => {
      const source = '    deep\nshallow';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: 'deep',
          range: {
            start: { line: 1, column: 5, offset: 4 },
            end: { line: 1, column: 9, offset: 8 },
          },
          indent: 2,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 9, offset: 8 },
            end: { line: 2, column: 1, offset: 9 },
          },
          indent: 2,
        },
        {
          type: 'CONTENT',
          value: 'shallow',
          range: {
            start: { line: 2, column: 1, offset: 9 },
            end: { line: 2, column: 8, offset: 16 },
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

    it('should consume every complete two-space indentation level', () => {
      const source = '- Parent\n    Child content';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '- Parent',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 9, offset: 8 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 9, offset: 8 },
            end: { line: 2, column: 1, offset: 9 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Child content',
          range: {
            start: { line: 2, column: 5, offset: 13 },
            end: { line: 2, column: 18, offset: 26 },
          },
          indent: 2,
        },
        {
          type: 'EOF',
          value: '',
          range: {
            start: { line: 2, column: 18, offset: 26 },
            end: { line: 2, column: 18, offset: 26 },
          },
          indent: 2,
        },
      ] satisfies Token[]);
    });
  });

  describe('inline annotations (kept in CONTENT)', () => {
    it('should preserve inline annotation syntax in CONTENT token', () => {
      const source = '[value]{{ type: meta }}';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '[value]{{ type: meta }}',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 24, offset: 23 },
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

    it('should preserve standalone brackets in CONTENT', () => {
      const source = '[link](url)';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '[link](url)',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 12, offset: 11 },
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

    it('should preserve text and inline annotation in single CONTENT', () => {
      const source = 'Value is [+12%]{{ type: delta }} today';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: 'Value is [+12%]{{ type: delta }} today',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 39, offset: 38 },
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

    it('should preserve empty content inline annotation in CONTENT', () => {
      const source = '[]{{ type: marker }}';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value: '[]{{ type: marker }}',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 21, offset: 20 },
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

    it('should preserve multiple inline annotations in single CONTENT', () => {
      // 81 characters total (with double braces)
      const source =
        'Patient reports [fatigue]{{ severity: moderate }} and [pain]{{ severity: mild }}.';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value:
            'Patient reports [fatigue]{{ severity: moderate }} and [pain]{{ severity: mild }}.',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 82, offset: 81 },
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
