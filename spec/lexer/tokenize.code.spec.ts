import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';

import { getEofRange } from '../fixtures/positions';

import type { Token } from '#lexer/types';

// TEST SUITES //

describe('fn:tokenize', () => {
  describe('code fences', () => {
    it('should tokenize code fence delimiters', () => {
      const source = '```typescript\nconst x = 1;\n```';

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
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 14, offset: 13 },
            end: { line: 2, column: 1, offset: 14 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'const x = 1;',
          range: {
            start: { line: 2, column: 1, offset: 14 },
            end: { line: 2, column: 13, offset: 26 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 13, offset: 26 },
            end: { line: 3, column: 1, offset: 27 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 3, column: 1, offset: 27 },
            end: { line: 3, column: 4, offset: 30 },
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

    it('should treat code fence content as opaque CODE', () => {
      const source = '```\n{ not: annotation }\n# not heading\n```';

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
          value: '{ not: annotation }',
          range: {
            start: { line: 2, column: 1, offset: 4 },
            end: { line: 2, column: 20, offset: 23 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 20, offset: 23 },
            end: { line: 3, column: 1, offset: 24 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '# not heading',
          range: {
            start: { line: 3, column: 1, offset: 24 },
            end: { line: 3, column: 14, offset: 37 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 3, column: 14, offset: 37 },
            end: { line: 4, column: 1, offset: 38 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 4, column: 1, offset: 38 },
            end: { line: 4, column: 4, offset: 41 },
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

    it('should handle empty code blocks', () => {
      const source = '```\n```';

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
          type: 'CODE_END',
          value: '```',
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

    it('should handle indented code fences under a block', () => {
      const source = `# Examples

  \`\`\`typescript
    import { log } from 'node:console';

    log('hello world');
  \`\`\``;

      const tokens = tokenize(source);

      expect(
        tokens.map(({ type, value, indent }) => ({ type, value, indent })),
      ).toEqual([
        { type: 'CONTENT', value: '# Examples', indent: 0 },
        { type: 'NEWLINE', value: '\n', indent: 0 },
        { type: 'NEWLINE', value: '\n', indent: 0 },
        { type: 'CODE_START', value: '```', indent: 1 },
        { type: 'CODE_TYPE', value: 'typescript', indent: 1 },
        { type: 'CODE', value: '\n', indent: 1 },
        {
          type: 'CODE',
          value: "  import { log } from 'node:console';",
          indent: 1,
        },
        { type: 'CODE', value: '\n', indent: 1 },
        { type: 'CODE', value: '\n', indent: 1 },
        { type: 'CODE', value: "  log('hello world');", indent: 1 },
        { type: 'CODE', value: '\n', indent: 1 },
        { type: 'CODE_END', value: '```', indent: 1 },
        { type: 'EOF', value: '', indent: 1 },
      ]);
    });

    it('should preserve tabs inside opaque fenced code', () => {
      const tokens = tokenize('```typescript\n\tconst value = 1;\n```');

      expect(tokens).toContainEqual(
        expect.objectContaining({
          type: 'CODE',
          value: '\tconst value = 1;',
        }),
      );
    });

    it('should treat escaped fences as code content', () => {
      const source = `\`\`\`markdown
code are marked by
\\\`\\\`\\\`
code content
\\\`\\\`\\\`
\`\`\``;

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
          value: 'markdown',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 1, column: 12, offset: 11 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 12, offset: 11 },
            end: { line: 2, column: 1, offset: 12 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'code are marked by',
          range: {
            start: { line: 2, column: 1, offset: 12 },
            end: { line: 2, column: 19, offset: 30 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 19, offset: 30 },
            end: { line: 3, column: 1, offset: 31 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\\`\\`\\`',
          range: {
            start: { line: 3, column: 1, offset: 31 },
            end: { line: 3, column: 7, offset: 37 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 3, column: 7, offset: 37 },
            end: { line: 4, column: 1, offset: 38 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'code content',
          range: {
            start: { line: 4, column: 1, offset: 38 },
            end: { line: 4, column: 13, offset: 50 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 4, column: 13, offset: 50 },
            end: { line: 5, column: 1, offset: 51 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\\`\\`\\`',
          range: {
            start: { line: 5, column: 1, offset: 51 },
            end: { line: 5, column: 7, offset: 57 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 5, column: 7, offset: 57 },
            end: { line: 6, column: 1, offset: 58 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 6, column: 1, offset: 58 },
            end: { line: 6, column: 4, offset: 61 },
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

    it('should emit newline after closing code fence', () => {
      const source = '```\ncode\n```\ncontent after';

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
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 5, offset: 8 },
            end: { line: 3, column: 1, offset: 9 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 3, column: 1, offset: 9 },
            end: { line: 3, column: 4, offset: 12 },
          },
          indent: 0,
        },
        {
          type: 'NEWLINE',
          value: '\n',
          range: {
            start: { line: 3, column: 4, offset: 12 },
            end: { line: 4, column: 1, offset: 13 },
          },
          indent: 0,
        },
        {
          type: 'CONTENT',
          value: 'content after',
          range: {
            start: { line: 4, column: 1, offset: 13 },
            end: { line: 4, column: 14, offset: 26 },
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

    it('should preserve blank lines within code block', () => {
      const source = `\`\`\`typescript
function example() {
  const x = 1;

  return x;
}
\`\`\``;

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
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 14, offset: 13 },
            end: { line: 2, column: 1, offset: 14 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'function example() {',
          range: {
            start: { line: 2, column: 1, offset: 14 },
            end: { line: 2, column: 21, offset: 34 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 21, offset: 34 },
            end: { line: 3, column: 1, offset: 35 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '  const x = 1;',
          range: {
            start: { line: 3, column: 1, offset: 35 },
            end: { line: 3, column: 15, offset: 49 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 3, column: 15, offset: 49 },
            end: { line: 4, column: 1, offset: 50 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 4, column: 1, offset: 50 },
            end: { line: 5, column: 1, offset: 51 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '  return x;',
          range: {
            start: { line: 5, column: 1, offset: 51 },
            end: { line: 5, column: 12, offset: 62 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 5, column: 12, offset: 62 },
            end: { line: 6, column: 1, offset: 63 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '}',
          range: {
            start: { line: 6, column: 1, offset: 63 },
            end: { line: 6, column: 2, offset: 64 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 6, column: 2, offset: 64 },
            end: { line: 7, column: 1, offset: 65 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 7, column: 1, offset: 65 },
            end: { line: 7, column: 4, offset: 68 },
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

    it('should treat annotation-like syntax inside code fence as code', () => {
      const source = `\`\`\`markdown
{{ ref: 'intro', type: 'callout' }}
Callout

      callout children
\`\`\``;

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
          value: 'markdown',
          range: {
            start: { line: 1, column: 4, offset: 3 },
            end: { line: 1, column: 12, offset: 11 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 1, column: 12, offset: 11 },
            end: { line: 2, column: 1, offset: 12 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: "{{ ref: 'intro', type: 'callout' }}",
          range: {
            start: { line: 2, column: 1, offset: 12 },
            end: { line: 2, column: 36, offset: 47 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 2, column: 36, offset: 47 },
            end: { line: 3, column: 1, offset: 48 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: 'Callout',
          range: {
            start: { line: 3, column: 1, offset: 48 },
            end: { line: 3, column: 8, offset: 55 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 3, column: 8, offset: 55 },
            end: { line: 4, column: 1, offset: 56 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 4, column: 1, offset: 56 },
            end: { line: 5, column: 1, offset: 57 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '      callout children',
          range: {
            start: { line: 5, column: 1, offset: 57 },
            end: { line: 5, column: 23, offset: 79 },
          },
          indent: 0,
        },
        {
          type: 'CODE',
          value: '\n',
          range: {
            start: { line: 5, column: 23, offset: 79 },
            end: { line: 6, column: 1, offset: 80 },
          },
          indent: 0,
        },
        {
          type: 'CODE_END',
          value: '```',
          range: {
            start: { line: 6, column: 1, offset: 80 },
            end: { line: 6, column: 4, offset: 83 },
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
