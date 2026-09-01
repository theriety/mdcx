import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('edge cases', () => {
    it('should handle empty lines between blocks', () => {
      const source = '# Title\n\n\nParagraph';

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
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 3, column: 1, offset: 9 },
            end: { line: 4, column: 1, offset: 10 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'Paragraph',
          range: {
            start: { line: 4, column: 1, offset: 10 },
            end: { line: 4, column: 10, offset: 19 },
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

    it('should handle annotation without space', () => {
      const source = '{{ref: intro}}';

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
          value: '{ref: intro}',
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 14, offset: 13 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 14, offset: 13 },
            end: { line: 1, column: 15, offset: 14 },
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

    it('should handle unicode in annotations', () => {
      // 💡 is U+1F4A1, which is 2 UTF-16 code units (surrogate pair)
      // Inner content: "{ icon: '💡', type: callout }" = 29 UTF-16 code units
      const source = "{{ icon: '\u{1F4A1}', type: callout }}";

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
          value: "{ icon: '\u{1F4A1}', type: callout }",
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 31, offset: 30 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 31, offset: 30 },
            end: { line: 1, column: 32, offset: 31 },
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

    it('should handle empty annotation braces', () => {
      const source = '{{}}';

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
          value: '{}',
          range: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'ANNOTATION_END',
          value: '}',
          range: {
            start: { line: 1, column: 4, offset: 3 },
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

    it('should reject an unclosed annotation at end of file', () => {
      const source = '{{ ref: intro';

      expect(() => tokenize(source)).toThrow(
        expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
      );
    });

    it('should handle empty line inside code fence', () => {
      const source = '```\n\n```';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CODE_START',
          value: '```',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 2, column: 1, offset: 4 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 3, column: 1, offset: 5 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 3, column: 1, offset: 5 },
            end: { line: 3, column: 4, offset: 8 },
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

    it('should treat fence with insufficient indentation as code content', () => {
      const source = '  ```\ncode\n```';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CODE_START',
          value: '```',
          range: {
            start: { line: 1, column: 3, offset: 2 },
            end: { line: 1, column: 6, offset: 5 },
          },
          indent: 1,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 6, offset: 5 },
            end: { line: 2, column: 1, offset: 6 },
          },
          indent: 1,
        },
        {
          type: 'CODE',
          value: 'code',
          range: {
            start: { line: 2, column: 1, offset: 6 },
            end: { line: 2, column: 5, offset: 10 },
          },
          indent: 1,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 5, offset: 10 },
            end: { line: 3, column: 1, offset: 11 },
          },
          indent: 1,
        },
        {
          type: 'CODE',
          value: '```',
          range: {
            start: { line: 3, column: 1, offset: 11 },
            end: { line: 3, column: 4, offset: 14 },
          },
          indent: 1,
        },
        {
          type: 'EOF',
          value: '',
          range: {
            start: { line: 3, column: 4, offset: 14 },
            end: { line: 3, column: 4, offset: 14 },
          },
          indent: 1,
        },
      ] satisfies Token[]);
    });

    it('should handle directive without closing delimiter', () => {
      const source = '---\ntype: doc';

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
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });

    it('should handle directive without immediate newline after opener', () => {
      // Directive opener without newline - content starts immediately
      const source = '---type: doc\n---';

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
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 1, column: 13, offset: 12 },
          },
          indent: 0,
        },
        {
          type: 'DIRECTIVE_END',
          value: '---',
          range: {
            start: { line: 2, column: 1, offset: 13 },
            end: { line: 2, column: 4, offset: 16 },
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

    it('should handle empty directive with only delimiters', () => {
      // Empty directive - no content between delimiters
      const source = '---\n---';

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
          type: 'DIRECTIVE_END',
          value: '---',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 2, column: 4, offset: 7 },
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

    it('should handle directive closing without trailing newline', () => {
      const source = '---\ntype: doc\n---';

      const tokens = tokenize(source);

      // Last token before EOF should be DIRECTIVE_END without NEWLINE
      expect(tokens[tokens.length - 2]).toEqual({
        type: 'DIRECTIVE_END',
        value: '---',
        range: {
          start: { line: 3, column: 1, offset: 14 },
          end: { line: 3, column: 4, offset: 17 },
        },
        indent: 0,
      } satisfies Token);
    });

    it('should handle unclosed directive with empty content', () => {
      // Directive opener followed by nothing
      const source = '---';

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
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });

    it('should handle code fence at end of file without newline', () => {
      // Code fence opener at EOF
      const source = '```typescript';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CODE_START',
          value: '```',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'CODE_TYPE',
          value: 'typescript',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 1, column: 14, offset: 13 },
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

    it('should handle code fence closing without trailing newline', () => {
      const source = '```\ncode\n```';

      const tokens = tokenize(source);

      // Last token before EOF should be CODE_END without NEWLINE
      expect(tokens[tokens.length - 2]).toEqual({
        type: 'CODE_END',
        value: '```',
        range: {
          start: { line: 3, column: 1, offset: 9 },
          end: { line: 3, column: 4, offset: 12 },
        },
        indent: 0,
      } satisfies Token);
    });

    it('should handle code content at end of file without newline', () => {
      // Unclosed code fence with content but no trailing newline
      const source = '```\ncode';

      const tokens = tokenize(source);

      expect(tokens).toEqual([
        {
          type: 'CODE_START',
          value: '```',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 2, column: 1, offset: 4 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'code',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 2, column: 5, offset: 8 },
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

    it('should handle annotation without inner opening brace', () => {
      // Malformed annotation - outer brace without inner brace
      const source = '{content}';

      const tokens = tokenize(source);

      // Treated as CONTENT since {{ is not matched
      expect(tokens[0]).toEqual({
        type: 'CONTENT',
        value: '{content}',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
        indent: 0,
      } satisfies Token);
    });

    it('should handle annotation at end of file without newline', () => {
      const source = '{{ ref: intro }}';

      const tokens = tokenize(source);

      // No NEWLINE token after ANNOTATION_END
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
          type: 'EOF',
          value: '',
          range: getEofRange(source),
          indent: 0,
        },
      ] satisfies Token[]);
    });

    it('should reject an annotation with an unclosed inner brace', () => {
      // Inner brace opens but never closes
      const source = '{{ ref: intro';

      expect(() => tokenize(source)).toThrow(
        expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
      );
    });

    it('should handle code fence with zero indent offset', () => {
      // Code fence at column 0 with no indentation
      const source = '```\ncode line\n```';

      const tokens = tokenize(source);

      // fenceOffset is 0, so no advanceN call needed
      const codeEndToken = tokens.find((t) => t.type === 'CODE_END');
      expect(codeEndToken).toBeDefined();
      expect(codeEndToken?.value).toBe('```');
    });

    it('should handle code fence with insufficient indentation for closing', () => {
      // Indented code fence where closing has less indentation
      const source = '  ```\ncode\n```';

      const tokens = tokenize(source);

      // the closing ``` has insufficient indentation so treated as code
      expect(tokens.filter((t) => t.type === 'CODE_END')).toHaveLength(0);
      expect(
        tokens.filter((t) => t.type === 'CODE' && t.value === '```'),
      ).toHaveLength(1);
    });

    it('should handle blank line with no content in code fence', () => {
      // Code fence with completely empty line (no content, just newline)
      const source = '```\n\n```';

      const tokens = tokenize(source);

      // Empty line should emit only newline CODE token
      const codeTokens = tokens.filter((t) => t.type === 'CODE');
      expect(codeTokens).toHaveLength(2); // Opening newline + blank line newline
      expect(codeTokens[0]?.value).toBe('\n');
      expect(codeTokens[1]?.value).toBe('\n');
    });
  });
});
