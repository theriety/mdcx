import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';
import { buildAst } from '#parser/build';
import { buildLayoutNode, normalizeIndentation } from '#parser/layout';
import { isColumnAnnotationRow } from '#parser/table';

import { getRange } from '../fixtures/positions';

import type { BlockParser } from '#parser/layout';
import type { BlockNode } from '#types';

// TEST SUITES //

describe('fn:isColumnAnnotationRow', () => {
  it('should return true for row with only annotations', () => {
    const result = isColumnAnnotationRow(
      '| {{ ref: col1 }} | {{ ref: col2 }} |',
    );

    expect(result).toBe(true);
  });

  it('should return true for row with empty cells and annotations', () => {
    const result = isColumnAnnotationRow('| {{ ref: col1 }} |  |');

    expect(result).toBe(true);
  });

  it('should return true for row with all empty cells', () => {
    const result = isColumnAnnotationRow('|  |  |');

    expect(result).toBe(true);
  });

  it('should return false for non-annotation content', () => {
    const tableContent = isColumnAnnotationRow('| A | B |');
    const plainText = isColumnAnnotationRow('Plain text');
    const mixedAnnotationContent = isColumnAnnotationRow(
      '| {{ ref: col1 }} | Content |',
    );

    expect({ tableContent, plainText, mixedAnnotationContent }).toEqual({
      tableContent: false,
      plainText: false,
      mixedAnnotationContent: false,
    });
  });
});

describe('fn:buildLayoutNode', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 10, offset: 9 },
  };

  it('should build layout from content rows', () => {
    const content = ['| A | B |', '| C | D |'].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result.type).toBe('layout');
    expect(result.children).toHaveLength(2);
  });

  it('should create columns with paragraph children', () => {
    const content = '| Content A | Content B |';

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result).toMatchObject({
      children: [
        { type: 'column', children: [{ type: 'paragraph' }] },
        { type: 'column', children: [{ type: 'paragraph' }] },
      ],
    });
  });

  it('should extract column annotations from first row', () => {
    const content = ['| {{ ref: col1 }} | {{ ref: col2 }} |', '| A | B |'].join(
      '\n',
    );

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result).toMatchObject({
      children: [{ ref: 'col1' }, { ref: 'col2' }],
    });
  });

  it('should handle empty content', () => {
    const result = buildLayoutNode({
      content: '',
      context: { range: defaultRange },
    });

    expect(result.type).toBe('layout');
    expect(result.children).toHaveLength(0);
  });

  it('should skip separator lines in content', () => {
    const content = ['| A | B |', '|---|---|', '| C | D |'].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    // 2 columns, each with 2 paragraph children (A/C and B/D)
    expect(result).toMatchObject({
      children: [
        { children: [expect.anything(), expect.anything()] },
        { children: [expect.anything(), expect.anything()] },
      ],
    });
  });

  it('should handle column ratio annotation', () => {
    const content = [
      '| {{ ratio: 2 }} | {{ ratio: 1 }} |',
      '| Wide | Narrow |',
    ].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result).toMatchObject({
      children: [{ ratio: 2 }, { ratio: 1 }],
    });
  });

  it('should preserve a numeric width_ratio annotation', () => {
    const content = [
      '| {{ width_ratio: 3 }} | {{ width_ratio: 1 }} |',
      '| Wide | Narrow |',
    ].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result.children).toMatchObject([
      { annotations: { width_ratio: 3 } },
      { annotations: { width_ratio: 1 } },
    ]);
  });

  it('should reject trailing content after a column annotation', () => {
    expect(() =>
      buildLayoutNode({
        content: '| {{ ref: column }} trailing }} |',
        context: { range: defaultRange },
      }),
    ).toThrow(/exactly one complete annotation/);
  });

  it('should preserve an explicit #-prefixed dotted column ref verbatim', () => {
    // virtual refs minted by notion-sync (#<column_list_id>.<n>) must survive
    // the column annotation parse unchanged - never stripped or regenerated
    const ref = '#4fc370fe-e485-400b-88d8-7f0d224648d7.2';
    const content = [
      `| {{ ref: "${ref}", ratio: 1 }} | {{ ref: col2 }} |`,
      '| A | B |',
    ].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result).toMatchObject({
      children: [
        { type: 'column', ref, ratio: 1 },
        { type: 'column', ref: 'col2' },
      ],
    });
  });

  it('should handle empty cells', () => {
    const content = ['| A |  |', '|  | B |'].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    // Column 0 has 1 paragraph (A), Column 1 has 1 paragraph (B)
    expect(result).toMatchObject({
      children: [
        { children: [expect.anything()] },
        { children: [expect.anything()] },
      ],
    });
  });

  it('should parse inline content in cells', () => {
    const content = '| **Bold** | *Italic* |';

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result).toMatchObject({
      children: [
        {
          children: [
            {
              content: expect.arrayContaining([
                expect.objectContaining({
                  formats: expect.arrayContaining(['bold']),
                }),
              ]),
            },
          ],
        },
        expect.anything(),
      ],
    });
  });

  it('should preserve position from context', () => {
    const content = ['| A | B |', '| C | D |'].join('\n');

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result.range).toEqual(defaultRange);
  });

  describe('with blockParser', () => {
    // real block parser using actual tokenize/buildAst pipeline
    const blockParser: BlockParser = (content) =>
      buildAst(tokenize(content)).children;

    it('should parse bullet lists in columns with blockParser', () => {
      const content = ['| - item A | - item B |', '| - item C | |'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      expect(result).toMatchObject({
        type: 'layout',
        children: [
          {
            type: 'column',
            children: [
              { type: 'bullet', content: [{ text: 'item A' }] },
              { type: 'bullet', content: [{ text: 'item C' }] },
            ],
          },
          {
            type: 'column',
            children: [{ type: 'bullet', content: [{ text: 'item B' }] }],
          },
        ],
      });
    });

    it('should parse headings in columns with blockParser', () => {
      const content = '| # Heading | Content |';

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      expect(result).toMatchObject({
        children: [
          { children: [{ type: 'heading', content: [{ text: 'Heading' }] }] },
          { children: [{ type: 'paragraph', content: [{ text: 'Content' }] }] },
        ],
      });
    });

    it('should aggregate multiple rows into column content', () => {
      const content = [
        '| Line 1 | A |',
        '| Line 2 | B |',
        '| Line 3 | C |',
      ].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      // first column should have 3 paragraphs (Line 1, Line 2, Line 3)
      expect(result.children[0]?.children).toHaveLength(3);
      // second column should have 3 paragraphs (A, B, C)
      expect(result.children[1]?.children).toHaveLength(3);
    });

    it('should skip separator lines when aggregating', () => {
      const content = ['| A | B |', '|---|---|', '| C | D |'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      // should have 2 items per column (A/C and B/D), skipping separator
      expect(result.children[0]?.children).toHaveLength(2);
      expect(result.children[1]?.children).toHaveLength(2);
    });

    it('should handle empty columns gracefully', () => {
      const content = ['| Content | |', '| More | |'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      expect(result.children[0]?.children).toHaveLength(2);
      expect(result.children[1]?.children).toHaveLength(0);
    });

    it('should preserve column annotations with blockParser', () => {
      const content = [
        '| {{ ref: col1, ratio: 2 }} | {{ ref: col2 }} |',
        '| - item | text |',
      ].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      expect(result).toMatchObject({
        children: [
          {
            ref: 'col1',
            ratio: 2,
            children: [{ type: 'bullet' }],
          },
          {
            ref: 'col2',
            children: [{ type: 'paragraph' }],
          },
        ],
      });
    });

    it('should handle cells without leading whitespace', () => {
      // cells without space after pipe - tests normalizeIndentation with minIndent === 0
      const content = ['|Hello|World|', '|Line2|Line2B|'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      // both columns should have content parsed
      expect(result.children[0]?.children).toHaveLength(2);
      expect(result.children[1]?.children).toHaveLength(2);
      expect(result.children[0]?.children[0]).toMatchObject({
        type: 'paragraph',
        content: [{ text: 'Hello' }],
      });
    });

    it('should handle first row with non-annotation content', () => {
      // first row has content that looks like annotations but isn't wrapped in braces
      const content = ['| ref: col1 | regular text |', '| A | B |'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      const columns = result.children.map(({ ref, children }) => ({
        ref,
        children,
      }));

      // content should be parsed as regular content, not annotations
      expect(columns).toMatchObject([
        {
          ref: undefined,
          children: [
            { type: 'paragraph', content: [{ text: 'ref: col1' }] },
            { type: 'paragraph', content: [{ text: 'A' }] },
          ],
        },
        {
          ref: undefined,
          children: [
            { type: 'paragraph', content: [{ text: 'regular text' }] },
            { type: 'paragraph', content: [{ text: 'B' }] },
          ],
        },
      ]);
    });

    it('should handle columns with whitespace-only content', () => {
      // cells with only whitespace - normalized.trim() should be falsy
      const content = ['|    |    |', '|    |    |'].join('\n');

      const result = buildLayoutNode({
        content,
        context: { range: defaultRange },
        blockParser,
      });

      // columns should have no children since content is whitespace-only
      expect(result.children[0]?.children).toHaveLength(0);
      expect(result.children[1]?.children).toHaveLength(0);
    });
  });
});

describe('fn:normalizeIndentation', () => {
  it('should return empty string for empty array', () => {
    const result = normalizeIndentation([]);

    expect(result).toBe('');
  });

  it('should skip empty lines when calculating minimum indent', () => {
    // mix of empty lines and indented content
    const result = normalizeIndentation(['  line1', '', '  line2', '']);

    // should strip the common 2-space indent, empty lines become empty strings
    expect(result).toBe('line1\n\nline2\n');
  });

  it('should handle all empty lines gracefully', () => {
    const result = normalizeIndentation(['', '', '']);

    // all empty lines = minIndent stays Infinity, join as-is
    expect(result).toBe('\n\n');
  });

  it('should preserve relative indentation', () => {
    const result = normalizeIndentation(['  outer', '    inner', '  outer']);

    // strips common 2-space indent, preserves relative
    expect(result).toBe('outer\n  inner\nouter');
  });

  it('should handle lines with no common indent', () => {
    const result = normalizeIndentation(['line1', 'line2']);

    // no common indent (minIndent = 0), join as-is
    expect(result).toBe('line1\nline2');
  });

  it('should handle single line', () => {
    const result = normalizeIndentation(['  indented']);

    expect(result).toBe('indented');
  });

  it('should handle whitespace-only lines as content', () => {
    // lines that consist only of whitespace should still be joined
    const result = normalizeIndentation(['   ', '   ']);

    // all lines are empty when trimmed, minIndent stays Infinity
    expect(result).toBe('   \n   ');
  });
});

describe('buildLayoutNode position accuracy', () => {
  it('should compute accurate per-line positions', () => {
    const source = '| Line1 | Col2 |\n| Line2 | Col2B |';

    const result = buildLayoutNode({
      content: source,
      context: {
        range: getRange(source, source),
      },
    });

    // verify column positions span from first to last line
    expect(result.children[0]?.range).toEqual(
      getRange(source, '| Line1 | Col2 |\n| Line2 | Col2B |'),
    );
  });

  it('should compute positions for layout with annotation row', () => {
    const source = '| {{ ref: c1 }} | {{ ref: c2 }} |\n| A | B |';

    const result = buildLayoutNode({
      content: source,
      context: {
        range: getRange(source, source),
      },
    });

    // columns should span both lines
    expect(result.children[0]?.range?.start.line).toBe(1);
    expect(result.children[0]?.range?.end.line).toBe(2);
  });
});

describe('layout cell parsing delegates to generic block parser', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 10, offset: 9 },
  };

  /**
   * builds an adapter-aware blockParser for tests
   *
   * simulates the notion-sync style adapter that maps the
   * `[Title]{{type: page, ref: <id>}}` inline-control syntax into a
   * `child_page` block when encountered as cell content; otherwise defers to
   * the default top-level parser. exists as a shared fixture so the parse
   * delegation test and the round-trip test reference one canonical adapter
   * @returns child_page-aware BlockParser
   */
  const createChildPageBlockParser = (): BlockParser => (content) => {
    const trimmed = content.trim();
    const childPageMatch =
      /^\[(?<title>[^\]]*)\]\{\{\s*type:\s*page,\s*ref:\s*(?<ref>[^}\s]+)\s*\}\}$/.exec(
        trimmed,
      );

    if (childPageMatch?.groups) {
      return [
        {
          type: 'child_page',
          ref: childPageMatch.groups.ref,
          annotations: { title: childPageMatch.groups.title },
          children: [],
          range: defaultRange,
        } as BlockNode,
      ];
    }

    return buildAst(tokenize(content)).children;
  };

  it('should preserve adapter-registered block types in cells (parseColumnsAsInline path)', () => {
    // the layout parser delegates cell parsing to the supplied blockParser so
    // adapter-aware transformations (e.g. child_page rehydration) survive
    const blockParser = createChildPageBlockParser();

    const content = '| [My Page]{{type: page, ref: abc123}} | Prose |';

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
      blockParser,
    });

    // first column preserves the child_page block (NOT a paragraph wrap);
    // second column still parses as a regular paragraph via the same parser
    expect(result.children[0]?.children[0]).toMatchObject({
      type: 'child_page',
      ref: 'abc123',
      annotations: { title: 'My Page' },
    });
    expect(result.children[1]?.children[0]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('should fall back to a paragraph when blockParser is unavailable', () => {
    // backward-compat: without a blockParser, plain-prose cells continue to
    // round-trip as paragraphs (the prior happy path stays intact)
    const content = '| Hello | World |';

    const result = buildLayoutNode({
      content,
      context: { range: defaultRange },
    });

    expect(result.children[0]?.children[0]).toMatchObject({
      type: 'paragraph',
      content: [{ text: 'Hello' }],
    });
    expect(result.children[1]?.children[0]).toMatchObject({
      type: 'paragraph',
      content: [{ text: 'World' }],
    });
  });

});
