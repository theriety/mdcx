import { describe, expect, it } from 'vitest';

import { parse } from '#parse';
import { stringifyBlock } from '#stringifier/blocks';
import {
  computeMaxColumnWidth,
  measureColumnContentWidth,
  shouldUseInlineFormat,
  stringifyLayout,
  stringifyLayoutInline,
  stringifyLayoutNested,
} from '#stringifier/layout';
import { measureInlineNodeWidth } from '#stringifier/utilities';
import { stringify } from '#stringify';

import { createParagraph } from '../fixtures/ast';
import { createTextNode } from '../fixtures/inline';
import { createColumn, createLayout } from '../fixtures/layout';
import { DEFAULT_RANGE } from '../fixtures/ranges';

import type { BlockNode, ColumnNode } from '#types';

// TEST SUITES //

describe('fn:computeMaxColumnWidth', () => {
  it('should calculate width for single column', () => {
    const result = computeMaxColumnWidth(1);

    expect(result).toBe(80);
  });

  it('should calculate width for two columns', () => {
    // formula: floor(80 / (2 + 0.5)) = floor(32) = 32
    const result = computeMaxColumnWidth(2);

    expect(result).toBe(32);
  });

  it('should calculate width for three columns', () => {
    // formula: floor(80 / (3 + 1)) = floor(20) = 20
    const result = computeMaxColumnWidth(3);

    expect(result).toBe(20);
  });

  it('should calculate width for four columns', () => {
    // formula: floor(80 / (4 + 1.5)) = floor(14.5) = 14
    const result = computeMaxColumnWidth(4);

    expect(result).toBe(14);
  });
});

describe('fn:measureInlineNodeWidth', () => {
  it('should measure text length', () => {
    const node = createTextNode('Hello');

    const result = measureInlineNodeWidth(node);

    expect(result).toBe(5);
  });

  it('should return zero for empty text', () => {
    const node = createTextNode('');

    const result = measureInlineNodeWidth(node);

    expect(result).toBe(0);
  });
});

describe('fn:measureColumnContentWidth', () => {
  it('should measure maximum width across children', () => {
    const column = createColumn([
      createParagraph('Short'),
      createParagraph('Much longer text'),
      createParagraph('Medium'),
    ]);

    const result = measureColumnContentWidth({
      column,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toBe(16); // "Much longer text".length
  });

  it('should return zero for empty column', () => {
    const column = createColumn([]);

    const result = measureColumnContentWidth({
      column,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toBe(0);
  });

  it('should measure container nodes (like layout) via the generic block stringifier', () => {
    // delegation contract: a nested layout block is no longer treated as a
    // zero-width slot - the generic stringifier emits its `{{ type: layout }}`
    // annotation, and column width must account for that to avoid truncation.
    const column: ColumnNode = {
      type: 'column',
      children: [
        {
          type: 'layout',
          children: [],
          range: DEFAULT_RANGE,
        },
      ],
      range: DEFAULT_RANGE,
    };

    const result = measureColumnContentWidth({
      column,
      stringifyBlockFn: stringifyBlock,
    });

    // "{{ type: layout }}" => 18 chars
    expect(result).toBe(18);
  });
});

describe('fn:shouldUseInlineFormat', () => {
  it('should return true for empty layout', () => {
    const layout = createLayout([]);

    const result = shouldUseInlineFormat({
      layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toBe(true);
  });

  it('should return true when all columns fit within width', () => {
    const layout = createLayout([
      createColumn([createParagraph('Short')]),
      createColumn([createParagraph('Text')]),
    ]);

    const result = shouldUseInlineFormat({
      layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toBe(true);
  });

  it('should return false when any column exceeds width', () => {
    const longText = 'A'.repeat(50);
    const layout = createLayout([
      createColumn([createParagraph(longText)]),
      createColumn([createParagraph('Short')]),
    ]);

    const result = shouldUseInlineFormat({
      layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toBe(false);
  });
});

describe('fn:stringifyLayoutInline', () => {
  it('should stringify single row layout', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')]),
      createColumn([createParagraph('B')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A | B |']);
  });

  it('should stringify multiple row layout', () => {
    const layout = createLayout([
      createColumn([createParagraph('A1'), createParagraph('A2')]),
      createColumn([createParagraph('B1'), createParagraph('B2')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A1 | B1 |', '| A2 | B2 |']);
  });

  it('should include column annotations row when ref is present', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')], { ref: 'col1' }),
      createColumn([createParagraph('B')], { ref: 'col2' }),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '| {{ ref: col1 }} | {{ ref: col2 }} |',
      '| A               | B               |',
    ]);
  });

  it('should include column annotations row when annotations object has values', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')], { annotations: { width: 50 } }),
      createColumn([createParagraph('B')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '| {{ width: 50 }} |   |',
      '| A               | B |',
    ]);
  });

  it('should handle columns with different row counts', () => {
    const layout = createLayout([
      createColumn([createParagraph('A1')]),
      createColumn([createParagraph('B1'), createParagraph('B2')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A1 | B1 |', '|    | B2 |']);
  });

  it('should omit column annotations when omitAnnotations is true', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')], { ref: 'col1' }),
      createColumn([createParagraph('B')], { ref: 'col2' }),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      options: { omitAnnotations: true },
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A | B |']);
  });

  it('should handle empty column', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')]),
      createColumn([]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A |  |']);
  });

  it('should render an empty cell for a sparse child slot', () => {
    const sparseChildren: BlockNode[] = new Array(1);
    const layout = createLayout([createColumn(sparseChildren)]);

    const sparseSafeStringify = (node: BlockNode | undefined) =>
      node ? stringifyBlock(node) : [];

    expect(
      stringifyLayoutInline({
        node: layout,
        stringifyBlockFn: sparseSafeStringify as typeof stringifyBlock,
      }),
    ).toEqual(['|  |']);
  });

  it('should preserve container node annotation when rendered as a cell', () => {
    // delegation contract: a nested layout block is rendered via the generic
    // block stringifier (not silently dropped to an empty cell as in the
    // pre-delegation implementation), preserving the block-level type info
    // required for round-tripping.
    const containerNode: BlockNode = {
      type: 'layout',
      children: [],
      range: DEFAULT_RANGE,
    };
    const layout = createLayout([createColumn([containerNode])]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| {{ type: layout }} |']);
  });
});

describe('fn:stringifyLayoutNested', () => {
  it('should stringify columns with type annotation', () => {
    const layout = createLayout([
      createColumn([createParagraph('Content A')]),
      createColumn([createParagraph('Content B')]),
    ]);

    const result = stringifyLayoutNested({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '  {{ type: column }}',
      '    Content A',
      '',
      '  {{ type: column }}',
      '    Content B',
    ]);
  });

  it('should include column annotations in nested format', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')], {
        ref: 'col-a',
        annotations: { ratio: 0.5 },
      }),
    ]);

    const result = stringifyLayoutNested({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '  {{ type: column, ref: col-a, ratio: 0.5 }}',
      '    A',
    ]);
  });

  it('should emit each column ref instead of the layout ref', () => {
    const layout = createLayout(
      [
        createColumn([createParagraph('A')], { ref: 'col-a' }),
        createColumn([createParagraph('B')], { ref: 'col-b' }),
      ],
      { ref: 'layout-id' },
    );

    const result = stringifyLayoutNested({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '  {{ type: column, ref: col-a }}',
      '    A',
      '',
      '  {{ type: column, ref: col-b }}',
      '    B',
    ]);
  });

  it('should omit annotations when omitAnnotations is true', () => {
    const layout = createLayout([
      createColumn([createParagraph('Content')], { ref: 'col1' }),
    ]);

    const result = stringifyLayoutNested({
      node: layout,
      options: { omitAnnotations: true },
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['    Content']);
  });

  it('should skip a sparse column entry', () => {
    const columns: ColumnNode[] = new Array(1);
    const layout = createLayout(columns);

    expect(
      stringifyLayoutNested({
        node: layout,
        stringifyBlockFn: stringifyBlock,
      }),
    ).toEqual([]);
  });
});

describe('fn:stringifyLayout', () => {
  it('should use inline format for narrow columns', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')]),
      createColumn([createParagraph('B')]),
    ]);

    const result = stringifyLayout({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| A | B |']);
  });

  it('should use nested format for wide columns', () => {
    const longText = 'A'.repeat(50);
    const layout = createLayout([
      createColumn([createParagraph(longText)]),
      createColumn([createParagraph('B')]),
    ]);

    const result = stringifyLayout({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '  {{ type: column }}',
      `    ${longText}`,
      '',
      '  {{ type: column }}',
      '    B',
    ]);
  });

  it('should round-trip nested layout output through parse', () => {
    const longText = 'A'.repeat(50);
    const document = {
      type: 'document',
      children: [
        createLayout(
          [
            createColumn([createParagraph(longText)], { ref: 'col-a' }),
            createColumn([createParagraph('B')], { ref: 'col-b' }),
          ],
          { ref: 'layout-id', annotations: { ratios: '1,1' } },
        ),
      ],
    };

    const output = stringify(document);
    const ast = parse(output);

    expect(ast.children).toMatchObject([
      {
        type: 'layout',
        ref: 'layout-id',
        annotations: { ratios: '1,1' },
        children: [
          {
            type: 'column',
            ref: 'col-a',
            children: [{ type: 'paragraph' }],
          },
          {
            type: 'column',
            ref: 'col-b',
            children: [{ type: 'paragraph' }],
          },
        ],
      },
    ]);
  });
});

describe('fn:stringifyLayoutInline column width formatting', () => {
  it('should pad cells to match widest content in each column', () => {
    const layout = createLayout([
      createColumn([createParagraph('Name'), createParagraph('Bob')]),
      createColumn([createParagraph('Alice'), createParagraph('Joe')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| Name | Alice |', '| Bob  | Joe   |']);
  });

  it('should handle columns with different row counts', () => {
    const layout = createLayout([
      createColumn([createParagraph('Short')]),
      createColumn([createParagraph('A'), createParagraph('Longer')]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| Short | A      |', '|       | Longer |']);
  });

  it('should include annotation row with proper padding', () => {
    const layout = createLayout([
      createColumn([createParagraph('A')], { ref: 'col1' }),
      createColumn([createParagraph('Data')], { ref: 'col2' }),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual([
      '| {{ ref: col1 }} | {{ ref: col2 }} |',
      '| A               | Data            |',
    ]);
  });
});

describe('fn:stringifyLayoutInline adapter-delegated cells', () => {
  it('should preserve block-level annotations for adapter-formatted blocks like child_page', () => {
    // simulate a notion-sync style adapter: the layout cell holds a custom
    // child_page block whose stringification is driven by a `format` callback.
    // before the delegation fix, the layout writer dropped this block entirely
    // because it had no inline `content` array, producing an empty cell.
    const childPage: BlockNode = {
      type: 'child_page',
      ref: 'page-id-123',
      annotations: {},
      content: [],
      children: [],
      range: DEFAULT_RANGE,
    } as BlockNode;
    const layout = createLayout([createColumn([childPage])]);

    const result = stringifyLayoutInline({
      node: layout,
      options: {
        omitAnnotations: true,
        format: (node) =>
          node.type === 'child_page'
            ? `[Title]{type: page, ref: ${node.ref}}`
            : '',
      },
      stringifyBlockFn: stringifyBlock,
    });

    // adapter output is preserved verbatim inside the cell - no annotation
    // stripping, no inline-only fallback that would erase the `{type: page,
    // ref: <id>}` payload required for downstream round-tripping
    expect(result).toEqual(['| [Title]{type: page, ref: page-id-123} |']);
  });

  it('should preserve child_database block annotations in cells', () => {
    const childDatabase: BlockNode = {
      type: 'child_database',
      ref: 'db-id-456',
      annotations: {},
      content: [],
      children: [],
      range: DEFAULT_RANGE,
    } as BlockNode;
    const layout = createLayout([createColumn([childDatabase])]);

    const result = stringifyLayoutInline({
      node: layout,
      options: {
        omitAnnotations: true,
        format: (node) =>
          node.type === 'child_database'
            ? `[Title]{type: database, ref: ${node.ref}}`
            : '',
      },
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| [Title]{type: database, ref: db-id-456} |']);
  });

  it('should mix native paragraph cells with adapter-formatted cells', () => {
    const childPage: BlockNode = {
      type: 'child_page',
      ref: 'p1',
      annotations: {},
      content: [],
      children: [],
      range: DEFAULT_RANGE,
    } as BlockNode;
    const layout = createLayout([
      createColumn([createParagraph('Prose')]),
      createColumn([childPage]),
    ]);

    const result = stringifyLayoutInline({
      node: layout,
      options: {
        omitAnnotations: true,
        // adapter pattern: format callback handles known custom types and
        // defers to `stringifyDefault` for everything else so native paragraph
        // cells render normally
        format: (node, stringifyDefault) =>
          node.type === 'child_page'
            ? `[Title]{type: page, ref: ${node.ref}}`
            : stringifyDefault(node),
      },
      stringifyBlockFn: stringifyBlock,
    });

    expect(result).toEqual(['| Prose | [Title]{type: page, ref: p1} |']);
  });
});
