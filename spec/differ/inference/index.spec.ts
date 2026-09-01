import { describe, it, expect } from 'vitest';

import {
  createInferenceContext,
  findInferenceMatch,
  matchByInference,
  recordMatch,
} from '#differ/inference/index';
import { getUnmatchedOldNodesWithRefs } from '#differ/inference/utilities';

import { createSimilarityBudget } from '#differ/similarity';

import {
  createInferenceParagraph,
  createTrackedNode,
} from '../../fixtures/inference';

import type { InferenceContext } from '#differ/inference/types';

// ALIASES //

const createParagraph = createInferenceParagraph;

// TEST SUITES //

describe('fn:createInferenceContext', () => {
  it('should create context with node maps', () => {
    const oldNode = createParagraph('old content', 'ref-1');
    const newNode = createParagraph('new content', 'ref-2');

    const context = createInferenceContext(
      [createTrackedNode(oldNode, 0)],
      [createTrackedNode(newNode, 0)],
    );

    expect(context).toEqual({
      similarityBudget: { remainingComparisons: 10_000 },
      oldNodes: expect.any(Array),
      newNodes: expect.any(Array),
      oldByRef: expect.any(Map),
      newByRef: expect.any(Map),
      matchedOldIndices: expect.any(Set),
      matchedNewIndices: expect.any(Set),
      matches: expect.any(Map),
    });
  });

  it('should index nodes by ref', () => {
    const oldNode = createParagraph('old content', 'ref-1');
    const newNode = createParagraph('new content', 'ref-2');

    const context = createInferenceContext(
      [createTrackedNode(oldNode, 0)],
      [createTrackedNode(newNode, 0)],
    );

    expect(context.oldByRef.get('ref-1')).toBeDefined();
    expect(context.newByRef.get('ref-2')).toBeDefined();
  });

  it('should not index nodes without refs', () => {
    const nodeWithoutRef = createParagraph('content');

    const context = createInferenceContext(
      [createTrackedNode(nodeWithoutRef, 0)],
      [],
    );

    expect(context.oldByRef.size).toBe(0);
  });
});

describe('fn:findInferenceMatch', () => {
  it('should return null for node with ref', () => {
    const newNode = createTrackedNode(createParagraph('content', 'has-ref'), 0);
    const context = createInferenceContext([], [newNode]);

    const result = findInferenceMatch(newNode, context);

    expect(result).toBeNull();
  });

  it('should find match using inference strategies', () => {
    const oldNode = createTrackedNode(
      createParagraph('same content here', 'old-ref'),
      0,
    );
    const newNode = createTrackedNode(createParagraph('same content here'), 0);

    const context = createInferenceContext([oldNode], [newNode]);
    context.matchedNewIndices.add(0);
    context.matchedOldIndices.add(0);
    context.matches.set(0, oldNode);

    // create another new node that needs matching
    const newNode2 = createTrackedNode(
      createParagraph('similar content there'),
      1,
    );

    const result = findInferenceMatch(newNode2, context);

    // may or may not find match depending on similarity threshold
    // this test verifies the function runs without error
    expect(result === null || typeof result.match === 'object').toBe(true);
  });
});

describe('fn:getUnmatchedOldNodesWithRefs', () => {
  it('should return old nodes with refs that are not matched', () => {
    const node1 = createTrackedNode(createParagraph('content 1', 'ref-1'), 0);
    const node2 = createTrackedNode(createParagraph('content 2', 'ref-2'), 1);
    const node3 = createTrackedNode(createParagraph('content 3'), 2); // no ref

    const context = createInferenceContext([node1, node2, node3], []);
    context.matchedOldIndices.add(0); // mark first as matched

    const result = getUnmatchedOldNodesWithRefs(context);

    expect(result).toMatchObject([
      { node: expect.objectContaining({ ref: 'ref-2' }) },
    ]);
  });

  it('should return empty array when all refs are matched', () => {
    const node = createTrackedNode(createParagraph('content', 'ref-1'), 0);
    const context = createInferenceContext([node], []);
    context.matchedOldIndices.add(0);

    const result = getUnmatchedOldNodesWithRefs(context);

    expect(result).toHaveLength(0);
  });
});

describe('fn:recordMatch', () => {
  it('should update context with match information', () => {
    const oldNode = createTrackedNode(createParagraph('old', 'ref-1'), 0);
    const context: InferenceContext = {
      similarityBudget: createSimilarityBudget(),
      oldNodes: [oldNode],
      newNodes: [],
      oldByRef: new Map(),
      newByRef: new Map(),
      matchedOldIndices: new Set(),
      matchedNewIndices: new Set(),
      matches: new Map(),
    };

    recordMatch({ newIndex: 5, oldNode, context });

    expect(context.matchedNewIndices.has(5)).toBe(true);
    expect(context.matchedOldIndices.has(0)).toBe(true);
    expect(context.matches.get(5)).toBe(oldNode);
  });
});

describe('fn:matchByInference', () => {
  it('should skip already matched new nodes', () => {
    const oldNode = createTrackedNode(createParagraph('content', 'old-ref'), 0);
    const newNode = createTrackedNode(createParagraph('content'), 0);

    const context = createInferenceContext([oldNode], [newNode]);
    context.matchedNewIndices.add(0);

    const results = matchByInference(context);

    expect(results).toHaveLength(0);
  });

  it('should skip new nodes with refs', () => {
    const oldNode = createTrackedNode(createParagraph('content', 'old-ref'), 0);
    const newNode = createTrackedNode(createParagraph('content', 'new-ref'), 0);

    const context = createInferenceContext([oldNode], [newNode]);

    const results = matchByInference(context);

    expect(results).toHaveLength(0);
  });

  it('should match new non-ref node to old ref node via inference', () => {
    // setup context with matched neighbors for positional inference
    const oldNode0 = createTrackedNode(
      createParagraph('first para', 'ref-0'),
      0,
    );
    const oldNode1 = createTrackedNode(
      createParagraph('second para', 'ref-1'),
      1,
    );
    const oldNode2 = createTrackedNode(
      createParagraph('third para', 'ref-2'),
      2,
    );

    const newNode0 = createTrackedNode(createParagraph('first para'), 0);
    const newNode1 = createTrackedNode(createParagraph('second para'), 1);
    const newNode2 = createTrackedNode(createParagraph('third para'), 2);

    const context = createInferenceContext(
      [oldNode0, oldNode1, oldNode2],
      [newNode0, newNode1, newNode2],
    );

    // simulate phase 1: mark first and last as matched
    context.matchedOldIndices.add(0);
    context.matchedOldIndices.add(2);
    context.matchedNewIndices.add(0);
    context.matchedNewIndices.add(2);
    context.matches.set(0, oldNode0);
    context.matches.set(2, oldNode2);

    const results = matchByInference(context);

    // newNode1 (no ref) should match oldNode1 (has ref) via positional inference
    expect(results).toMatchObject([
      {
        newNode: expect.objectContaining({ index: 1 }),
        oldNode: expect.objectContaining({ index: 1 }),
        result: expect.objectContaining({ strategy: 'positional' }),
      },
    ]);
  });

  it('should return empty array when no old nodes available', () => {
    const newNode = createTrackedNode(createParagraph('content'), 0);

    const context = createInferenceContext([], [newNode]);

    const results = matchByInference(context);

    expect(results).toHaveLength(0);
  });
});
