import { describe, expect, it } from 'vitest';

import { positionalStrategy } from '#differ/inference/positional';

import {
  createInferenceContext,
  createInferenceParagraph,
  createTrackedNode,
} from '../../fixtures/inference';

import type { TrackedNode } from '#differ/inference/types';
import type { BlockNode } from '#types/ast';

// ALIASES //

const createParagraph = createInferenceParagraph;
const createContext = createInferenceContext;

// TEST SUITES //

describe('positionalStrategy', () => {
  it('should have correct name and priority', () => {
    expect(positionalStrategy).toMatchObject({
      name: 'positional',
      priority: 1,
    });
  });

  describe('mt:infer', () => {
    it('should return null when no matched neighbors exist', () => {
      const oldNode = createTrackedNode(createParagraph('old', 'ref-1'), 0);
      const newNode = createTrackedNode(createParagraph('new'), 0);
      const context = createContext([oldNode], [newNode]);

      const result = positionalStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should return null when matched index has no corresponding match', () => {
      const oldNode = createTrackedNode(createParagraph('old', 'ref-1'), 0);
      const newPrev = createTrackedNode(createParagraph('prev'), 0);
      const newNode = createTrackedNode(createParagraph('new'), 1);
      const context = createContext([oldNode], [newPrev, newNode]);

      // simulate a matched index without an actual match entry
      context.matchedNewIndices.add(0);

      const result = positionalStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should scan backward to the nearest matched neighbor', () => {
      const oldMatch = createTrackedNode(createParagraph('match', 'ref-1'), 0);
      const newPrev = createTrackedNode(createParagraph('prev'), 0);
      const newUnmatched = createTrackedNode(createParagraph('gap'), 1);
      const newNode = createTrackedNode(createParagraph('new'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldMatch);

      const context = createContext(
        [oldMatch],
        [newPrev, newUnmatched, newNode],
        matches,
      );

      const result = positionalStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });
    it('should return null when multiple candidates in gap', () => {
      // old: [matched-prev, candidate1, candidate2, matched-next]
      // new: [matched-prev, unmatched-new, matched-next]
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldCandidate1 = createTrackedNode(
        createParagraph('candidate1', 'c1-ref'),
        1,
      );
      const oldCandidate2 = createTrackedNode(
        createParagraph('candidate2', 'c2-ref'),
        2,
      );
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 3);

      const newPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const newUnmatched = createTrackedNode(createParagraph('unmatched'), 1);
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldPrev);
      matches.set(2, oldNext);

      const context = createContext(
        [oldPrev, oldCandidate1, oldCandidate2, oldNext],
        [newPrev, newUnmatched, newNext],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      expect(result).toBeNull();
    });

    it('should skip a sparse old-node slot inside a positional gap', () => {
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);
      const oldNodes: TrackedNode[] = [];
      oldNodes[0] = oldPrev;
      oldNodes[2] = oldNext;

      const newPrev = createTrackedNode(createParagraph('prev'), 0);
      const newNode = createTrackedNode(createParagraph('candidate'), 1);
      const newNext = createTrackedNode(createParagraph('next'), 2);
      const context = createContext(
        oldNodes,
        [newPrev, newNode, newNext],
        new Map([
          [0, oldPrev],
          [2, oldNext],
        ]),
      );

      expect(positionalStrategy.infer(newNode, context)).toBeNull();
    });

    it('should match when exactly one candidate in gap', () => {
      // old: [matched-prev, candidate, matched-next]
      // new: [matched-prev, unmatched-new, matched-next]
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldCandidate = createTrackedNode(
        createParagraph('candidate text here', 'c-ref'),
        1,
      );
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const newPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const newUnmatched = createTrackedNode(
        createParagraph('candidate text here'),
        1,
      );
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldPrev);
      matches.set(2, oldNext);

      const context = createContext(
        [oldPrev, oldCandidate, oldNext],
        [newPrev, newUnmatched, newNext],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('c-ref');
      expect(result?.strategy).toBe('positional');
      expect(result?.score).toBeGreaterThanOrEqual(0.9);
    });

    it('should return null when content similarity is too low', () => {
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldCandidate = createTrackedNode(
        createParagraph('xyz', 'c-ref'),
        1,
      );
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const newPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const newUnmatched = createTrackedNode(createParagraph('abc'), 1);
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldPrev);
      matches.set(2, oldNext);

      const context = createContext(
        [oldPrev, oldCandidate, oldNext],
        [newPrev, newUnmatched, newNext],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      // very low similarity (0) is below 0.05 threshold
      expect(result).toBeNull();
    });

    it('should match when only a later next neighbor is matched', () => {
      const oldCandidate = createTrackedNode(
        createParagraph('candidate text here', 'c-ref'),
        0,
      );
      const oldFiller = createTrackedNode(createParagraph('filler'), 1);
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);
      const oldLater = createTrackedNode(
        createParagraph('later', 'later-ref'),
        3,
      );

      const newUnmatched = createTrackedNode(
        createParagraph('candidate text here'),
        0,
      );
      const newFiller = createTrackedNode(createParagraph('filler'), 1);
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);
      const newLater = createTrackedNode(
        createParagraph('later', 'later-ref'),
        3,
      );

      const matches = new Map<number, TrackedNode>();
      matches.set(2, oldNext);
      matches.set(3, oldLater);

      const context = createContext(
        [oldCandidate, oldFiller, oldNext, oldLater],
        [newUnmatched, newFiller, newNext, newLater],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('c-ref');
    });

    it('should stop when the shared similarity budget is exhausted', () => {
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldCandidate = createTrackedNode(
        createParagraph('candidate', 'candidate-ref'),
        1,
      );
      const newPrev = createTrackedNode(createParagraph('prev'), 0);
      const newNode = createTrackedNode(createParagraph('candidate'), 1);
      const context = createContext(
        [oldPrev, oldCandidate],
        [newPrev, newNode],
        new Map([[0, oldPrev]]),
      );
      context.similarityBudget.remainingComparisons = 0;

      expect(positionalStrategy.infer(newNode, context)).toBeNull();
    });

    it('should return null when next matched index has no entry', () => {
      const oldNode = createTrackedNode(createParagraph('old', 'ref-1'), 0);
      const newNode = createTrackedNode(createParagraph('new'), 0);
      const newNext = createTrackedNode(createParagraph('next'), 1);
      const context = createContext([oldNode], [newNode, newNext]);

      context.matchedNewIndices.add(1);

      const result = positionalStrategy.infer(newNode, context);

      expect(result).toBeNull();
    });

    it('should return null when gap candidates lack refs', () => {
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const oldCandidate = createTrackedNode(createParagraph('candidate'), 1);
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const newPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const newUnmatched = createTrackedNode(createParagraph('candidate'), 1);
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldPrev);
      matches.set(2, oldNext);

      const context = createContext(
        [oldPrev, oldCandidate, oldNext],
        [newPrev, newUnmatched, newNext],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      expect(result).toBeNull();
    });

    it('should handle nodes without inline content property', () => {
      const oldPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      // code node with content array
      const oldCandidate = createTrackedNode(
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
        1,
      );
      const oldNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const newPrev = createTrackedNode(createParagraph('prev', 'prev-ref'), 0);
      const newUnmatched = createTrackedNode(
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
        1,
      );
      const newNext = createTrackedNode(createParagraph('next', 'next-ref'), 2);

      const matches = new Map<number, TrackedNode>();
      matches.set(0, oldPrev);
      matches.set(2, oldNext);

      const context = createContext(
        [oldPrev, oldCandidate, oldNext],
        [newPrev, newUnmatched, newNext],
        matches,
      );

      const result = positionalStrategy.infer(newUnmatched, context);

      // both have matching content, types match
      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('code-ref');
    });
  });
});
