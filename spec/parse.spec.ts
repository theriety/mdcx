import { describe, expect, it } from 'vitest';

import { parse } from '#parse';

import type { PartialDeep } from 'type-fest';

import type {
  CellNode,
  HeaderNode,
  HeadingNode,
  InlineNode,
  RowNode,
} from '#types';

// TEST SUITES //

describe('fn:parse', () => {
  describe('parse mode configuration', () => {
    it('should reject recovery mode without a diagnostic callback', () => {
      expect(() =>
        parse('content', { mode: 'recover' } as Parameters<typeof parse>[1]),
      ).toThrow(
        expect.objectContaining({
          code: 'MDCX_RECOVERY_CONFIGURATION_INVALID',
        }),
      );
    });

    it('should reject a diagnostic callback outside recovery mode', () => {
      expect(() =>
        parse('content', {
          mode: 'strict',
          onDiagnostic: () => undefined,
        } as unknown as Parameters<typeof parse>[1]),
      ).toThrow(
        expect.objectContaining({
          code: 'MDCX_RECOVERY_CONFIGURATION_INVALID',
        }),
      );
    });

    it('should accept explicit recovery mode with a diagnostic callback', () => {
      expect(
        parse('content', {
          mode: 'recover',
          onDiagnostic: () => undefined,
        }),
      ).toMatchObject({ type: 'document' });
    });

    it('should accept the nesting limit in recovery mode', () => {
      const source = Array.from(
        { length: 129 },
        (_value, indent) => `${'  '.repeat(indent)}- Level ${indent}`,
      ).join('\n');

      expect(
        parse(source, { mode: 'recover', onDiagnostic: () => undefined }),
      ).toMatchObject({ type: 'document' });
    });

    it('should reject one level above the nesting limit in recovery mode', () => {
      const source = Array.from(
        { length: 130 },
        (_value, indent) => `${'  '.repeat(indent)}- Level ${indent}`,
      ).join('\n');

      expect(() =>
        parse(source, { mode: 'recover', onDiagnostic: () => undefined }),
      ).toThrow(expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }));
    });
  });

  describe('basic parsing', () => {
    it('should parse empty document', () => {
      const ast = parse('');

      expect(ast).toMatchObject({
        type: 'document',
        children: [],
      });
    });

    it('should parse simple paragraph', () => {
      const ast = parse('Hello world');

      expect(ast).toMatchObject({
        children: [{ type: 'paragraph' }],
      });
    });

    it('should parse heading', () => {
      const ast = parse('# Title');

      expect(ast).toMatchObject({
        children: [{ type: 'heading', annotations: { depth: 1 } }],
      });
    });

    it('should parse multiple blocks', () => {
      const mdc = ['# Title', '', 'Paragraph'].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        { type: 'heading' },
        { type: 'paragraph' },
      ]);
    });

    it('should accept matching closing markers after referenced blocks', () => {
      const mdc = [
        '{{ ref: parent }}',
        '- Parent',
        '  {{ ref: child }}',
        '  - Child',
        '  --{ ref: child }--',
        '--{ ref: parent }--',
      ].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'bullet',
          ref: 'parent',
          children: [{ type: 'bullet', ref: 'child' }],
        },
      ]);
    });

    it('should parse nested layout and column containers with closing markers', () => {
      const mdc = [
        '{{ type: layout, ratios: "1,1,1", ref: layout-id }}',
        '  {{ type: column, width_ratio: 0.33333333333333337, ref: column-a }}',
        '    {{ type: child_page, ref: page-a }}',
        '    [Reference]{{ type: page, ref: page-a }}',
        '    --{ ref: page-a }--',
        '',
        '  {{ type: column, width_ratio: 0.3333333333333333, ref: column-b }}',
        '    {{ ref: paragraph-b }}',
        '    Requirements',
        '    --{ ref: paragraph-b }--',
        '--{ ref: layout-id }--',
      ].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'layout',
          ref: 'layout-id',
          annotations: { ratios: '1,1,1' },
          children: [
            {
              type: 'column',
              ref: 'column-a',
              annotations: { width_ratio: 0.33333333333333337 },
              children: [{ type: 'child_page', ref: 'page-a' }],
            },
            {
              type: 'column',
              ref: 'column-b',
              annotations: { width_ratio: 0.3333333333333333 },
              children: [{ type: 'paragraph', ref: 'paragraph-b' }],
            },
          ],
        },
      ]);
    });

    it('should treat under-indented declared child blocks as siblings without closing markers', () => {
      const ast = parse(
        ['{{ ref: parent }}', '- Parent', '{{ ref: child }}', '- Child'].join(
          '\n',
        ),
      );

      expect(ast.children).toMatchObject([
        { type: 'bullet', ref: 'parent', children: [] },
        { type: 'bullet', ref: 'child', content: [{ text: 'Child' }] },
      ]);
    });

    it('should not recover under-indented content without a declared child block', () => {
      expect(() =>
        parse(
          [
            '{{ ref: parent }}',
            '- Parent',
            '- Child',
            '--{ ref: parent }--',
          ].join('\n'),
        ),
      ).toThrow('does not match block ref');
    });

    it('should reject under-indented declared children despite matching markers', () => {
      expect(() =>
        parse(
          [
            '{{ ref: parent }}',
            '- Parent',
            '{{ ref: child }}',
            '- Child',
            '--{ ref: child }--',
            '--{ ref: parent }--',
          ].join('\n'),
        ),
      ).toThrow(
        expect.objectContaining({ code: 'MDCX_CLOSING_MARKER_INVALID' }),
      );
    });

    it('should reject closing markers that do not match block refs', () => {
      const mdc = ['{{ ref: intro }}', '# Intro', '--{ ref: other }--'].join(
        '\n',
      );

      expect(() => parse(mdc)).toThrow(
        'Closing marker ref "other" does not match block ref "intro"',
      );
    });

    it('should reject closing markers with additional args', () => {
      const mdc = [
        '{{ ref: intro }}',
        '# Intro',
        '--{ ref: intro, type: x }--',
      ].join('\n');

      expect(() => parse(mdc)).toThrow(
        expect.objectContaining({ code: 'MDCX_CLOSING_MARKER_INVALID' }),
      );
    });

    it('should reject closing markers at a different indentation level', () => {
      const mdc = ['{{ ref: intro }}', '- Intro', '  --{ ref: intro }--'].join(
        '\n',
      );

      expect(() => parse(mdc)).toThrow(
        expect.objectContaining({ code: 'MDCX_CLOSING_MARKER_INVALID' }),
      );
    });

    it('should reject orphan closing markers', () => {
      expect(() => parse('--{ ref: orphan }--')).toThrow(
        'Unexpected closing marker',
      );
    });

    it('should parse a typed empty paragraph with a redundant closing marker', () => {
      const ast = parse('{{ type: paragraph, ref: abc }}\n--{ ref: abc }--');

      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]).toMatchObject({
        type: 'paragraph',
        ref: 'abc',
        annotations: {},
        content: [],
      });
    });

    it('should parse a typed annotation-only block at end of input', () => {
      const ast = parse('{{ type: paragraph, ref: empty }}');

      expect(ast.children).toMatchObject([
        { type: 'paragraph', ref: 'empty', content: [], children: [] },
      ]);
    });

    it('should keep a typed empty declaration separate from a following sibling', () => {
      const ast = parse(
        ['{{ type: paragraph, ref: empty }}', '', 'Following'].join('\n'),
      );

      expect(ast.children).toMatchObject([
        { type: 'paragraph', ref: 'empty', content: [] },
        { type: 'paragraph', content: [{ text: 'Following' }] },
      ]);
    });

    it('should reject an untyped annotation-only declaration', () => {
      expect(() => parse('{{ ref: orphan }}')).toThrow(
        expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
      );
    });

    it('should preserve annotations on an empty paragraph with ref', () => {
      const ast = parse(
        '{{ type: paragraph, color: red, ref: abc }}\n--{ ref: abc }--',
      );

      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]).toMatchObject({
        type: 'paragraph',
        ref: 'abc',
        annotations: { color: 'red' },
        content: [],
      });
    });

    it('should parse an empty paragraph nested inside a toggle', () => {
      const mdc = [
        '{{ ref: parent }}',
        '- Parent',
        '  {{ type: paragraph, ref: inner }}',
        '  --{ ref: inner }--',
        '--{ ref: parent }--',
      ].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'bullet',
          ref: 'parent',
          children: [
            {
              type: 'paragraph',
              ref: 'inner',
              annotations: {},
              content: [],
            },
          ],
        },
      ]);
    });

    it('should reject a marker that attempts to merge same-indent blocks', () => {
      expect(() =>
        parse(
          [
            '{{ ref: deps }}',
            '- `pydantic` — option parsing',
            '- `blake3` — request ids',
            '- `httpx` — transport',
            '--{ ref: deps }--',
          ].join('\n'),
        ),
      ).toThrow(
        expect.objectContaining({ code: 'MDCX_CLOSING_MARKER_MISMATCH' }),
      );
    });

    it('should accept a redundant matching marker after a table', () => {
      const ast = parse(
        [
          '{{ ref: scores }}',
          '| Name | Score |',
          '| --- | --- |',
          '| Alice | 95 |',
          '--{ ref: scores }--',
        ].join('\n'),
      );

      expect(ast.children).toMatchObject([{ type: 'table', ref: 'scores' }]);
    });

    it('should accept a redundant matching marker after a layout', () => {
      const ast = parse(
        [
          '{{ type: layout, ref: columns }}',
          '| Left | Right |',
          '| A | B |',
          '--{ ref: columns }--',
        ].join('\n'),
      );

      expect(ast.children).toMatchObject([{ type: 'layout', ref: 'columns' }]);
    });

    it('should parse bullet list items', () => {
      const mdc = '- Item 1\n- Item 2';

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'bullet',
          content: [{ type: 'text', text: 'Item 1' }],
        },
        {
          type: 'bullet',
          content: [{ type: 'text', text: 'Item 2' }],
        },
      ]);
    });

    it('should parse todos lists', () => {
      const mdc = '- [ ] Unchecked\n- [x] Checked';

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'todo',
          annotations: {
            checked: false,
          },
        },
        {
          type: 'todo',
          annotations: {
            checked: true,
          },
        },
      ]);
    });

    it('should parse quotes', () => {
      const ast = parse('> Quote text');

      expect(ast).toMatchObject({
        children: [{ type: 'quote' }],
      });
    });

    it('should merge non-`>`-prefixed continuation lines into the same quote', () => {
      const ast = parse('> first line\n— second line');

      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]).toMatchObject({
        type: 'quote',
        content: [{ type: 'text', text: 'first line\n— second line' }],
      });
    });

    it('should stop quote continuation at a blank line', () => {
      const ast = parse('> first line\n\n— second line');

      expect(ast.children).toMatchObject([
        { type: 'quote', content: [{ type: 'text', text: 'first line' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '— second line' }],
        },
      ]);
    });

    it('should stop quote continuation when next line starts a new block', () => {
      const ast = parse('> first line\n# heading');

      expect(ast.children).toMatchObject([
        { type: 'quote', content: [{ type: 'text', text: 'first line' }] },
        { type: 'heading' },
      ]);
    });

    it('should parse divider within document content', () => {
      // note: '---' at document start is front matter delimiter, not divider
      const mdc = ['# Title', '', '---', '', 'Paragraph'].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        { type: 'heading' },
        { type: 'divider' },
        { type: 'paragraph' },
      ]);
    });

    it('should parse divider with extended hyphens', () => {
      const mdc = ['# Title', '', '-----'].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        { type: 'heading' },
        { type: 'divider' },
      ]);
    });

    it('should parse equation from double dollar signs', () => {
      const ast = parse('$$ E = mc^2 $$');

      expect(ast).toMatchObject({
        children: [
          {
            type: 'equation',
            content: [{ type: 'text', text: 'E = mc^2' }],
          },
        ],
      });
    });

    it('should parse equation with LaTeX content', () => {
      const ast = parse('$$ x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a} $$');

      expect(ast).toMatchObject({
        children: [
          {
            type: 'equation',
            content: [
              { type: 'text', text: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
            ],
          },
        ],
      });
    });

    it('should parse code blocks', () => {
      const mdc = ['```typescript', 'const x = 1;', '```'].join('\n');

      const ast = parse(mdc);

      expect(ast).toMatchObject({
        children: [
          {
            type: 'code',
            language: 'typescript',
            content: [{ type: 'text', text: 'const x = 1;' }],
          },
        ],
      });
    });

    it('should parse layout (pipe-delimited without separator)', () => {
      const ast = parse('| A | B | C |');

      // single row without separator is a layout with column children
      expect(ast).toMatchObject({
        children: [{ type: 'layout' }],
      });
    });

    it('should parse table (pipe-delimited with separator)', () => {
      const ast = parse(
        ['| A | B | C |', '|---|---|---|', '| 1 | 2 | 3 |'].join('\n'),
      );

      // with separator line, it's a table
      expect(ast).toMatchObject({
        children: [{ type: 'table' }],
      });
    });

    it('should parse table headers and rows', () => {
      const mdc = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join(
        '\n',
      );

      const ast = parse(mdc);
      const table = ast.children[0];

      expect(table).toMatchObject({
        type: 'table',
        headers: [
          { type: 'header', content: [{ type: 'text', text: 'A' }] },
          { type: 'header', content: [{ type: 'text', text: 'B' }] },
        ],
        children: [
          {
            type: 'row',
            children: [
              { type: 'cell', content: [{ type: 'text', text: '1' }] },
              { type: 'cell', content: [{ type: 'text', text: '2' }] },
            ],
          },
          {
            type: 'row',
            children: [
              { type: 'cell', content: [{ type: 'text', text: '3' }] },
              { type: 'cell', content: [{ type: 'text', text: '4' }] },
            ],
          },
        ],
      });
    });

    it('should parse nested table headers and rows under a parent', () => {
      const mdc = [
        '## Table',
        '  | A | B |',
        '  |---|---|',
        '  | 1 | 2 |',
        '  | 3 | 4 |',
      ].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([
        {
          type: 'heading',
          annotations: {
            depth: 2,
          },
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'A' }] as Array<
                    PartialDeep<InlineNode>
                  >,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'B' }] as Array<
                    PartialDeep<InlineNode>
                  >,
                },
              ] as Array<PartialDeep<HeaderNode>>,
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1' }] as Array<
                        PartialDeep<InlineNode>
                      >,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2' }] as Array<
                        PartialDeep<InlineNode>
                      >,
                    },
                  ] as Array<PartialDeep<CellNode>>,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3' }] as Array<
                        PartialDeep<InlineNode>
                      >,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '4' }] as Array<
                        PartialDeep<InlineNode>
                      >,
                    },
                  ] as Array<PartialDeep<CellNode>>,
                },
              ] as Array<PartialDeep<RowNode>>,
            },
          ],
        } as PartialDeep<HeadingNode>,
      ]);
    });
  });

  describe('directive', () => {
    it('should parse directive', () => {
      const mdc = ['---', 'type: doc', 'author: Jane', '---', '# Title'].join(
        '\n',
      );

      const ast = parse(mdc);

      expect(ast.annotations).toEqual({ type: 'doc', author: 'Jane' });
    });

    it('should merge default annotations with directive', () => {
      const mdc = ['---', 'author: Jane', '---', '# Title'].join('\n');

      const ast = parse(mdc, { annotations: { version: '1.0' } });

      expect(ast.annotations).toEqual({ version: '1.0', author: 'Jane' });
    });

    it('should let directive be overridden', () => {
      const mdc = ['---', 'version: "2.0"', '---', '# Title'].join('\n');

      const ast = parse(mdc, { annotations: { version: '1.0' } });

      expect(ast.annotations?.version).toBe('1.0');
    });
  });

  describe('block annotations', () => {
    it('should attach annotations to blocks', () => {
      const mdc =
        '{{ ref: intro, type: overridden, foo: boo }}\n# Introduction';

      const ast = parse(mdc);

      expect(ast).toMatchObject({
        children: [
          { type: 'overridden', ref: 'intro', annotations: { foo: 'boo' } },
        ],
      });
    });

    it('should handle blocks without annotations', () => {
      const ast = parse('# Title');

      expect(ast).toMatchObject({
        children: [{ type: 'heading', annotations: { depth: 1 } }],
      });
    });

    it('should parse multiple annotated blocks', () => {
      const mdc = [
        '{{ ref: first }}',
        '# First',
        '',
        '{{ ref: second }}',
        '# Second',
      ].join('\n');

      const ast = parse(mdc);

      expect(ast.children).toMatchObject([{ ref: 'first' }, { ref: 'second' }]);
    });
  });

  describe('inline content', () => {
    it('should parse bold text in blocks', () => {
      const ast = parse('**bold text**');

      expect(ast).toMatchObject({
        children: [
          {
            content: [expect.anything()],
          },
        ],
      });
    });

    it('should parse links in blocks', () => {
      const ast = parse('[link text](https://example.com)');

      expect(ast).toMatchObject({
        children: [
          {
            content: [
              expect.objectContaining({
                type: 'link',
                caption: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'link text',
                  }),
                ],
              }),
            ],
          },
        ],
      });
    });

    it('should parse links with annotations', () => {
      const ast = parse('[link text](https://example.com){{ ref: link1 }}');

      expect(ast).toMatchObject({
        children: [
          {
            content: [
              expect.objectContaining({
                type: 'link',
                caption: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'link text',
                  }),
                ],
                annotations: { ref: 'link1' },
              }),
            ],
          },
        ],
      });
    });

    it('should parse media in blocks', () => {
      const ast = parse('![alt](https://example.com/image.png)');

      expect(ast).toMatchObject({
        children: [
          {
            content: [
              expect.objectContaining({
                type: 'media',
                caption: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'alt',
                  }),
                ],
                src: 'https://example.com/image.png',
              }),
            ],
          },
        ],
      });
    });

    it('should parse media with annotations', () => {
      const ast = parse('![alt](image.png){{ ref: image1 }}');

      expect(ast).toMatchObject({
        children: [
          {
            content: [
              expect.objectContaining({
                type: 'media',
                caption: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'alt',
                  }),
                ],
                src: 'image.png',
                annotations: { ref: 'image1' },
              }),
            ],
          },
        ],
      });
    });

    it('should parse inline annotations', () => {
      const ast = parse('Value: [+12%]{{ type: delta }}');

      expect(ast).toMatchObject({
        children: [
          {
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'Value: ',
              }),
              expect.objectContaining({
                type: 'meta',
                caption: [
                  expect.objectContaining({
                    type: 'text',
                    text: '+12%',
                  }),
                ],
                annotations: { type: 'delta' },
              }),
            ],
          },
        ],
      });
    });
  });

  describe('options', () => {
    it('should apply default type', () => {
      const ast = parse('# Title', { type: 'notion' });

      expect(ast.type).toBe('notion');
    });

    it('should call onContent middleware', () => {
      const contents: string[] = [];

      parse('# Title\n\nParagraph', {
        onContent: (content, { parseContent }) => {
          contents.push(content);

          return parseContent(content);
        },
      });

      expect(contents).toEqual(['# Title', 'Paragraph']);
    });

    it('should allow onContent to filter blocks', () => {
      const ast = parse('# Title\n\nParagraph', {
        onContent: (content, { parseContent }) => {
          if (content.startsWith('#')) {
            return null;
          }

          return parseContent(content);
        },
      });

      expect(ast.children).toMatchObject([{ type: 'paragraph' }]);
    });

    it('should allow onContent to transform blocks', () => {
      const ast = parse('{{ type: callout }}\nImportant', {
        onContent: (content, { type, parseContent }) => {
          if (type === 'callout') {
            const parsed = parseContent(content);

            return {
              type: 'callout',
              range: parsed.range,
            };
          }

          return parseContent(content);
        },
      });

      expect(ast).toMatchObject({
        children: [{ type: 'callout' }],
      });
    });
  });

  describe('indentation / nesting', () => {
    it.each([1, 3, 5])(
      'should reject %i leading spaces as odd indentation',
      (spaces) => {
        expect(() => parse(`${' '.repeat(spaces)}Content`)).toThrow(
          expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
        );
      },
    );

    it('should reject a leading indentation tab', () => {
      expect(() => parse('\tContent')).toThrow(
        expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
      );
    });

    it('should reject a non-leading tab outside fenced code', () => {
      expect(() => parse('Content\tcontinued')).toThrow(
        expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
      );
    });

    it('should parse indented content', () => {
      const mdc = '- Parent\n  - Child';

      const ast = parse(mdc);

      // nesting is based on indentation
      expect(ast.children.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple indentation levels', () => {
      const mdc = ['- Level 1', '  - Level 2', '    - Level 3'].join('\n');

      const ast = parse(mdc);

      expect(ast.children.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject an annotation separated from an indented table', () => {
      const mdc = [
        '{{ ref: my-table }}',
        '',
        '  | Col A | Col B |',
        '  |-------|-------|',
        '  | 1 | 2 |',
      ].join('\n');

      expect(() => parse(mdc)).toThrow(
        expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
      );
    });

    it('should reject an annotation separated from an indented layout', () => {
      const mdc = [
        '{{ ref: my-layout, columns: 2 }}',
        '',
        '  | Left | Right |',
        '  | A | B |',
      ].join('\n');

      expect(() => parse(mdc)).toThrow(
        expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
      );
    });

    it('should reject a blank separator between annotation and target', () => {
      expect(() => parse('{{ ref: block }}\n\nContent')).toThrow(
        expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
      );
    });

    it('should reject annotation and target indentation disagreement', () => {
      expect(() => parse('{{ ref: block }}\n  Content')).toThrow(
        expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
      );
    });

    it('should reject skipped indentation levels', () => {
      expect(() => parse('- Parent\n    - Skipped')).toThrow(
        expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
      );
    });

    it('should allow dedentation to any valid ancestor', () => {
      const ast = parse('- A\n  - B\n    - C\n- D');

      expect(ast.children).toHaveLength(2);
      expect(ast.children[0]?.children?.[0]?.children).toHaveLength(1);
    });
  });
});
