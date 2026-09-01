import { describe, it, expect } from 'vitest';

import { contentStrategy } from '#differ/inference/content';

import {
  createInferenceContext,
  createInferenceHeading,
  createInferenceParagraph,
  createTrackedNode,
} from '../../fixtures/inference';

import type { BlockNode } from '#types/ast';

// ALIASES //

const createParagraph = createInferenceParagraph;
const createHeading = (text: string, ref?: string) =>
  createInferenceHeading(text, 1, ref);
const createContext = createInferenceContext;

// TEST SUITES //

describe('contentStrategy', () => {
  it('should have correct name and priority', () => {
    expect(contentStrategy).toMatchObject({ name: 'content', priority: 2 });
  });

  describe('mt:infer', () => {
    it('should return null for node without content', () => {
      const oldNode = createTrackedNode(
        createParagraph('some content', 'ref-1'),
        0,
      );
      const newNode = createTrackedNode(
        {
          type: 'paragraph',
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
        } as BlockNode,
        0,
      );

      const context = createContext([oldNode], [newNode]);

      const result = contentStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should match node with similar content', () => {
      const oldNode = createTrackedNode(
        createParagraph(
          'This is a long paragraph with lots of content here',
          'ref-1',
        ),
        0,
      );
      const newNode = createTrackedNode(
        createParagraph('This is a long paragraph with lots of content there'),
        0,
      );

      const context = createContext([oldNode], [newNode]);

      const result = contentStrategy.infer(newNode, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('ref-1');
      expect(result?.strategy).toBe('content');
      expect(result?.score).toBeGreaterThanOrEqual(0.6);
      expect(result?.score).toBeLessThanOrEqual(0.9);
    });

    it('should return null when content similarity is below threshold', () => {
      const oldNode = createTrackedNode(createParagraph('abc', 'ref-1'), 0);
      const newNode = createTrackedNode(createParagraph('xyz'), 0);

      const context = createContext([oldNode], [newNode]);

      const result = contentStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should only match nodes of same type', () => {
      const oldHeading = createTrackedNode(
        createHeading('Same text content here', 'ref-1'),
        0,
      );
      const newParagraph = createTrackedNode(
        createParagraph('Same text content here'),
        0,
      );

      const context = createContext([oldHeading], [newParagraph]);

      const result = contentStrategy.infer(newParagraph, context);

      expect(result).toBeNull();
    });

    it('should find best match among multiple candidates', () => {
      const oldLowMatch = createTrackedNode(
        createParagraph('completely different text', 'ref-1'),
        0,
      );
      const oldHighMatch = createTrackedNode(
        createParagraph(
          'This is a test paragraph with specific content',
          'ref-2',
        ),
        1,
      );
      const newNode = createTrackedNode(
        createParagraph(
          'This is a test paragraph with specific content modified',
        ),
        0,
      );

      const context = createContext([oldLowMatch, oldHighMatch], [newNode]);

      const result = contentStrategy.infer(newNode, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('ref-2');
    });

    it('should skip already matched nodes', () => {
      const oldNode = createTrackedNode(
        createParagraph('Similar content here', 'ref-1'),
        0,
      );
      const newNode = createTrackedNode(
        createParagraph('Similar content here'),
        0,
      );

      const context = createContext([oldNode], [newNode]);
      context.matchedOldIndices.add(0); // mark as already matched

      const result = contentStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should skip candidates without text content', () => {
      // old node has ref but empty content - should be skipped
      const oldNoContent = createTrackedNode(
        {
          type: 'paragraph',
          ref: 'ref-empty',
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
        } as BlockNode,
        0,
      );
      // old node with real content
      const oldWithContent = createTrackedNode(
        createParagraph('This has actual content here', 'ref-content'),
        1,
      );
      // new node with content that matches
      const newNode = createTrackedNode(
        createParagraph('This has actual content here'),
        0,
      );

      const context = createContext([oldNoContent, oldWithContent], [newNode]);

      const result = contentStrategy.infer(newNode, context);

      // should match the one with content, not the empty one
      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('ref-content');
    });

    it('should stop when the shared similarity budget is exhausted', () => {
      const oldNode = createTrackedNode(
        createParagraph('matching content', 'ref-1'),
        0,
      );
      const newNode = createTrackedNode(createParagraph('matching content'), 0);
      const context = createContext([oldNode], [newNode]);
      context.similarityBudget.remainingComparisons = 0;

      expect(contentStrategy.infer(newNode, context)).toBeNull();
    });
  });
});
