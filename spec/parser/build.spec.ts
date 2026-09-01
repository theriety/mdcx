import { describe, expect, it } from 'vitest';

import { parseOneBlock } from '#parser/block-parser';
import { buildAst } from '#parser/build';
import { TokenCursor } from '#parser/token-cursor';

import { createToken } from '../fixtures/tokens';

import type { Token } from '#lexer/types';
import type { TableNode } from '#types';

// TEST SUITES //

describe('fn:buildAst', () => {
  it('should return no block for an exhausted cursor', () => {
    expect(
      parseOneBlock({
        cursor: new TokenCursor([]),
        options: {},
        blockParser: () => [],
      }),
    ).toEqual({
      block: null,
      indent: 0,
    });
  });

  describe('empty document', () => {
    it('should build empty AST from EOF only', () => {
      const tokens = [createToken('', { type: 'EOF' })];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        type: 'document',
        children: [],
      });
    });
  });

  describe('options', () => {
    it('should apply options type', () => {
      const tokens = [createToken('', { type: 'EOF' })];

      const ast = buildAst(tokens, { type: 'notion' });

      expect(ast.type).toBe('notion');
    });

    it('should apply default annotations', () => {
      const tokens = [createToken('', { type: 'EOF' })];

      const ast = buildAst(tokens, { annotations: { version: '1.0' } });

      expect(ast.annotations).toEqual({ version: '1.0' });
    });
  });

  describe('directive', () => {
    it('should parse directive', () => {
      const tokens = [
        createToken('---', { type: 'DIRECTIVE_START' }),
        createToken('type: doc', { type: 'ANNOTATION' }),
        createToken('---', { type: 'DIRECTIVE_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast.annotations).toEqual({ type: 'doc' });
    });

    it('should merge default annotations with directive', () => {
      const tokens = [
        createToken('---', { type: 'DIRECTIVE_START' }),
        createToken('author: Jane', { type: 'ANNOTATION' }),
        createToken('---', { type: 'DIRECTIVE_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, { annotations: { version: '1.0' } });

      expect(ast.annotations).toMatchObject({
        version: '1.0',
        author: 'Jane',
      });
    });

    it('should let directive be overridden', () => {
      const tokens = [
        createToken('---', { type: 'DIRECTIVE_START' }),
        createToken("version: '2.0'", { type: 'ANNOTATION' }),
        createToken('---', { type: 'DIRECTIVE_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, { annotations: { version: '1.0' } });

      expect(ast.annotations?.version).toBe('1.0');
    });

    it('should handle unclosed directive at end of document', () => {
      const tokens = [
        createToken('---', { type: 'DIRECTIVE_START' }),
        createToken('author: Test', { type: 'ANNOTATION' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        annotations: { author: 'Test' },
        children: [],
      });
    });

    it('should handle sparse token array with undefined hole in directive', () => {
      const tokens: Token[] = [];
      tokens[0] = createToken('---', { type: 'DIRECTIVE_START' });
      tokens[2] = createToken('author: Jane', { type: 'ANNOTATION' });
      tokens[3] = createToken('---', { type: 'DIRECTIVE_END' });
      tokens[4] = createToken('', { type: 'EOF' });

      const ast = buildAst(tokens);

      expect(ast.annotations).toEqual({ author: 'Jane' });
    });
  });

  describe('block annotations', () => {
    it('should attach block annotations', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ ref: intro, color: blue }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('# Introduction', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // ref is extracted to top-level, remaining annotations in annotations object
      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'heading',
            ref: 'intro',
            annotations: { depth: 1, color: 'blue' },
          }),
        ],
      });
    });

    it('should handle blocks without annotations', () => {
      const tokens = [
        createToken('# Title', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'heading',
            annotations: { depth: 1 },
          }),
        ],
      });
    });

    it('should reject non-ANNOTATION tokens within a block annotation', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('ignored content', { type: 'CONTENT' }),
        createToken('{ ref: valid }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('# Heading', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      expect(() => buildAst(tokens)).toThrow(
        expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
      );
    });

    describe('orphan annotations', () => {
      it('should reject an orphan annotation followed by another annotation', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: orphan }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: valid }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('Content', { type: 'CONTENT' }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });

      it('should reject an untyped orphan annotation at end of document', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: orphan }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });

      it('should reject multiple consecutive orphan annotations', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: orphan1 }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: orphan2 }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('{', { type: 'ANNOTATION_START' }),
          createToken('{ ref: valid }', { type: 'ANNOTATION' }),
          createToken('}', { type: 'ANNOTATION_END' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('Content', { type: 'CONTENT' }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });
    });
  });

  describe('content blocks (block type inference)', () => {
    it('should skip leading newlines before content', () => {
      const tokens = [
        createToken('\n', { type: 'NEWLINE' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('# Title', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast.children).toEqual([
        expect.objectContaining({ type: 'heading' }),
      ]);
    });

    it('should build heading from CONTENT token starting with #', () => {
      const tokens = [
        createToken('# Title', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast.children).toEqual([
        expect.objectContaining({ type: 'heading' }),
      ]);
    });

    it('should build multiple blocks', () => {
      const tokens = [
        createToken('# Title', { type: 'CONTENT' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Paragraph text', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast.children).toEqual([
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'paragraph' }),
      ]);
    });
  });

  describe('code blocks', () => {
    it('should build code block from CODE_START/CODE_END tokens', () => {
      const tokens = [
        createToken('```', { type: 'CODE_START' }),
        createToken('typescript', { type: 'CODE_TYPE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('const x = 1;', { type: 'CODE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            language: 'typescript',
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'const x = 1;',
              }),
            ],
          }),
        ],
      });
    });

    it('should handle empty code blocks', () => {
      const tokens = [
        createToken('```', { type: 'CODE_START' }),
        createToken('\n', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [expect.objectContaining({ type: 'code' })],
      });
    });

    it('should preserve blank lines between code content', () => {
      const tokens = [
        createToken('```', { type: 'CODE_START' }),
        createToken('\n', { type: 'CODE' }),
        createToken('a', { type: 'CODE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('b', { type: 'CODE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'a\n\nb',
              }),
            ],
          }),
        ],
      });
    });

    it('should set language to undefined when CODE_TYPE is whitespace only', () => {
      const tokens = [
        createToken('```', { type: 'CODE_START' }),
        createToken('   ', { type: 'CODE_TYPE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('content', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            language: undefined,
          }),
        ],
      });
    });

    it('should attach annotations with ref to code block', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ ref: code-example }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('```', { type: 'CODE_START' }),
        createToken('js', { type: 'CODE_TYPE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('console.log("hi")', { type: 'CODE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // ref is extracted to top-level, annotations should be undefined (empty after extraction)
      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            ref: 'code-example',
          }),
        ],
      });
    });

    it('should attach code block annotations without setting ref when not string', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ highlight: true }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('```', { type: 'CODE_START' }),
        createToken('js', { type: 'CODE_TYPE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('code', { type: 'CODE' }),
        createToken('```', { type: 'CODE_END' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // ref is undefined when not provided
      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            annotations: { highlight: true },
          }),
        ],
      });
    });

    it('should handle unclosed code fence at end of document', () => {
      const tokens = [
        createToken('```', { type: 'CODE_START' }),
        createToken('ts', { type: 'CODE_TYPE' }),
        createToken('\n', { type: 'CODE' }),
        createToken('const x = 1;', { type: 'CODE' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'code',
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'const x = 1;',
              }),
            ],
          }),
        ],
      });
    });

    it('should handle sparse token array with undefined hole in code block', () => {
      const tokens: Token[] = [];
      tokens[0] = createToken('```', { type: 'CODE_START' });
      tokens[1] = createToken('ts', { type: 'CODE_TYPE' });
      tokens[2] = createToken('\n', { type: 'CODE' });
      tokens[4] = createToken('```', { type: 'CODE_END' });
      tokens[5] = createToken('', { type: 'EOF' });

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [expect.objectContaining({ type: 'code' })],
      });
    });
  });

  describe('indentation', () => {
    it('should handle indented blocks via indentLevel', () => {
      const tokens = [
        createToken('- Parent', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('- Child', { type: 'CONTENT', indent: 1 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // item can contain nested blocks
      expect(ast.children.length).toBeGreaterThanOrEqual(1);
    });

    it('should stop nesting when indent decreases below expected level', () => {
      const tokens = [
        createToken('- Parent', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('- Nested', { type: 'CONTENT', indent: 1 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('- Sibling', { type: 'CONTENT', indent: 0 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // Parent bullet with nested child, then sibling bullet at same level
      expect(ast.children).toHaveLength(2);
      expect(ast.children[0]).toMatchObject({
        type: 'bullet',
        children: [expect.objectContaining({ type: 'bullet' })],
      });
      expect(ast.children[1]).toMatchObject({
        type: 'bullet',
      });
    });

    it('should accept block nesting at the parser limit', () => {
      const tokens = Array.from({ length: 129 }, (_value, indent) => [
        createToken(`- Level ${indent}`, { type: 'CONTENT', indent }),
        createToken('\n', { type: 'NEWLINE' }),
      ]).flat();
      tokens.push(createToken('', { type: 'EOF' }));

      expect(buildAst(tokens)).toMatchObject({ type: 'document' });
    });

    it('should reject block nesting one level above the parser limit', () => {
      const tokens = Array.from({ length: 130 }, (_value, indent) => [
        createToken(`- Level ${indent}`, { type: 'CONTENT', indent }),
        createToken('\n', { type: 'NEWLINE' }),
      ]).flat();
      tokens.push(createToken('', { type: 'EOF' }));

      expect(() => buildAst(tokens)).toThrow(
        expect.objectContaining({ code: 'MDC_INDENTATION_INVALID' }),
      );
    });
  });

  describe('table blocks', () => {
    it('should build table from consecutive table line tokens', () => {
      const tokens = [
        createToken('| A | B |', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('|---|---|', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('| 1 | 2 |', { type: 'BOUNDING', indent: 0 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'table',
            headers: expect.arrayContaining([
              expect.objectContaining({ type: 'header' }),
            ]),
          }),
        ],
      });
    });

    it('should attach annotations with ref to table block', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ ref: data-table }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('| Col1 | Col2 |', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('|------|------|', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('| Val1 | Val2 |', { type: 'BOUNDING', indent: 0 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'table',
            ref: 'data-table',
          }),
        ],
      });
    });

    it('should attach table annotations without setting ref when not string', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ sortable: true }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('| A | B |', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('|---|---|', { type: 'BOUNDING', indent: 0 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      // ref is undefined when not provided, annotations contain sortable
      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({
            type: 'table',
            annotations: { sortable: true },
          }),
        ],
      });
    });

    it('should handle sparse token array in pipe content parsing', () => {
      const tokens: Token[] = [];
      tokens[0] = createToken('| A | B |', { type: 'CONTENT', indent: 0 });
      tokens[1] = createToken('\n', { type: 'NEWLINE' });
      // sparse array - tokens[2] is undefined, so separator at [3] won't be collected
      tokens[3] = createToken('|---|---|', { type: 'CONTENT', indent: 0 });
      tokens[4] = createToken('', { type: 'EOF' });

      const ast = buildAst(tokens);

      // without separator being collected, single row becomes table without headers
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]?.type).toBe('table');
      expect(
        (ast.children[0] as TableNode | undefined)?.headers,
      ).toBeUndefined();
    });

    describe('indented tables with annotations', () => {
      it('should reject an annotation separated from an indented table', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START', indent: 0 }),
          createToken('{ ref: data-table, table_width: 2 }', {
            type: 'ANNOTATION',
            indent: 0,
          }),
          createToken('}', { type: 'ANNOTATION_END', indent: 0 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('\n', { type: 'NEWLINE' }), // blank line
          createToken('| Col A | Col B |', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('|-------|-------|', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| A | B |', { type: 'BOUNDING', indent: 1 }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });

      it('should reject indentation disagreement after an annotation', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START', indent: 0 }),
          createToken('{ ref: my-table }', { type: 'ANNOTATION', indent: 0 }),
          createToken('}', { type: 'ANNOTATION_END', indent: 0 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| A | B | C |', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('|---|---|---|', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| 1 | 2 | 3 |', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| 4 | 5 | 6 |', { type: 'BOUNDING', indent: 1 }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });

      it('should reject a separated annotation before an indented layout', () => {
        const tokens = [
          createToken('{', { type: 'ANNOTATION_START', indent: 0 }),
          createToken('{ ref: my-layout }', { type: 'ANNOTATION', indent: 0 }),
          createToken('}', { type: 'ANNOTATION_END', indent: 0 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| Col A | Col B |', { type: 'BOUNDING', indent: 1 }),
          createToken('\n', { type: 'NEWLINE' }),
          createToken('| Content | More |', { type: 'BOUNDING', indent: 1 }),
          createToken('', { type: 'EOF' }),
        ];

        expect(() => buildAst(tokens)).toThrow(
          expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
        );
      });
    });
  });

  describe('edge cases', () => {
    it('should reject a sparse token array after annotations', () => {
      const tokens: Token[] = [];
      tokens[0] = createToken('{', { type: 'ANNOTATION_START' });
      tokens[1] = createToken('{ ref: intro }', { type: 'ANNOTATION' });
      tokens[2] = createToken('}', { type: 'ANNOTATION_END' });
      tokens[3] = createToken('\n', { type: 'NEWLINE' });
      // tokens[4] is undefined (sparse hole) - triggers line 209 return null
      tokens[5] = createToken('', { type: 'EOF' });

      expect(() => buildAst(tokens)).toThrow(
        expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
      );
    });

    it('should end bounding block when sparse array has undefined hole', () => {
      const tokens: Token[] = [];
      tokens[0] = createToken('| A | B |', { type: 'BOUNDING', indent: 0 });
      // tokens[1] is undefined (sparse hole) - triggers line 348 break
      tokens[2] = createToken('', { type: 'EOF' });

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [expect.objectContaining({ type: 'layout' })],
      });
    });

    it('should end bounding block on double newline (blank line)', () => {
      const tokens = [
        createToken('| A | B |', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Paragraph after blank line', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({ type: 'layout' }),
          expect.objectContaining({ type: 'paragraph' }),
        ],
      });
    });

    it('should end bounding block when followed by non-bounding content', () => {
      const tokens = [
        createToken('| A | B |', { type: 'BOUNDING', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('# Heading', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens);

      expect(ast).toMatchObject({
        children: [
          expect.objectContaining({ type: 'layout' }),
          expect.objectContaining({ type: 'heading' }),
        ],
      });
    });
  });

  describe('onContent middleware', () => {
    it('should call onContent middleware', () => {
      const blocks: string[] = [];
      const tokens = [
        createToken('# Title', { type: 'CONTENT' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Paragraph', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      buildAst(tokens, {
        onContent: (content, context) => {
          blocks.push(content);

          return context.parseContent(content);
        },
      });

      expect(blocks).toHaveLength(2);
    });

    it('should merge existing children with parsed nested children', () => {
      const tokens = [
        createToken('- Parent', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('- Child', { type: 'CONTENT', indent: 1 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          const parsed = context.parseContent(content);

          // return block without children property to trigger ?? [] fallback
          return {
            type: parsed.type,
            range: parsed.range,
            content: parsed.content,
          };
        },
      });

      expect(ast).toMatchObject({
        children: [expect.objectContaining({ children: expect.any(Array) })],
      });
    });

    it('should handle onContent returning block without children when nested blocks exist', () => {
      const tokens = [
        createToken('> Quote', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Nested', { type: 'CONTENT', indent: 1 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          // return minimal block without children property
          return {
            type: 'quote',
            range: context.parseContent(content).range,
          };
        },
      });

      // should have merged nested children even though we returned no children
      expect(ast).toMatchObject({
        children: [{ children: [expect.anything()] }],
      });
    });

    it('should handle onContent returning block without children property', () => {
      const tokens = [
        createToken('- List item', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Nested content', { type: 'CONTENT', indent: 1 }),
        createToken('', { type: 'EOF' }),
      ];

      let firstBlockReturned = false;
      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          const parsed = context.parseContent(content);

          // only strip children for the first block (the bullet with nesting)
          if (!firstBlockReturned && parsed.type === 'bullet') {
            firstBlockReturned = true;

            const { children: _, ...blockWithoutChildren } = parsed;

            return blockWithoutChildren;
          }

          return parsed;
        },
      });

      expect(ast).toMatchObject({
        children: [{ children: [expect.anything()] }],
      });
    });

    it('should use empty array when block.children is falsy and nested children exist', () => {
      const tokens = [
        createToken('> Quote line', { type: 'CONTENT', indent: 0 }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Nested under quote', { type: 'CONTENT', indent: 1 }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          const parsed = context.parseContent(content);

          // return block without children array to force fallback to []
          return {
            type: parsed.type,
            range: parsed.range,
            content: parsed.content,
          };
        },
      });

      expect(ast).toMatchObject({
        children: [{ type: 'quote', children: [expect.anything()] }],
      });
    });

    it('should allow onContent to filter blocks', () => {
      const tokens = [
        createToken('# Title', { type: 'CONTENT' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Paragraph', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          if (content.startsWith('#')) {
            return null; // filter out headings
          }

          return context.parseContent(content);
        },
      });

      expect(ast.children).toEqual([
        expect.objectContaining({ type: 'paragraph' }),
      ]);
    });

    it('should allow onContent to transform blocks', () => {
      const tokens = [
        createToken('{', { type: 'ANNOTATION_START' }),
        createToken('{ type: callout }', { type: 'ANNOTATION' }),
        createToken('}', { type: 'ANNOTATION_END' }),
        createToken('\n', { type: 'NEWLINE' }),
        createToken('Important', { type: 'CONTENT' }),
        createToken('', { type: 'EOF' }),
      ];

      const ast = buildAst(tokens, {
        onContent: (content, context) => {
          if (context.type === 'callout') {
            const parsed = context.parseContent(content);

            return {
              type: 'callout',
              range: parsed.range,
            };
          }

          return context.parseContent(content);
        },
      });

      expect(ast).toMatchObject({
        children: [expect.objectContaining({ type: 'callout' })],
      });
    });
  });
});
