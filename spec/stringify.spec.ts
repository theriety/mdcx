import { describe, expect, it } from 'vitest';

import { parse } from '#parse';
import { stringify } from '#stringify';

import { createParagraph } from './fixtures/ast';
import { DEFAULT_RANGE } from './fixtures/ranges';

import type { DocumentNode } from '#types';

// TEST SUITES //

describe('fn:stringify', () => {
  describe('round-trip', () => {
    it('should round-trip simple document', () => {
      const mdc = ['# Title', '', 'Paragraph text.'].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output.trim()).toBe(mdc);
    });

    it('should preserve directive', () => {
      const mdc = ['---', 'type: doc', '---', '', '# Title'].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual(
        ['---', 'type: doc', '---', '', '# Title'].join('\n'),
      );
    });

    it('should preserve block annotations', () => {
      const mdc = '{{ ref: intro }}\n# Introduction';

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual('{{ ref: intro }}\n# Introduction');
    });
  });

  describe('real-world documents', () => {
    it('should stringify a longer mixed document', () => {
      const mdc = [
        '---',
        'type: doc',
        'owner: platform',
        '---',
        '',
        '{{ ref: intro }}',
        '# Overview',
        '',
        'Welcome to [docs](https://example.com/docs){{ ref: link1 }} and [+10%]{{ type: delta }} gains.',
        '',
        '---',
        '',
        '{{ ref: snippet }}',
        '```ts',
        'const x = 1;',
        '```',
        '',
        '> **Note** check the inline [guide](https://example.com/guide){{ ref: guide }}.',
        '',
        '- Item 1',
        '  - Subitem [hot]{{ tag: urgent }}',
        '',
        '| Name | Score |',
        '| ---- | ----- |',
        '| Alpha | 10 |',
        '| Beta | 20 |',
      ].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual(
        [
          '---',
          'type: doc',
          'owner: platform',
          '---',
          '',
          '{{ ref: intro }}',
          '# Overview',
          '',
          'Welcome to [docs](https://example.com/docs){{ ref: link1 }} and [+10%]{{ type: delta }} gains.',
          '',
          '---',
          '',
          '{{ ref: snippet }}',
          '```ts',
          'const x = 1;',
          '```',
          '',
          '> **Note** check the inline [guide](https://example.com/guide){{ ref: guide }}.',
          '',
          '- Item 1',
          '  - Subitem [hot]{{ tag: urgent }}',
          '',
          '| Name  | Score |',
          '| ----- | ----- |',
          '| Alpha | 10    |',
          '| Beta  | 20    |',
        ].join('\n'),
      );
    });
  });

  describe('omitAnnotations', () => {
    it('should produce pure Markdown when omitAnnotations is true', () => {
      const mdc = [
        '---',
        'type: doc',
        '---',
        '',
        '{{ ref: intro }}',
        '# Title',
        '',
        '[note]{{ color: red }}',
      ].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast, { omitAnnotations: true });

      expect(output).toEqual(
        ['---', 'type: doc', '---', '', '# Title', '', 'note'].join('\n'),
      );
    });

    it('should strip inline annotations', () => {
      const mdc = 'Value is [+12%]{{ type: delta }}.';

      const ast = parse(mdc);
      const output = stringify(ast, { omitAnnotations: true });

      expect(output).toEqual('Value is +12%.');
    });
  });

  describe('empty annotations', () => {
    it('should not output annotation when stringifyAnnotations returns empty', () => {
      // manually construct AST with empty annotations object
      const ast: DocumentNode = {
        type: 'document',
        children: [
          {
            type: 'paragraph',
            annotations: {},
            content: [
              {
                type: 'text',
                text: 'Content',
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 8, offset: 7 },
                },
              },
            ],
            children: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 8, offset: 7 },
            },
          },
        ],
      };

      const output = stringify(ast);

      expect(output).toEqual('Content');
    });
  });

  it('should ignore an undefined entry in a sparse document child list', () => {
    const children: DocumentNode['children'] = [];
    children[1] = createParagraph('Content', { range: DEFAULT_RANGE });
    const ast: DocumentNode = { type: 'document', children };
    const output = stringify(ast);

    expect(output).toBe('Content');
  });

  describe('format callback', () => {
    it('should apply custom formatting', () => {
      const mdc = '# Title';

      const ast = parse(mdc);
      const output = stringify(ast, {
        format: (node, stringifyBlock) => {
          if (node.type === 'heading') {
            return `<!-- heading -->\n${stringifyBlock(node)}`;
          }

          return stringifyBlock(node);
        },
      });

      expect(output).toEqual('<!-- heading -->\n# Title');
    });

    it('should allow complete block replacement', () => {
      const mdc = '{{ type: callout }}\nImportant';

      const ast = parse(mdc);
      const output = stringify(ast, {
        format: (node) => {
          if (node.type === 'callout') {
            return '> **Note:** Important';
          }

          return '';
        },
      });

      expect(output).toBe('{{ type: callout }}\n> **Note:** Important');
    });
  });

  describe('block types', () => {
    it('should stringify headings with correct depth', () => {
      const ast = parse(['# H1', '## H2', '### H3'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(['# H1', '', '## H2', '', '### H3'].join('\n'));
    });

    describe('todo list items', () => {
      it('should stringify todo list items', () => {
        const ast = parse('- [ ] Unchecked\n- [x] Checked');
        const output = stringify(ast);

        expect(output).toBe('- [ ] Unchecked\n- [x] Checked');
      });
    });

    describe('typed code fences', () => {
      it('should preserve a typed code fence', () => {
        const source = ['```typescript', 'const x = 1;', '```'].join('\n');
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    describe('untyped code fences', () => {
      it('should preserve a code fence without a language', () => {
        const source = ['```', 'plain code', '```'].join('\n');
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    describe('unordered lists', () => {
      it('should preserve an unordered list', () => {
        const ast = parse('- Item 1\n- Item 2');
        const output = stringify(ast);

        expect(output).toBe('- Item 1\n- Item 2');
      });
    });

    describe('ordered lists', () => {
      it('should normalize ordered list markers', () => {
        const ast = parse('1. First\n2. Second');
        const output = stringify(ast);

        expect(output).toBe('1. First\n1. Second');
      });
    });

    describe('formatted list items', () => {
      it('should preserve formatted list items', () => {
        const ast = parse('- **Bold item**\n- *Italic item*');
        const output = stringify(ast);

        expect(output).toBe('- **Bold item**\n- *Italic item*');
      });
    });

    describe('quote blocks', () => {
      it('should preserve a quote block', () => {
        const ast = parse('> Quote text');
        const output = stringify(ast);

        expect(output).toBe('> Quote text');
      });

      it('should preserve a formatted quote block', () => {
        const ast = parse('> **Important** quote');
        const output = stringify(ast);

        expect(output).toBe('> **Important** quote');
      });
    });

    describe('empty code blocks', () => {
      it('should preserve an empty code block', () => {
        const source = ['```', '', '```'].join('\n');
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    describe('empty list items', () => {
      it('should preserve an empty list item', () => {
        const ast = parse('- ');
        const output = stringify(ast);

        expect(output).toBe('- ');
      });
    });

    describe('empty quote blocks', () => {
      it('should preserve an empty quote block', () => {
        const ast = parse('> ');
        const output = stringify(ast);

        expect(output).toEqual('> ');
      });
    });

    describe('empty paragraph content', () => {
      it('should stringify empty paragraph content as a typed declaration', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'paragraph',
              content: [],
              range: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 1, offset: 0 },
              },
            },
          ],
        };
        const output = stringify(ast);

        expect(output).toEqual('{{ type: paragraph }}');
      });
    });

    describe('empty list block content', () => {
      it('should preserve an empty bullet block', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'bullet',
              content: [],
              range: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 2, offset: 1 },
              },
            },
          ],
        };
        const output = stringify(ast);

        expect(output).toEqual('- ');
      });
    });

    describe('empty quote block content', () => {
      it('should preserve an empty quote block node', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'quote',
              content: [],
              range: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 2, offset: 1 },
              },
            },
          ],
        };
        const output = stringify(ast);

        expect(output).toEqual('> ');
      });
    });

    it('should stringify divider within document', () => {
      // note: '---' at document start is front matter delimiter, not divider
      const ast = parse(['# Title', '', '---', '', 'Paragraph'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(
        ['# Title', '', '---', '', 'Paragraph'].join('\n'),
      );
    });

    it('should round-trip divider with extended hyphens', () => {
      const mdc = ['# Title', '', '-----'].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast);

      // dividers normalize to three hyphens
      expect(output).toEqual(['# Title', '', '---'].join('\n'));
    });

    it('should stringify equation', () => {
      const ast = parse('$$ E = mc^2 $$');

      const output = stringify(ast);

      expect(output).toEqual('$$ E = mc^2 $$');
    });

    it('should stringify equation with LaTeX content', () => {
      const ast = parse('$$ x = \\frac{-b}{2a} $$');

      const output = stringify(ast);

      expect(output).toEqual('$$ x = \\frac{-b}{2a} $$');
    });

    it('should round-trip equation with annotations', () => {
      const mdc = '{{ ref: einstein }}\n$$ E = mc^2 $$';

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual(mdc);
    });

    it('should round-trip divider with annotations', () => {
      const mdc = '{{ ref: section-break }}\n---';

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual(mdc);
    });
  });

  describe('inline formatting', () => {
    describe('bold and italic formatting', () => {
      it('should preserve bold and italic formatting', () => {
        const source = '**bold** and *italic*';
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    describe('links and images', () => {
      it('should preserve links', () => {
        const source = '[text](https://example.com)';
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });

      it('should preserve images', () => {
        const source = '![alt](https://example.com/image.png)';
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    describe('other inline formatting', () => {
      it('should preserve strikethrough formatting', () => {
        const source = '~~strikethrough~~';
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });

      it('should preserve inline code formatting', () => {
        const source = '`code`';
        const ast = parse(source);
        const output = stringify(ast);

        expect(output).toBe(source);
      });
    });

    it('should pass through unknown format types unchanged', () => {
      // manually create an AST with an unknown format type
      const ast = parse('text');
      const paragraph = ast.children[0] as {
        content?: Array<{ formats?: string[] }>;
      };

      if (paragraph.content?.[0]) {
        paragraph.content[0].formats = ['unknown_format'];
      }

      const output = stringify(ast);

      expect(output).toEqual('text');
    });
  });

  describe('nested blocks', () => {
    it('should stringify indented child blocks', () => {
      // create an AST with nested structure
      const ast = parse('- Parent\n  - Child');

      const output = stringify(ast);

      expect(output).toEqual('- Parent\n  - Child');
    });
  });

  describe('link annotations', () => {
    it('should preserve link with annotations', () => {
      const ast = parse(
        '[link](https://example.com){{ ref: link1, type: link, foo: boo }}',
      );

      const output = stringify(ast);

      expect(output).toEqual(
        '[link](https://example.com){{ type: link, ref: link1, foo: boo }}',
      );
    });

    it('should preserve non-link inline annotations', () => {
      const ast = parse('Value is [+12%]{{ type: delta }}.');

      const output = stringify(ast);

      expect(output).toEqual('Value is [+12%]{{ type: delta }}.');
    });

    it('should stringify link with multiple annotations', () => {
      const ast = parse(
        '[docs](https://example.com/docs){{ ref: doc-link, verified: true }}',
      );

      const output = stringify(ast);

      expect(output).toEqual(
        '[docs](https://example.com/docs){{ ref: doc-link, verified: true }}',
      );
    });

    it('should handle link node with empty link', () => {
      // manually construct AST with link node having empty link string
      const ast: DocumentNode = {
        type: 'document',
        children: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'link',
                caption: [{ type: 'text', text: 'broken link' }],
                link: '',
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 12, offset: 11 },
                },
              },
            ],
            children: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 12, offset: 11 },
            },
          },
        ],
      };

      const output = stringify(ast);

      expect(output).toEqual('[broken link]()');
    });
  });

  describe('table content', () => {
    it('should stringify table with header and data rows', () => {
      const ast = parse(['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(
        ['| A   | B   |', '| --- | --- |', '| 1   | 2   |'].join('\n'),
      );
    });

    it('should stringify table with separator row', () => {
      const ast = parse(
        ['| Col1 | Col2 |', '|------|------|', '| Val1 | Val2 |'].join('\n'),
      );

      const output = stringify(ast);

      expect(output).toEqual(
        ['| Col1 | Col2 |', '| ---- | ---- |', '| Val1 | Val2 |'].join('\n'),
      );
    });

    it('should stringify table with multiple data rows', () => {
      const ast = parse(
        [
          '| Name | Age |',
          '|------|-----|',
          '| Alice | 30 |',
          '| Bob | 25 |',
        ].join('\n'),
      );

      const output = stringify(ast);

      expect(output).toEqual(
        [
          '| Name  | Age |',
          '| ----- | --- |',
          '| Alice | 30  |',
          '| Bob   | 25  |',
        ].join('\n'),
      );
    });

    it('should stringify table with left alignment', () => {
      const ast = parse(['| Left |', '|:-----|', '| A |'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(['| Left |', '| :--- |', '| A    |'].join('\n'));
    });

    it('should stringify table with right alignment', () => {
      const ast = parse(['| Right |', '|------:|', '| A |'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(
        ['| Right |', '| ----: |', '|     A |'].join('\n'),
      );
    });

    it('should stringify table with center alignment', () => {
      const ast = parse(['| Center |', '|:------:|', '| A |'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(
        ['| Center |', '| :----: |', '|   A    |'].join('\n'),
      );
    });

    it('should stringify table with mixed alignments', () => {
      const ast = parse(
        [
          '| Left | Center | Right |',
          '|:-----|:------:|------:|',
          '| A | B | C |',
        ].join('\n'),
      );

      const output = stringify(ast);

      expect(output).toEqual(
        [
          '| Left | Center | Right |',
          '| :--- | :----: | ----: |',
          '| A    |   B    |     C |',
        ].join('\n'),
      );
    });

    it('should round-trip table with alignments', () => {
      const mdc = [
        '| Left | Center | Right |',
        '| :--- | :----: | ----: |',
        '| A    |   B    |     C |',
      ].join('\n');

      const ast = parse(mdc);
      const output = stringify(ast);

      expect(output).toEqual(mdc);
    });
  });

  describe('column content', () => {
    it('should stringify column without separator', () => {
      const ast = parse(['| A | B |', '| 1 | 2 |'].join('\n'));

      const output = stringify(ast);

      expect(output).toEqual(
        ['{{ type: layout }}', '| A | B |', '| 1 | 2 |'].join('\n'),
      );
    });

    it('should stringify column with inline formatting', () => {
      const ast = parse('| **Bold** | *Italic* |');

      const output = stringify(ast);

      expect(output).toEqual(
        ['{{ type: layout }}', '| **Bold** | *Italic* |'].join('\n'),
      );
    });

    it('should stringify column with multiple rows', () => {
      const ast = parse(
        ['| Row1 | Data1 |', '| Row2 | Data2 |', '| Row3 | Data3 |'].join('\n'),
      );

      const output = stringify(ast);

      expect(output).toEqual(
        [
          '{{ type: layout }}',
          '| Row1 | Data1 |',
          '| Row2 | Data2 |',
          '| Row3 | Data3 |',
        ].join('\n'),
      );
    });

    it('should handle column with omitAnnotations', () => {
      const ast = parse('{{ ref: cols }}\n| A | B |');

      const output = stringify(ast, { omitAnnotations: true });

      expect(output).toEqual('| A | B |');
    });

    it('should preserve column annotations when not omitted', () => {
      const ast = parse('{{ ref: "cols" }}\n| A | B |');

      const output = stringify(ast);

      // intrinsic layout children do not trigger an automatic closing marker
      expect(output).toEqual('{{ type: layout, ref: cols }}\n| A | B |');
    });
  });

  describe('custom blocks', () => {
    it('should throw error for custom block type without format callback', () => {
      // create an AST with a true custom block type via onContent middleware
      const ast = parse('{{ type: callout }}\nImportant', {
        onContent: (content, { type, parseContent }) => {
          if (type === 'callout') {
            return {
              ...parseContent(content),
              type: 'callout',
            };
          }

          return parseContent(content);
        },
      });

      expect(() => stringify(ast)).toThrow(
        'custom block type "callout" requires a format callback',
      );
    });

    it('should handle custom block type with format callback', () => {
      // create an AST with a true custom block type via onContent middleware
      const ast = parse('{{ type: callout }}\nImportant', {
        onContent: (content, { type, parseContent }) => {
          if (type === 'callout') {
            return {
              ...parseContent(content),
              type: 'callout',
            };
          }

          return parseContent(content);
        },
      });

      const output = stringify(ast, {
        format: (node, stringifyBlock) => {
          if (node.type === 'callout') {
            // transform to quote, stripping annotations
            return `> ${stringifyBlock({
              ...node,
              type: 'paragraph',
              annotations: undefined,
            })}`;
          }

          return stringifyBlock(node);
        },
      });

      expect(output).toEqual('{{ type: callout }}\n> Important');
    });

    it('should throw an error if a custom block is found but no custom formatter is supplied to support it', () => {
      // manually construct AST with custom block type without content
      const ast: DocumentNode = {
        type: 'document',
        children: [
          {
            type: 'custom_block',
            children: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 },
            },
          },
        ],
      };

      expect(() =>
        stringify(ast, {
          // the original parser doesn't support custom block
          format: (node, stringifyBlock) => stringifyBlock(node),
        }),
      ).toThrow('custom block type "custom_block" requires a format callback');
    });

    it('should stringify custom block type content when format callback processes it', () => {
      // create an AST with a true custom block type via onContent middleware
      const ast = parse('{{ type: callout }}\nImportant', {
        onContent: (content, { type, parseContent }) => {
          if (type === 'callout') {
            return {
              ...parseContent(content),
              type: 'callout',
            };
          }

          return parseContent(content);
        },
      });

      const output = stringify(ast, {
        format: (node, stringifyBlock) => {
          if (node.type === 'callout') {
            // force treat it as a paragraph so that it will return its text content
            return stringifyBlock({ ...node, type: 'paragraph' });
          }

          // process the custom type directly without transforming to native type
          return stringifyBlock(node);
        },
      });

      expect(output).toEqual('{{ type: callout }}\nImportant');
    });
  });

  describe('layout content', () => {
    describe('inline format (narrow columns)', () => {
      it('should stringify layout with column annotations in first row', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              ref: 'layout1',
              annotations: {},
              children: [
                {
                  type: 'column',
                  ref: 'col1',
                  annotations: { name: 'foo' },
                  children: [createParagraph('Column A')],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  ref: 'col2',
                  annotations: { name: 'boo' },
                  children: [createParagraph('Column B')],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast);

        expect(output).toEqual(
          [
            '{{ type: layout, ref: layout1 }}',
            '| {{ ref: col1, name: foo }} | {{ ref: col2, name: boo }} |',
            '| Column A                   | Column B                   |',
          ].join('\n'),
        );
      });

      it('should stringify layout with multiple rows', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              children: [
                {
                  type: 'column',
                  children: [createParagraph('A1'), createParagraph('A2')],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  children: [createParagraph('B1'), createParagraph('B2')],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast);

        expect(output).toContain('| A1 | B1 |');
        expect(output).toContain('| A2 | B2 |');
      });

      it('should handle empty columns in inline format', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              children: [
                {
                  type: 'column',
                  children: [createParagraph('A1')],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  children: [],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast);

        expect(output).toContain('| A1 |  |');
      });
    });

    describe('nested format (wide columns)', () => {
      it('should use nested format when content exceeds width', () => {
        // for 2 columns: maxWidth = floor(80 / (2 + 0.5)) = 32 characters
        const longText = 'A'.repeat(50);
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              children: [
                {
                  type: 'column',
                  children: [createParagraph(longText)],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  children: [createParagraph('Short')],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast);

        // should use nested format: column annotations at root, content indented
        expect(output).toEqual(
          [
            '{{ type: layout }}',
            '  {{ type: column }}',
            `    ${longText}`,
            '',
            '  {{ type: column }}',
            '    Short',
          ].join('\n'),
        );
      });

      it('should add blank lines between columns in nested format', () => {
        const longText = 'A'.repeat(50);
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              children: [
                {
                  type: 'column',
                  children: [createParagraph(longText)],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  children: [createParagraph('Content')],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast);
        const lines = output.split('\n');

        // should have a blank line between columns
        const blankLineIndex = lines.findIndex(
          (line, i) => line === '' && i > 0 && lines[i - 1]?.includes(longText),
        );

        expect(blankLineIndex).toBeGreaterThan(-1);
      });
    });

    describe('omitAnnotations', () => {
      it('should omit layout and column annotations when flag is set', () => {
        const ast: DocumentNode = {
          type: 'document',
          children: [
            {
              type: 'layout',
              annotations: { ref: 'layout1' },
              children: [
                {
                  type: 'column',
                  annotations: { ref: 'col1' },
                  children: [createParagraph('Column A')],
                  range: DEFAULT_RANGE,
                },
                {
                  type: 'column',
                  annotations: { ref: 'col2' },
                  children: [createParagraph('Column B')],
                  range: DEFAULT_RANGE,
                },
              ],
              range: DEFAULT_RANGE,
            },
          ],
        };

        const output = stringify(ast, { omitAnnotations: true });

        expect(output).not.toContain('{{');
        expect(output).not.toContain('}}');
        expect(output).toContain('| Column A | Column B |');
      });
    });
  });

  describe('closing marker policies', () => {
    describe('paragraph leaves', () => {
      it('should omit an automatic marker for a referenced paragraph leaf', () => {
        const body = 'Content';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast);
        const automaticOutput = stringify(ast, { closingMarkers: 'auto' });

        expect(output).toBe(source);
        expect(automaticOutput).toBe(source);
      });

      it('should mark a referenced paragraph leaf under all policy', () => {
        const body = 'Content';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast, { closingMarkers: 'all' });

        expect(output).toBe(`${source}\n--{ ref: leaf }--`);
      });
    });

    describe('heading leaves', () => {
      it('should omit an automatic marker for a referenced heading leaf', () => {
        const body = '# Heading';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast);
        const automaticOutput = stringify(ast, { closingMarkers: 'auto' });

        expect(output).toBe(source);
        expect(automaticOutput).toBe(source);
      });

      it('should mark a referenced heading leaf under all policy', () => {
        const body = '# Heading';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast, { closingMarkers: 'all' });

        expect(output).toBe(`${source}\n--{ ref: leaf }--`);
      });
    });

    describe('code leaves', () => {
      it('should omit an automatic marker for a referenced code leaf', () => {
        const body = ['```ts', 'const value = 1;', '```'].join('\n');
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast);
        const automaticOutput = stringify(ast, { closingMarkers: 'auto' });

        expect(output).toBe(source);
        expect(automaticOutput).toBe(source);
      });

      it('should mark a referenced code leaf under all policy', () => {
        const body = ['```ts', 'const value = 1;', '```'].join('\n');
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast, { closingMarkers: 'all' });

        expect(output).toBe(`${source}\n--{ ref: leaf }--`);
      });
    });

    describe('equation leaves', () => {
      it('should omit an automatic marker for a referenced equation leaf', () => {
        const body = '$$ x^2 $$';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast);
        const automaticOutput = stringify(ast, { closingMarkers: 'auto' });

        expect(output).toBe(source);
        expect(automaticOutput).toBe(source);
      });

      it('should mark a referenced equation leaf under all policy', () => {
        const body = '$$ x^2 $$';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast, { closingMarkers: 'all' });

        expect(output).toBe(`${source}\n--{ ref: leaf }--`);
      });
    });

    describe('divider leaves', () => {
      it('should omit an automatic marker for a referenced divider leaf', () => {
        const body = '---';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast);
        const automaticOutput = stringify(ast, { closingMarkers: 'auto' });

        expect(output).toBe(source);
        expect(automaticOutput).toBe(source);
      });

      it('should mark a referenced divider leaf under all policy', () => {
        const body = '---';
        const source = `{{ ref: leaf }}\n${body}`;
        const ast = parse(source);
        const output = stringify(ast, { closingMarkers: 'all' });

        expect(output).toBe(`${source}\n--{ ref: leaf }--`);
      });
    });

    it('should emit an automatic marker for paragraph children', () => {
      const ast = parse(
        [
          '{{ ref: parent }}',
          'Parent',
          '  {{ ref: child }}',
          '  Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
      const output = stringify(ast);

      expect(output).toBe(
        [
          '{{ ref: parent }}',
          'Parent',
          '  {{ ref: child }}',
          '  Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
    });

    it('should emit only the parent marker for generic nested blocks by default', () => {
      const ast = parse(
        [
          '{{ ref: parent }}',
          '- Parent',
          '  {{ ref: child }}',
          '  - Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
      const output = stringify(ast);

      expect(output).toBe(
        [
          '{{ ref: parent }}',
          '- Parent',
          '  {{ ref: child }}',
          '  - Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
    });

    it('should emit every external referenced block under all policy', () => {
      const ast = parse(
        [
          '{{ ref: parent }}',
          '- Parent',
          '  {{ ref: child }}',
          '  - Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
      const output = stringify(ast, { closingMarkers: 'all' });

      expect(output).toBe(
        [
          '{{ ref: parent }}',
          '- Parent',
          '  {{ ref: child }}',
          '  - Child',
          '  --{ ref: child }--',
          '--{ ref: parent }--',
        ].join('\n'),
      );
    });

    it('should omit every marker under none policy', () => {
      const ast = parse(
        [
          '{{ ref: parent }}',
          'Parent',
          '  {{ ref: child }}',
          '  Child',
          '--{ ref: parent }--',
        ].join('\n'),
      );
      const output = stringify(ast, { closingMarkers: 'none' });

      expect(output).toBe(
        ['{{ ref: parent }}', 'Parent', '  {{ ref: child }}', '  Child'].join(
          '\n',
        ),
      );
    });

    it('should exclude intrinsic table children from auto markers', () => {
      const source = [
        '{{ ref: scores }}',
        '| Name | Score |',
        '| ---- | ----- |',
        '| Alice | 95 |',
      ].join('\n');
      const ast = parse(source);
      const automatic = stringify(ast);
      const allMarkers = stringify(ast, { closingMarkers: 'all' });

      expect(automatic).not.toContain('--{');
      expect(allMarkers).toBe(`${automatic}\n--{ ref: scores }--`);
    });

    it('should exclude intrinsic layout children from auto markers', () => {
      const source = ['{{ ref: columns }}', '| A | B |'].join('\n');
      const ast = parse(source);
      const automatic = stringify(ast);
      const allMarkers = stringify(ast, { closingMarkers: 'all' });

      expect(automatic).not.toContain('--{');
      expect(allMarkers).toBe(`${automatic}\n--{ ref: columns }--`);
    });

    it('should suppress markers when omitAnnotations is set', () => {
      const ast = parse(
        ['{{ ref: parent }}', 'Parent', '  Child', '--{ ref: parent }--'].join(
          '\n',
        ),
      );
      const output = stringify(ast, {
        omitAnnotations: true,
        closingMarkers: 'all',
      });

      expect(output).not.toContain('--{');
    });

    it('should suppress markers when omitBlockAnnotations is set', () => {
      const ast = parse(
        ['{{ ref: parent }}', 'Parent', '  Child', '--{ ref: parent }--'].join(
          '\n',
        ),
      );
      const output = stringify(ast, {
        omitBlockAnnotations: true,
        closingMarkers: 'all',
      });

      expect(output).not.toContain('--{');
    });
  });

  describe('typed empty blocks', () => {
    it('should use an annotation-only declaration under auto policy', () => {
      const ast = parse('{{ type: paragraph, ref: empty-paragraph }}');
      const output = stringify(ast, { closingMarkers: 'auto' });

      expect(output).toBe('{{ type: paragraph, ref: empty-paragraph }}');
    });

    it('should use an annotation-only declaration under none policy', () => {
      const ast = parse('{{ type: paragraph, ref: empty-paragraph }}');
      const output = stringify(ast, { closingMarkers: 'none' });

      expect(output).toBe('{{ type: paragraph, ref: empty-paragraph }}');
    });

    it('should append a redundant marker under all policy', () => {
      const ast = parse('{{ type: paragraph, ref: empty-paragraph }}');
      const output = stringify(ast, { closingMarkers: 'all' });

      expect(output).toBe(
        [
          '{{ type: paragraph, ref: empty-paragraph }}',
          '--{ ref: empty-paragraph }--',
        ].join('\n'),
      );
    });

    it('should separate an empty declaration from a following sibling', () => {
      const ast = parse(
        [
          '{{ type: paragraph, ref: empty-paragraph }}',
          '',
          'Following sibling',
        ].join('\n'),
      );
      const output = stringify(ast);

      expect(output).toBe(
        [
          '{{ type: paragraph, ref: empty-paragraph }}',
          '',
          'Following sibling',
        ].join('\n'),
      );
    });
  });
});
