import { describe, it, expect } from 'vitest';

import { getUnmatchedOldNodesWithRefs } from '#differ/inference/utilities';
import { extractTextContent } from '#differ/text';

import {
  createInferenceContext,
  createTrackedNode,
} from '../../fixtures/inference';

import type { BlockNode } from '#types/ast';

// TEST SUITES //

describe('inference utils', () => {
  it('should ignore inline nodes without raw content', () => {
    const tracked = createTrackedNode(
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'meta' },
        ] as unknown as BlockNode['content'],
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 6, offset: 5 },
        },
      } as BlockNode,
      0,
    );

    expect(extractTextContent(tracked.node)).toBe('hello');
  });

  it('should return only unmatched old nodes with refs', () => {
    const nodeWithRef = createTrackedNode(
      {
        type: 'paragraph',
        ref: 'ref-1',
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 4, offset: 3 },
        },
      } as BlockNode,
      0,
    );
    const nodeWithoutRef = createTrackedNode(
      {
        type: 'paragraph',
        children: [],
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 4, offset: 3 },
        },
      } as BlockNode,
      1,
    );

    const context = createInferenceContext([nodeWithRef, nodeWithoutRef], []);
    context.matchedOldIndices.add(0);

    expect(getUnmatchedOldNodesWithRefs(context)).toEqual([]);
  });
});
