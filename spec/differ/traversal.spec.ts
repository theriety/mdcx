import { describe, it, expect } from 'vitest';

import {
  buildRefMap,
  collectUnmatchedNodes,
  getChildrenByProperty,
  traverseNodeChildren,
} from '#differ/traversal';

import { createBlockNode, createParagraph } from '../fixtures/ast';
import { DEFAULT_RANGE } from '../fixtures/ranges';

import type {
  BlockNode,
  DocumentNode,
  HeaderNode,
  RowNode,
  TableNode,
} from '#types';
import type { Path } from '#types/diff';

// HELPERS //

const createDocumentNode = (children: BlockNode[]): DocumentNode => ({
  type: 'document',
  children,
});

const createTableNode = (
  headers: HeaderNode[],
  options?: { ref?: string; children?: RowNode[] },
): TableNode => ({
  type: 'table',
  ref: options?.ref,
  headers,
  children: options?.children ?? [],
  range: DEFAULT_RANGE,
});

// TEST SUITES //

describe('fn:traverseNodeChildren', () => {
  it('should traverse children array and invoke callback with correct paths', () => {
    const child1 = createBlockNode('paragraph', 'child-1');
    const child2 = createBlockNode('paragraph', 'child-2');
    const parent: BlockNode = {
      ...createBlockNode('container'),
      children: [child1, child2],
    };
    const basePath: Path = ['children', 0];
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(parent, basePath, (node, path) => {
      visited.push({ node, path });
    });

    expect(visited).toEqual([
      { node: child1, path: ['children', 0, 'children', 0] },
      { node: child2, path: ['children', 0, 'children', 1] },
    ]);
  });

  it('should traverse table header cells for table nodes', () => {
    const header1 = createBlockNode('header', 'header-1') as HeaderNode;
    const header2 = createBlockNode('header', 'header-2') as HeaderNode;
    const table = createTableNode([header1, header2]);
    const basePath: Path = ['children', 0];
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(
      table as unknown as BlockNode,
      basePath,
      (node, path) => {
        visited.push({ node, path });
      },
    );

    expect(visited).toEqual([
      { node: header1, path: ['children', 0, 'headers', 0] },
      { node: header2, path: ['children', 0, 'headers', 1] },
    ]);
  });

  it('should not invoke callback when node has no children', () => {
    const node = createBlockNode('paragraph');
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(node, ['children', 0], (n, p) => {
      visited.push({ node: n, path: p });
    });

    expect(visited).toEqual([]);
  });

  it('should skip children property when it is not an array', () => {
    // node has 'children' in node but it's not an array
    const node = {
      type: 'malformed',
      children: 'not-an-array',
      range: DEFAULT_RANGE,
    } as unknown as BlockNode;
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(node, ['children', 0], (n, p) => {
      visited.push({ node: n, path: p });
    });

    expect(visited).toEqual([]);
  });

  it('should not traverse headers for non-table nodes', () => {
    // node has headers property but is not type: 'table'
    const node = {
      type: 'not-a-table',
      headers: [createBlockNode('header')],
      range: DEFAULT_RANGE,
    } as unknown as BlockNode;
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(node, ['children', 0], (n, p) => {
      visited.push({ node: n, path: p });
    });

    expect(visited).toEqual([]);
  });

  it('should not traverse headers when headers is undefined on table node', () => {
    const table: TableNode = {
      type: 'table',
      headers: undefined as unknown as HeaderNode[],
      children: [],
      range: DEFAULT_RANGE,
    };
    const visited: Array<{ node: BlockNode; path: Path }> = [];

    traverseNodeChildren(
      table as unknown as BlockNode,
      ['children', 0],
      (n, p) => {
        visited.push({ node: n, path: p });
      },
    );

    expect(visited).toEqual([]);
  });
});

describe('fn:buildRefMap', () => {
  it('should index nodes by their ref values', () => {
    const child1 = createParagraph('first', { ref: 'ref-1' });
    const child2 = createParagraph('second', { ref: 'ref-2' });
    const doc = createDocumentNode([child1, child2]);

    const refMap = buildRefMap(doc);

    expect(refMap.get('ref-1')).toEqual({
      node: child1,
      path: ['children', 0],
    });
    expect(refMap.get('ref-2')).toEqual({
      node: child2,
      path: ['children', 1],
    });
  });

  it('should index nested children with correct paths', () => {
    const nested = createParagraph('nested', { ref: 'nested-ref' });
    const parent: BlockNode = {
      ...createBlockNode('container', 'parent-ref'),
      children: [nested],
    };
    const doc = createDocumentNode([parent]);

    const refMap = buildRefMap(doc);

    expect(refMap.get('parent-ref')).toEqual({
      node: parent,
      path: ['children', 0],
    });
    expect(refMap.get('nested-ref')).toEqual({
      node: nested,
      path: ['children', 0, 'children', 0],
    });
  });

  it('should skip nodes without refs', () => {
    const withRef = createParagraph('with ref', { ref: 'has-ref' });
    const withoutRef = createParagraph('no ref');
    const doc = createDocumentNode([withRef, withoutRef]);

    const refMap = buildRefMap(doc);

    expect(refMap.size).toBe(1);
    expect(refMap.has('has-ref')).toBe(true);
  });
});

describe('fn:collectUnmatchedNodes', () => {
  it('should collect nodes not in matched refs set', () => {
    const matched = createParagraph('matched', { ref: 'matched-ref' });
    const unmatched = createParagraph('unmatched', { ref: 'unmatched-ref' });
    const doc = createDocumentNode([matched, unmatched]);
    const matchedRefs = new Set(['matched-ref']);

    const result = collectUnmatchedNodes(doc, matchedRefs);

    expect(result).toEqual([
      { node: unmatched, path: ['children', 1], index: 0 },
    ]);
  });

  it('should collect nodes without refs', () => {
    const withRef = createParagraph('with ref', { ref: 'some-ref' });
    const withoutRef = createParagraph('no ref');
    const doc = createDocumentNode([withRef, withoutRef]);
    const matchedRefs = new Set(['some-ref']);

    const result = collectUnmatchedNodes(doc, matchedRefs);

    expect(result).toEqual([
      { node: withoutRef, path: ['children', 1], index: 0 },
    ]);
  });

  it('should assign sequential global indices to unmatched nodes', () => {
    const node1 = createParagraph('first');
    const node2 = createParagraph('second');
    const node3 = createParagraph('third');
    const doc = createDocumentNode([node1, node2, node3]);

    const result = collectUnmatchedNodes(doc, new Set());

    expect(result).toEqual([
      { node: node1, path: ['children', 0], index: 0 },
      { node: node2, path: ['children', 1], index: 1 },
      { node: node3, path: ['children', 2], index: 2 },
    ]);
  });

  it('should collect nested unmatched children with correct indices', () => {
    const nested = createParagraph('nested');
    const parent: BlockNode = {
      ...createBlockNode('container'),
      children: [nested],
    };
    const doc = createDocumentNode([parent]);

    const result = collectUnmatchedNodes(doc, new Set());

    expect(result).toEqual([
      { node: parent, path: ['children', 0], index: 0 },
      { node: nested, path: ['children', 0, 'children', 0], index: 1 },
    ]);
  });

  it('should skip nested children that have matched refs', () => {
    const nestedMatched = createParagraph('nested matched', {
      ref: 'nested-matched',
    });
    const nestedUnmatched = createParagraph('nested unmatched', {
      ref: 'nested-unmatched',
    });
    const parent: BlockNode = {
      ...createBlockNode('container', 'parent-matched'),
      children: [nestedMatched, nestedUnmatched],
    };
    const doc = createDocumentNode([parent]);
    const matchedRefs = new Set(['parent-matched', 'nested-matched']);

    const result = collectUnmatchedNodes(doc, matchedRefs);

    expect(result).toEqual([
      {
        node: nestedUnmatched,
        path: ['children', 0, 'children', 1],
        index: 0,
      },
    ]);
  });
});

describe('fn:getChildrenByProperty', () => {
  it('should return children array for children property', () => {
    const child1 = createParagraph('first');
    const child2 = createParagraph('second');
    const node: BlockNode = {
      ...createBlockNode('container'),
      children: [child1, child2],
    };

    const result = getChildrenByProperty(node, 'children');

    expect(result).toEqual([child1, child2]);
  });

  it('should return headers array for headers property on table nodes', () => {
    const header1 = createBlockNode('header') as HeaderNode;
    const header2 = createBlockNode('header') as HeaderNode;
    const table = createTableNode([header1, header2]);

    const result = getChildrenByProperty(
      table as unknown as BlockNode,
      'headers',
    );

    expect(result).toEqual([header1, header2]);
  });

  it('should return undefined for unknown property', () => {
    const node = createParagraph('test');

    const result = getChildrenByProperty(node, 'unknown');

    expect(result).toBeUndefined();
  });

  it('should return undefined when children property does not exist', () => {
    const node = { type: 'empty', range: DEFAULT_RANGE } as BlockNode;

    const result = getChildrenByProperty(node, 'children');

    expect(result).toBeUndefined();
  });

  it('should return undefined for headers property on non-table nodes', () => {
    // node has 'headers' property but is not type: 'table'
    const node = {
      type: 'not-a-table',
      headers: [createBlockNode('header')],
      range: DEFAULT_RANGE,
    } as unknown as BlockNode;

    const result = getChildrenByProperty(node, 'headers');

    expect(result).toBeUndefined();
  });
});
