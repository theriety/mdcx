import { describe, expect, it } from 'vitest';

import {
  collectQuoteContinuations,
  createOnContentContext,
  parseBlockContent,
} from '#parser/blocks';

import { createContentToken } from '../fixtures/tokens';

import type { Token } from '#lexer/types';
import type { HeadingNode, TableNode } from '#types';

// TEST SUITES //

describe('fn:parseBlockContent', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 20, offset: 19 },
  };

  it('should create heading node', () => {
    const content = '## Subtitle';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    }) as HeadingNode;

    expect(node).toMatchObject({
      type: 'heading',
      annotations: { depth: 2 },
    });
  });

  it('should classify representative content types', () => {
    const paragraph = parseBlockContent({
      content: 'Plain paragraph text',
      context: { range: defaultRange },
    });
    const quote = parseBlockContent({
      content: '> Important quote',
      context: { range: defaultRange },
    });
    const divider = parseBlockContent({
      content: '----',
      context: { range: defaultRange },
    });

    expect({
      paragraph: paragraph.type,
      quote: quote.type,
      divider: divider.type,
    }).toEqual({
      paragraph: 'paragraph',
      quote: 'quote',
      divider: 'divider',
    });
  });

  it('should attach annotations to node', () => {
    const content = '# Title';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { ref: 'intro' },
      },
    });

    // ref is extracted from annotations and set as top-level property
    expect(node).toMatchObject({
      annotations: { depth: 1 },
      ref: 'intro',
    });
  });

  it('should not add annotations property when empty', () => {
    const content = '# Title';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: {},
      },
    });

    // heading still has depth annotation from type inference
    expect(node.annotations).toEqual({ depth: 1 });
  });

  it('should attach annotations without ref when ref is non-string', () => {
    const content = '# Title';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { type: 'callout' },
      },
    });

    expect(node).toMatchObject({
      // type: 'callout' overrides the inferred 'heading' type
      type: 'callout',
    });
    expect(node.ref).toBeUndefined();
  });

  it('should create todo node with checked state', () => {
    const content = '- [x] Done';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'todo',
      annotations: { checked: true },
    });
  });

  it('should create todo node with unchecked state', () => {
    const content = '- [ ] Pending';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'todo',
      annotations: { checked: false },
    });
  });

  it('should parse inline content within block', () => {
    const content = '# Hello **world**';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node.content?.length ?? 0).toBeGreaterThan(0);
  });

  it('should preserve position from context', () => {
    const content = '# Title';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node.range).toEqual(defaultRange);
  });

  it('should create table node from multiline content with separator', () => {
    const content = ['|A|B|', '|---|---|', '|1|2|'].join('\n');

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node.type).toBe('table');
    expect(node.children).toHaveLength(1); // one row of data
  });

  it('should create divider node from three hyphens', () => {
    const content = '---';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'divider',
      range: defaultRange,
    });
    expect(node.content).toBeUndefined();
    expect(node.children).toBeUndefined();
  });

  it('should attach annotations to divider node', () => {
    const content = '---';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { ref: 'section-break' },
      },
    });

    expect(node).toMatchObject({
      type: 'divider',
      ref: 'section-break',
    });
  });

  it('should create equation node from double dollar signs', () => {
    const content = '$$ E = mc^2 $$';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'equation',
      content: [{ type: 'text', text: 'E = mc^2' }],
      range: defaultRange,
    });
  });

  it('should create equation node with LaTeX content', () => {
    const content = '$$ x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a} $$';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'equation',
      content: [
        { type: 'text', text: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
      ],
    });
  });

  it('should attach annotations to equation node', () => {
    const content = '$$ E = mc^2 $$';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { ref: 'einstein' },
      },
    });

    expect(node).toMatchObject({
      type: 'equation',
      ref: 'einstein',
    });
  });

  it('should create equation node with empty content when only delimiters', () => {
    const content = '$$  $$';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    });

    expect(node).toMatchObject({
      type: 'equation',
      content: [],
    });
  });
});

describe('fn:createOnContentContext', () => {
  it('should create context with ref, type, annotations and parseContent', () => {
    const token = createContentToken('# Title');

    const context = createOnContentContext({
      token,
      context: { ref: 'intro' },
    });

    expect(context).toMatchObject({
      ref: 'intro',
      parseContent: expect.any(Function),
    });
  });

  it('should provide working parseBlockContent function', () => {
    const token = createContentToken('# Title');

    const context = createOnContentContext({ token, context: {} });
    const result = context.parseContent('## Heading');

    expect(result).toMatchObject({
      type: 'heading',
      annotations: { depth: 2 },
    });
  });

  it('should handle column content in parseBlockContent', () => {
    const token = createContentToken('| A | B |');

    const context = createOnContentContext({ token, context: {} });
    const result = context.parseContent('| Col1 | Col2 |') as TableNode;

    // single line without separator becomes table with undefined headers and RowNode children
    expect(result.type).toBe('table');
    expect(result.headers).toBeUndefined();
    expect(result.children).toHaveLength(1);
  });
});

describe('fn:collectQuoteContinuations', () => {
  it('should stop at a sparse newline slot', () => {
    const start = createContentToken('> Quote');
    const tokens: Token[] = new Array(2);

    expect(
      collectQuoteContinuations({ start, tokens, position: 0 }),
    ).toMatchObject({
      value: '> Quote',
      nextPosition: 0,
    });
  });

  it('should stop when the separator token is not a newline', () => {
    const start = createContentToken('> Quote');
    const tokens = [
      createContentToken('Not a newline'),
      createContentToken('Next'),
    ];

    expect(
      collectQuoteContinuations({ start, tokens, position: 0 }),
    ).toMatchObject({
      value: '> Quote',
      nextPosition: 0,
    });
  });
});
