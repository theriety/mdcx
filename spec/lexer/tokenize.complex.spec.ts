import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('complex documents', () => {
    it('should tokenize document with directive and annotation', () => {
      const source = `---
type: doc
---

{{ ref: intro }}
# Introduction`;

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
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 4, column: 1, offset: 18 },
            end: { line: 5, column: 1, offset: 19 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_START',
          value: '{',
          range: {
            start: { line: 5, column: 1, offset: 19 },
            end: { line: 5, column: 2, offset: 20 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION',
          value: '{ ref: intro }',
          range: {
            start: { line: 5, column: 2, offset: 20 },
            end: { line: 5, column: 16, offset: 34 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 5, column: 16, offset: 34 },
            end: { line: 5, column: 17, offset: 35 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 5, column: 17, offset: 35 },
            end: { line: 6, column: 1, offset: 36 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '# Introduction',
          range: {
            start: { line: 6, column: 1, offset: 36 },
            end: { line: 6, column: 15, offset: 50 },
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

    it('should tokenize callout with nested content', () => {
      const source = `{{ type: callout, icon: 'info' }}
Important Note

  This is content inside the callout.

  - Nested list item 1
  - Nested list item 2`;

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
          value: "{ type: callout, icon: 'info' }",
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 33, offset: 32 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 33, offset: 32 },
            end: { line: 1, column: 34, offset: 33 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 34, offset: 33 },
            end: { line: 2, column: 1, offset: 34 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Important Note',
          range: {
            start: { line: 2, column: 1, offset: 34 },
            end: { line: 2, column: 15, offset: 48 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 15, offset: 48 },
            end: { line: 3, column: 1, offset: 49 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 3, column: 1, offset: 49 },
            end: { line: 4, column: 1, offset: 50 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'This is content inside the callout.',
          range: {
            start: { line: 4, column: 3, offset: 52 },
            end: { line: 4, column: 38, offset: 87 },
          },
          indent: 1,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 4, column: 38, offset: 87 },
            end: { line: 5, column: 1, offset: 88 },
          },
          indent: 1,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 5, column: 1, offset: 88 },
            end: { line: 6, column: 1, offset: 89 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: '- Nested list item 1',
          range: {
            start: { line: 6, column: 3, offset: 91 },
            end: { line: 6, column: 23, offset: 111 },
          },
          indent: 1,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 6, column: 23, offset: 111 },
            end: { line: 7, column: 1, offset: 112 },
          },
          indent: 1,
        },
        {
          type: 'CONTENT',
          value: '- Nested list item 2',
          range: {
            start: { line: 7, column: 3, offset: 114 },
            end: { line: 7, column: 23, offset: 134 },
          },
          indent: 1,
        },
        {
          type: 'EOF',
          value: '',
          range: {
            start: { line: 7, column: 23, offset: 134 },
            end: { line: 7, column: 23, offset: 134 },
          },
          indent: 1,
        },
      ] satisfies Token[]);
    });

    it('should tokenize table with inline annotation preserved in CONTENT', () => {
      // Line 1: 47 chars, Line 2: 49 chars, Line 3: 49 chars (with double braces)
      const source = `| Product | Total                             |
|---------|-------------------------------------|
| Widget  | [3300]{{ expression: SUM(B2:C2) }} |`;

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'BOUNDING',
          value: '| Product | Total                             |',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 48, offset: 47 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 48, offset: 47 },
            end: { line: 2, column: 1, offset: 48 },
          },
          indent: 0,
        },
        {
          type: 'BOUNDING',
          value: '|---------|-------------------------------------|',
          range: {
            start: { line: 2, column: 1, offset: 48 },
            end: { line: 2, column: 50, offset: 97 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 2, column: 50, offset: 97 },
            end: { line: 3, column: 1, offset: 98 },
          },
          indent: 0,
        },
        {
          type: 'BOUNDING',
          value: '| Widget  | [3300]{{ expression: SUM(B2:C2) }} |',
          range: {
            start: { line: 3, column: 1, offset: 98 },
            end: { line: 3, column: 49, offset: 146 },
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

    it('should tokenize medical record with inline annotations preserved', () => {
      const source = `Patient reports [persistent fatigue]{{ source: patient, severity: moderate }}
and [elevated BP]{{ source: patient, readings: '145/92' }}.`;

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CONTENT',
          value:
            'Patient reports [persistent fatigue]{{ source: patient, severity: moderate }}',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 78, offset: 77 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 1, column: 78, offset: 77 },
            end: { line: 2, column: 1, offset: 78 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: "and [elevated BP]{{ source: patient, readings: '145/92' }}.",
          range: {
            start: { line: 2, column: 1, offset: 78 },
            end: { line: 2, column: 60, offset: 137 },
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
