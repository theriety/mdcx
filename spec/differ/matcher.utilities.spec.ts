import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInferenceContext } from '#differ/inference/index';
import { matchByInference } from '#differ/matcher/remaining';

import { createParagraph } from '../fixtures/ast';
import { createTrackedNode } from '../fixtures/inference';

import type { AncestryContext } from '#differ/matcher/types';
import type { DocumentNode, BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

// MOCKS //

const mockInferenceResults = vi.hoisted(() => ({
  results: [] as Array<{
    newNode: { node: BlockNode; path: Path; index: number };
    oldNode: { node: BlockNode; path: Path; index: number };
    result: { score: number; strategy: string };
  }>,
}));

vi.mock('#differ/inference/index', async (importActual) => ({
  ...(await importActual<typeof import('#differ/inference/index')>()),
  matchByInference: () => mockInferenceResults.results,
}));

beforeEach(() => {
  mockInferenceResults.results = [];
});

// HELPERS //

const createDocument = (children: BlockNode[]): DocumentNode => ({
  type: 'document',
  children,
});

const computeAncestry = (): AncestryContext => ({
  parentRefs: [],
});

// TEST SUITES //

describe('fn:matchByInference', () => {
  it('should call registerMatchRef when oldNode has ref', () => {
    const oldNode = createParagraph('content', { ref: 'old-ref' });
    const newNode = createParagraph('content');
    const oldTracked = createTrackedNode(oldNode, 0);
    const newTracked = createTrackedNode(newNode, 0);
    const context = createInferenceContext([oldTracked], [newTracked]);
    const registerMatchRef = vi.fn();
    const astA = createDocument([oldNode]);
    const astB = createDocument([newNode]);

    mockInferenceResults.results = [
      {
        newNode: newTracked,
        oldNode: oldTracked,
        result: { score: 0.9, strategy: 'content' },
      },
    ];

    const pairs = matchByInference(context, {
      astA,
      astB,
      computeAncestry,
      registerMatchRef,
    });

    expect(pairs).toHaveLength(1);
    expect(registerMatchRef).toHaveBeenCalledWith(oldNode, newNode);
  });

  it('should call registerMatchRef for all inference-matched pairs', () => {
    const oldNode = createParagraph('content');
    const newNode = createParagraph('content');
    const oldTracked = createTrackedNode(oldNode, 0);
    const newTracked = createTrackedNode(newNode, 0);
    const context = createInferenceContext([oldTracked], [newTracked]);
    const registerMatchRef = vi.fn();
    const astA = createDocument([oldNode]);
    const astB = createDocument([newNode]);

    mockInferenceResults.results = [
      {
        newNode: newTracked,
        oldNode: oldTracked,
        result: { score: 0.9, strategy: 'content' },
      },
    ];

    const pairs = matchByInference(context, {
      astA,
      astB,
      computeAncestry,
      registerMatchRef,
    });

    expect(pairs).toHaveLength(1);
    expect(registerMatchRef).toHaveBeenCalledWith(oldNode, newNode);
  });

  it('should preserve a sparse target index in an inference result', () => {
    const oldNode = createParagraph('content');
    const newNode = createParagraph('content');
    const oldTracked = createTrackedNode(oldNode, 0);
    const newTracked = createTrackedNode(newNode, 1);
    const context = createInferenceContext([oldTracked], [newTracked]);
    const registerMatchRef = vi.fn();

    mockInferenceResults.results = [
      {
        newNode: newTracked,
        oldNode: oldTracked,
        result: { score: 0.9, strategy: 'content' },
      },
    ];

    const pairs = matchByInference(context, {
      astA: createDocument([oldNode]),
      astB: createDocument([newNode]),
      computeAncestry,
      registerMatchRef,
    });

    expect(pairs).toMatchObject([
      {
        nodeA: oldNode,
        nodeB: newNode,
        pathA: oldTracked.path,
        pathB: newTracked.path,
      },
    ]);
    expect(registerMatchRef).toHaveBeenCalledWith(oldNode, newNode);
  });
});
