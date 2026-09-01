import { describe, it, expect } from 'vitest';

import { computeNodeDelta } from '#differ/delta';

import { createBlockNode } from '../fixtures/ast';

import type { BlockNode } from '#types/ast';

// TEST SUITES //

describe('fn:computeNodeDelta', () => {
  it('should return empty objects when nodes are identical', () => {
    const node = createBlockNode('paragraph');

    const { from, to } = computeNodeDelta(node, node);

    expect(from).toEqual({});
    expect(to).toEqual({});
  });

  it('should detect added properties', () => {
    const nodeA = createBlockNode('paragraph');
    const nodeB = {
      ...createBlockNode('paragraph'),
      annotations: { status: 'draft' },
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).not.toHaveProperty('annotations');
    expect(to).toMatchObject({ annotations: { status: 'draft' } });
  });

  it('should detect removed properties', () => {
    const nodeA = {
      ...createBlockNode('paragraph'),
      annotations: { status: 'draft' },
    } as BlockNode;
    const nodeB = createBlockNode('paragraph');

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toMatchObject({ annotations: { status: 'draft' } });
    expect(to).not.toHaveProperty('annotations');
  });

  it('should detect changed scalar values', () => {
    const nodeA = {
      ...createBlockNode('paragraph'),
      annotations: { status: 'draft' },
    } as BlockNode;
    const nodeB = {
      ...createBlockNode('paragraph'),
      annotations: { status: 'published' },
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toMatchObject({ annotations: { status: 'draft' } });
    expect(to).toMatchObject({ annotations: { status: 'published' } });
  });

  it('should detect changed nested objects', () => {
    const nodeA = {
      ...createBlockNode('paragraph'),
      content: [{ type: 'text', text: 'old' }],
    } as BlockNode;
    const nodeB = {
      ...createBlockNode('paragraph'),
      content: [{ type: 'text', text: 'new' }],
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toMatchObject({ content: [{ type: 'text', text: 'old' }] });
    expect(to).toMatchObject({ content: [{ type: 'text', text: 'new' }] });
  });

  it('should detect changed arrays', () => {
    const nodeA = {
      ...createBlockNode('paragraph'),
      children: [createBlockNode('heading')],
    } as BlockNode;
    const nodeB = {
      ...createBlockNode('paragraph'),
      children: [createBlockNode('heading'), createBlockNode('paragraph')],
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toHaveProperty('children');
    expect(to).toHaveProperty('children');
  });

  it('should exclude position from delta', () => {
    const nodeA = {
      type: 'paragraph',
      children: [],
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      },
    } as BlockNode;
    const nodeB = {
      type: 'paragraph',
      children: [],
      range: {
        start: { line: 5, column: 1, offset: 50 },
        end: { line: 5, column: 10, offset: 59 },
      },
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).not.toHaveProperty('position');
    expect(to).not.toHaveProperty('position');
  });

  it('should handle ref changes', () => {
    const nodeA = createBlockNode('paragraph');
    const nodeB = createBlockNode('paragraph', 'new-ref');

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).not.toHaveProperty('ref');
    expect(to).toMatchObject({ ref: 'new-ref' });
  });

  it('should handle type changes', () => {
    const nodeA = createBlockNode('paragraph');
    const nodeB = createBlockNode('heading');

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toMatchObject({ type: 'paragraph' });
    expect(to).toMatchObject({ type: 'heading' });
  });

  it('should handle null values correctly', () => {
    const nodeA = {
      ...createBlockNode('paragraph'),
      annotations: null,
    } as unknown as BlockNode;
    const nodeB = {
      ...createBlockNode('paragraph'),
      annotations: { status: 'draft' },
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    expect(from).toHaveProperty('annotations', null);
    expect(to).toMatchObject({ annotations: { status: 'draft' } });
  });

  it('should handle undefined vs missing property correctly', () => {
    const nodeA = createBlockNode('paragraph');
    const nodeB = {
      ...createBlockNode('paragraph'),
      ref: undefined,
    } as BlockNode;

    const { from, to } = computeNodeDelta(nodeA, nodeB);

    // both have ref as undefined, should be equal
    expect(from).toEqual({});
    expect(to).toEqual({});
  });

  describe('ambiguous table/layout type handling', () => {
    it('should exclude type from delta when table has undefined headers', () => {
      const nodeA = {
        type: 'table',
        headers: undefined,
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as unknown as BlockNode;
      const nodeB = {
        type: 'layout',
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as BlockNode;

      const { from, to } = computeNodeDelta(nodeA, nodeB);

      expect(from).not.toHaveProperty('type');
      expect(to).not.toHaveProperty('type');
    });

    it('should exclude type from delta when table has empty headers array', () => {
      const nodeA = {
        type: 'table',
        headers: [],
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as unknown as BlockNode;
      const nodeB = {
        type: 'layout',
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as BlockNode;

      const { from, to } = computeNodeDelta(nodeA, nodeB);

      expect(from).not.toHaveProperty('type');
      expect(to).not.toHaveProperty('type');
    });

    it('should include type in delta when table has actual headers', () => {
      const range = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      };
      const nodeA = {
        type: 'table',
        headers: [{ type: 'header', content: [], range }],
        children: [],
        range,
      } as unknown as BlockNode;
      const nodeB = {
        type: 'layout',
        children: [],
        range,
      } as BlockNode;

      const { from, to } = computeNodeDelta(nodeA, nodeB);

      expect(from).toHaveProperty('type', 'table');
      expect(to).toHaveProperty('type', 'layout');
    });

    it('should include type in delta for non-table/layout type changes', () => {
      const nodeA = {
        type: 'paragraph',
        content: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as BlockNode;
      const nodeB = {
        type: 'heading',
        content: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
        },
      } as BlockNode;

      const { from, to } = computeNodeDelta(nodeA, nodeB);

      expect(from).toHaveProperty('type', 'paragraph');
      expect(to).toHaveProperty('type', 'heading');
    });

    it('should still include headers change in delta even when type excluded', () => {
      const range = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      };
      const nodeA = {
        type: 'table',
        headers: undefined,
        children: [],
        range,
      } as unknown as BlockNode;
      const nodeB = {
        type: 'table',
        headers: [{ type: 'header', content: [], range }],
        children: [],
        range,
      } as unknown as BlockNode;

      const { from, to } = computeNodeDelta(nodeA, nodeB);

      // type same, so not in delta, but headers changed
      expect(from).not.toHaveProperty('type');
      expect(to).toHaveProperty('headers');
    });
  });
});
