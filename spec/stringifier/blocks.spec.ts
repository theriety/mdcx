import { describe, expect, it, vi } from 'vitest';

import { parse } from '#parse';
import {
  defaultStringifyBlock,
  shouldInsertBlankLine,
  stringifyBlock,
  stringifyBlockContent,
} from '#stringifier/blocks';

import {
  createBullet,
  createCode,
  createEnum,
  createHeading,
  createParagraph,
  createQuote,
  createTodo,
} from '../fixtures/ast';
import { createTextNode } from '../fixtures/inline';
import { DEFAULT_RANGE } from '../fixtures/ranges';

import type {
  BlockNode,
  BulletNode,
  CodeNode,
  DividerNode,
  EquationNode,
  HeadingNode,
  ParagraphNode,
  QuoteNode,
} from '#types';

// TEST SUITES //

describe('fn:shouldInsertBlankLine', () => {
  it('should return true between different block types', () => {
    const paragraph = createParagraph('text');
    const heading = createHeading('Title', 1);

    const result = shouldInsertBlankLine(paragraph, heading);

    expect(result).toBe(true);
  });

  it('should return false between consecutive bullet items', () => {
    const bullet1 = createBullet('Item 1');
    const bullet2 = createBullet('Item 2');

    const result = shouldInsertBlankLine(bullet1, bullet2);

    expect(result).toBe(false);
  });

  it('should return false between consecutive enum items', () => {
    const enum1 = createEnum('First');
    const enum2 = createEnum('Second');

    const result = shouldInsertBlankLine(enum1, enum2);

    expect(result).toBe(false);
  });

  it('should return false between consecutive todo items', () => {
    const todo1 = createTodo('Task 1', false);
    const todo2 = createTodo('Task 2', true);

    const result = shouldInsertBlankLine(todo1, todo2);

    expect(result).toBe(false);
  });

  it('should return true between bullet and enum', () => {
    const bullet = createBullet('Item');
    const enumNode = createEnum('First');

    const result = shouldInsertBlankLine(bullet, enumNode);

    expect(result).toBe(true);
  });
});

describe('fn:stringifyBlockContent', () => {
  describe('headings', () => {
    it('should stringify h1', () => {
      const heading = createHeading('Title', 1);

      const result = stringifyBlockContent(heading);

      expect(result).toEqual(['# Title']);
    });

    it('should stringify h2', () => {
      const heading = createHeading('Subtitle', 2);

      const result = stringifyBlockContent(heading);

      expect(result).toEqual(['## Subtitle']);
    });

    it('should stringify h3', () => {
      const heading = createHeading('Section', 3);

      const result = stringifyBlockContent(heading);

      expect(result).toEqual(['### Section']);
    });

    it('should default to h1 when depth is missing', () => {
      const heading: HeadingNode = {
        type: 'heading',
        content: [createTextNode('Title')],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(heading);

      expect(result).toEqual(['# Title']);
    });
  });

  describe('paragraphs', () => {
    it('should stringify paragraph', () => {
      const paragraph = createParagraph('Hello world');

      const result = stringifyBlockContent(paragraph);

      expect(result).toEqual(['Hello world']);
    });

    it('should stringify empty paragraph', () => {
      const paragraph: ParagraphNode = {
        type: 'paragraph',
        content: [],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(paragraph);

      expect(result).toEqual(['']);
    });
  });

  describe('lists', () => {
    it('should stringify bullet item', () => {
      const bullet = createBullet('Item text');

      const result = stringifyBlockContent(bullet);

      expect(result).toEqual(['- Item text']);
    });

    it('should stringify enum item', () => {
      const enumNode = createEnum('First item');

      const result = stringifyBlockContent(enumNode);

      expect(result).toEqual(['1. First item']);
    });

    it('should stringify empty bullet', () => {
      const bullet: BulletNode = {
        type: 'bullet',
        content: [],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(bullet);

      expect(result).toEqual(['- ']);
    });
  });

  describe('todos', () => {
    it('should stringify unchecked todo', () => {
      const todo = createTodo('Task', false);

      const result = stringifyBlockContent(todo);

      expect(result).toEqual(['- [ ] Task']);
    });

    it('should stringify checked todo', () => {
      const todo = createTodo('Done', true);

      const result = stringifyBlockContent(todo);

      expect(result).toEqual(['- [x] Done']);
    });
  });

  describe('quotes', () => {
    it('should stringify quote', () => {
      const quote = createQuote('Quote text');

      const result = stringifyBlockContent(quote);

      expect(result).toEqual(['> Quote text']);
    });

    it('should stringify empty quote', () => {
      const quote: QuoteNode = {
        type: 'quote',
        content: [],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(quote);

      expect(result).toEqual(['> ']);
    });
  });

  describe('code blocks', () => {
    it('should stringify code block with language', () => {
      const code = createCode('const x = 1;', 'typescript');

      const result = stringifyBlockContent(code);

      expect(result).toEqual(['```typescript', 'const x = 1;', '```']);
    });

    it('should stringify code block without language', () => {
      const code = createCode('plain code');

      const result = stringifyBlockContent(code);

      expect(result).toEqual(['```', 'plain code', '```']);
    });

    it('should stringify empty code block', () => {
      const code: CodeNode = {
        type: 'code',
        content: [],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(code);

      expect(result).toEqual(['```', '', '```']);
    });

    it('should stringify multiline code', () => {
      const code = createCode('line1\nline2\nline3', 'js');

      const result = stringifyBlockContent(code);

      expect(result).toEqual(['```js', 'line1', 'line2', 'line3', '```']);
    });
  });

  describe('dividers', () => {
    it('should stringify divider as three hyphens', () => {
      const divider: DividerNode = {
        type: 'divider',
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(divider);

      expect(result).toEqual(['---']);
    });
  });

  describe('equations', () => {
    it('should stringify equation with content', () => {
      const equation: EquationNode = {
        type: 'equation',
        content: [createTextNode('E = mc^2')],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(equation);

      expect(result).toEqual(['$$ E = mc^2 $$']);
    });

    it('should stringify equation with LaTeX content', () => {
      const equation: EquationNode = {
        type: 'equation',
        content: [createTextNode('x = \\frac{-b}{2a}')],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(equation);

      expect(result).toEqual(['$$ x = \\frac{-b}{2a} $$']);
    });

    it('should stringify empty equation', () => {
      const equation: EquationNode = {
        type: 'equation',
        content: [],
        range: DEFAULT_RANGE,
      };

      const result = stringifyBlockContent(equation);

      expect(result).toEqual(['$$  $$']);
    });
  });

  describe('special container types', () => {
    it('should throw for header type', () => {
      const header = {
        type: 'header' as const,
        content: [createTextNode('Header')],
        range: DEFAULT_RANGE,
      };

      expect(() => stringifyBlockContent(header)).toThrow(
        'header is a special container children block',
      );
    });

    it('should throw for column type', () => {
      const column = {
        type: 'column' as const,
        children: [],
        range: DEFAULT_RANGE,
      };

      expect(() => stringifyBlockContent(column)).toThrow(
        'column is a special container children block',
      );
    });

    it('should throw for row type', () => {
      const row = {
        type: 'row' as const,
        children: [],
        range: DEFAULT_RANGE,
      };

      expect(() => stringifyBlockContent(row)).toThrow(
        'row is a special container children block',
      );
    });

    it('should throw for cell type', () => {
      const cell = {
        type: 'cell' as const,
        content: [createTextNode('Cell')],
        range: DEFAULT_RANGE,
      };

      expect(() => stringifyBlockContent(cell)).toThrow(
        'cell is a special container children block',
      );
    });
  });

  describe('custom block types', () => {
    it('should throw for custom block type without format callback', () => {
      const custom = {
        type: 'callout',
        content: [createTextNode('Important')],
        range: DEFAULT_RANGE,
      } as BlockNode;

      expect(() => stringifyBlockContent(custom as never)).toThrow(
        'custom block type "callout" requires a format callback',
      );
    });
  });
});

describe('fn:defaultStringifyBlock', () => {
  it('should stringify block with children', () => {
    const bullet: BulletNode = {
      type: 'bullet',
      content: [createTextNode('Parent')],
      children: [createBullet('Child')],
      range: DEFAULT_RANGE,
    };

    const result = defaultStringifyBlock(bullet);

    expect(result).toEqual(['- Parent', '  - Child']);
  });

  it('should handle deeply nested children', () => {
    const bullet: BulletNode = {
      type: 'bullet',
      content: [createTextNode('Level 1')],
      children: [
        {
          type: 'bullet',
          content: [createTextNode('Level 2')],
          children: [createBullet('Level 3')],
          range: DEFAULT_RANGE,
        },
      ],
      range: DEFAULT_RANGE,
    };

    const result = defaultStringifyBlock(bullet);

    expect(result).toEqual(['- Level 1', '  - Level 2', '    - Level 3']);
  });
});

describe('fn:stringifyBlock', () => {
  it.each([
    ['heading', 'auto'],
    ['heading', 'all'],
    ['heading', 'none'],
    ['table', 'auto'],
    ['table', 'all'],
    ['table', 'none'],
    ['callout', 'auto'],
    ['callout', 'all'],
    ['callout', 'none'],
  ] as const)(
    'should serialize a typed empty %s block canonically under %s policy',
    (type, closingMarkers) => {
      const ref = `empty-${type}`;
      const annotation = `{{ type: ${type}, ref: ${ref} }}`;
      const node = parse(annotation).children[0];
      const format = vi.fn(() => 'unexpected body');

      if (node === undefined) {
        throw new Error('Expected the parsed empty block.');
      }

      const result = stringifyBlock(node, { closingMarkers, format });

      expect(result).toEqual(
        closingMarkers === 'all'
          ? [annotation, `--{ ref: ${ref} }--`]
          : [annotation],
      );
      expect(format).not.toHaveBeenCalled();
    },
  );

  it('should omit an automatic marker for a referenced leaf', () => {
    const paragraph = createParagraph('Content', { ref: 'intro' });

    const result = stringifyBlock(paragraph);

    expect(result).toEqual(['{{ ref: intro }}', 'Content']);
  });

  it('should emit a marker for a referenced leaf under all policy', () => {
    const paragraph = createParagraph('Content', {
      ref: 'section with } character',
    });

    const result = stringifyBlock(paragraph, { closingMarkers: 'all' });

    expect(result).toEqual([
      '{{ ref: "section with } character" }}',
      'Content',
      '--{ ref: "section with } character" }--',
    ]);
  });

  it('should omit block annotation when omitAnnotations is true', () => {
    const paragraph = createParagraph('Content', { ref: 'intro' });

    const result = stringifyBlock(paragraph, { omitAnnotations: true });

    expect(result).toEqual(['Content']);
  });

  it('should omit block annotation row and closing marker when omitBlockAnnotations is true', () => {
    const paragraph = createParagraph('Content', { ref: 'intro' });

    const result = stringifyBlock(paragraph, { omitBlockAnnotations: true });

    expect(result).toEqual(['Content']);
  });

  it('should retain inline annotations when omitBlockAnnotations is true', () => {
    // build a paragraph whose inline content includes a meta annotation that
    // would render as `[caption]{{ type: foo }}` in MDC. omitBlockAnnotations
    // must suppress only the leading `{{ ref: ... }}` row, NOT the inline meta.
    const paragraph: ParagraphNode = {
      type: 'paragraph',
      ref: 'intro',
      content: [
        createTextNode('hello '),
        {
          type: 'meta',
          caption: [createTextNode('world')],
          annotations: { type: 'foo' },
          range: DEFAULT_RANGE,
        },
      ],
      range: DEFAULT_RANGE,
    };

    const result = stringifyBlock(paragraph, { omitBlockAnnotations: true });

    expect(result).toEqual(['hello [world]{{ type: foo }}']);
  });

  it('should omit closing marker when closingMarkers is none', () => {
    const paragraph = createParagraph('Content', { ref: 'intro' });

    const result = stringifyBlock(paragraph, { closingMarkers: 'none' });

    expect(result).toEqual(['{{ ref: intro }}', 'Content']);
  });

  it('should include closing marker after children at the block indent level', () => {
    const bullet: BulletNode = {
      type: 'bullet',
      ref: 'parent',
      content: [createTextNode('Parent')],
      children: [createBullet('Child', { ref: 'child' })],
      range: DEFAULT_RANGE,
    };

    const result = stringifyBlock(bullet);

    expect(result).toEqual([
      '{{ ref: parent }}',
      '- Parent',
      '  {{ ref: child }}',
      '  - Child',
      '--{ ref: parent }--',
    ]);
  });

  it('should emit markers for a parent and leaf child under all policy', () => {
    const bullet: BulletNode = {
      type: 'bullet',
      ref: 'parent',
      content: [createTextNode('Parent')],
      children: [createBullet('Child', { ref: 'child' })],
      range: DEFAULT_RANGE,
    };

    const result = stringifyBlock(bullet, { closingMarkers: 'all' });

    expect(result).toEqual([
      '{{ ref: parent }}',
      '- Parent',
      '  {{ ref: child }}',
      '  - Child',
      '  --{ ref: child }--',
      '--{ ref: parent }--',
    ]);
  });

  it('should emit an automatic marker for generic children of a custom block', () => {
    const custom = {
      type: 'callout',
      ref: 'notice',
      content: [createTextNode('Important')],
      children: [createParagraph('Details')],
      range: DEFAULT_RANGE,
    } as BlockNode;

    const result = stringifyBlock(custom, {
      format: (node, stringify) => stringify({ ...node, type: 'paragraph' }),
    });

    expect(result).toEqual([
      '{{ type: callout, ref: notice }}',
      'Important',
      '  Details',
      '--{ ref: notice }--',
    ]);
  });

  it('should never emit independent markers for intrinsic table nodes', () => {
    const table = {
      type: 'table',
      ref: 'scores',
      headers: [
        {
          type: 'header',
          ref: 'name-header',
          content: [createTextNode('Name')],
          range: DEFAULT_RANGE,
        },
      ],
      children: [
        {
          type: 'row',
          ref: 'alice-row',
          children: [
            {
              type: 'cell',
              ref: 'alice-cell',
              content: [createTextNode('Alice')],
              range: DEFAULT_RANGE,
            },
          ],
          range: DEFAULT_RANGE,
        },
      ],
      range: DEFAULT_RANGE,
    } as BlockNode;

    const result = stringifyBlock(table, { closingMarkers: 'all' });

    expect(result.filter((line) => line.startsWith('--{'))).toEqual([
      '--{ ref: scores }--',
    ]);
  });

  it('should never emit independent markers for intrinsic layout columns', () => {
    const layout = {
      type: 'layout',
      ref: 'columns',
      children: [
        {
          type: 'column',
          ref: 'left-column',
          children: [createParagraph('Left')],
          range: DEFAULT_RANGE,
        },
        {
          type: 'column',
          ref: 'right-column',
          children: [createParagraph('Right')],
          range: DEFAULT_RANGE,
        },
      ],
      range: DEFAULT_RANGE,
    } as BlockNode;

    const result = stringifyBlock(layout, { closingMarkers: 'all' });

    expect(result.filter((line) => line.startsWith('--{'))).toEqual([
      '--{ ref: columns }--',
    ]);
  });

  it('should use custom format callback when provided', () => {
    const heading = createHeading('Title', 1);

    const result = stringifyBlock(heading, {
      format: (node, stringify) => `<!-- ${node.type} -->\n${stringify(node)}`,
    });

    expect(result).toEqual(['<!-- heading -->', '# Title']);
  });

  it('should include custom type in annotation', () => {
    const custom = {
      type: 'callout',
      content: [createTextNode('Note')],
      range: DEFAULT_RANGE,
    } as BlockNode;

    const result = stringifyBlock(custom, {
      format: (node, stringify) => {
        if (node.type === 'callout') {
          return stringify({ ...node, type: 'paragraph' });
        }

        return stringify(node);
      },
    });

    expect(result).toEqual(['{{ type: callout }}', 'Note']);
  });
});
