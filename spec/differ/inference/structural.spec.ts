import { describe, expect, it } from 'vitest';

import { structuralStrategy } from '#differ/inference/structural';

import {
  createInferenceContext,
  createInferenceHeading,
  createInferenceParagraph,
  createTrackedNode,
} from '../../fixtures/inference';

import type { BlockNode } from '#types/ast';

// ALIASES //

const createParagraph = createInferenceParagraph;
const createHeading = createInferenceHeading;
const createContext = createInferenceContext;

// TEST SUITES //

describe('structuralStrategy', () => {
  it('should have correct name and priority', () => {
    expect(structuralStrategy).toMatchObject({
      name: 'structural',
      priority: 3,
    });
  });

  describe('mt:infer', () => {
    it('should match when exactly one candidate of same type exists', () => {
      // old has one heading with ref, one paragraph
      const oldHeading = createTrackedNode(
        createHeading('Title', 1, 'h-ref'),
        0,
      );
      const oldParagraph = createTrackedNode(
        createParagraph('content', 'p-ref'),
        1,
      );

      // new has heading without ref
      const newHeading = createTrackedNode(
        createHeading('Title Modified', 1),
        0,
      );

      const context = createContext([oldHeading, oldParagraph], [newHeading]);

      const result = structuralStrategy.infer(newHeading, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('h-ref');
      expect(result?.strategy).toBe('structural');
      expect(result?.score).toBeGreaterThanOrEqual(0.7);
      expect(result?.score).toBeLessThanOrEqual(0.9);
    });

    it('should return null when multiple candidates of same type exist', () => {
      // old has two headings with refs
      const oldHeading1 = createTrackedNode(
        createHeading('Title 1', 1, 'h1-ref'),
        0,
      );
      const oldHeading2 = createTrackedNode(
        createHeading('Title 2', 1, 'h2-ref'),
        1,
      );

      // new has heading without ref - ambiguous
      const newHeading = createTrackedNode(createHeading('Title', 1), 0);

      const context = createContext([oldHeading1, oldHeading2], [newHeading]);

      const result = structuralStrategy.infer(newHeading, context);

      // ambiguous - should not match
      expect(result).toBeNull();
    });

    it('should return null when no candidates of same type exist', () => {
      // old only has paragraphs
      const oldParagraph = createTrackedNode(
        createParagraph('content', 'p-ref'),
        0,
      );

      // new has heading - no matching type
      const newHeading = createTrackedNode(createHeading('Title', 1), 0);

      const context = createContext([oldParagraph], [newHeading]);

      const result = structuralStrategy.infer(newHeading, context);

      expect(result).toBeNull();
    });

    it('should return null when content similarity is too low', () => {
      const oldHeading = createTrackedNode(createHeading('xyz', 1, 'h-ref'), 0);
      const newHeading = createTrackedNode(createHeading('abc', 1), 0);

      const context = createContext([oldHeading], [newHeading]);

      const result = structuralStrategy.infer(newHeading, context);

      // single char content has low similarity
      expect(result).toBeNull();
    });

    it('should skip already matched candidates', () => {
      const oldHeading = createTrackedNode(
        createHeading('Title', 1, 'h-ref'),
        0,
      );
      const newHeading = createTrackedNode(createHeading('Title', 1), 0);

      const context = createContext([oldHeading], [newHeading]);
      context.matchedOldIndices.add(0);

      const result = structuralStrategy.infer(newHeading, context);

      expect(result).toBeNull();
    });

    it('should handle nodes without inline content property', () => {
      // code node with content array
      const oldNode = createTrackedNode(
        {
          type: 'code',
          ref: 'code-ref',
          language: 'js',
          content: [
            {
              type: 'text',
              text: 'const x = 1;',
              range: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 4, offset: 3 },
              },
            },
          ],
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
        } as BlockNode,
        0,
      );
      const newNode = createTrackedNode(
        {
          type: 'code',
          language: 'js',
          content: [
            {
              type: 'text',
              text: 'const x = 1;',
              range: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 4, offset: 3 },
              },
            },
          ],
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
        } as BlockNode,
        0,
      );

      const context = createContext([oldNode], [newNode]);

      const result = structuralStrategy.infer(newNode, context);

      // both have matching content and same type, should match
      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('code-ref');
    });

    it('should stop when the shared similarity budget is exhausted', () => {
      const oldHeading = createTrackedNode(
        createHeading('Title', 1, 'heading-ref'),
        0,
      );
      const newHeading = createTrackedNode(createHeading('Title', 1), 0);
      const context = createContext([oldHeading], [newHeading]);
      context.similarityBudget.remainingComparisons = 0;

      expect(structuralStrategy.infer(newHeading, context)).toBeNull();
    });
  });
});
