import { describe, it, expect } from 'vitest';

import { OperationGenerator } from '#differ/operations';

import {
  createBlockNode,
  testRefGetter,
  testRefResolver,
} from '../fixtures/ast';
import { createAncestry, createPair } from '../fixtures/operations';

import type { MatchedPair } from '#differ/matcher';

// HELPERS //

const createNode = createBlockNode;

// TEST SUITES //

describe('cl:OperationGenerator', () => {
  describe('edge cases', () => {
    it('should skip processing when paths are null but ancestry exists', () => {
      // this tests the early return in #processMatchedPair when paths are incomplete
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'a');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry([]),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // should not generate any operations when paths are incomplete
      expect(ops).toHaveLength(0);
    });

    it('should skip processing when ancestry is null but paths exist', () => {
      // this tests handling when ancestry context is missing
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'a');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: null,
          ancestryB: createAncestry([]),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // should not generate any operations when ancestry is incomplete
      expect(ops).toHaveLength(0);
    });

    it('should handle first child with deleted sibling that was never a predecessor', () => {
      // scenario: A (first child) stays first, B is deleted
      // tests the first-child edge case where siblingIdx is 0
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: nodeA,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]), // no afterRef (first child)
          ancestryB: createAncestry([]), // still no afterRef
        }),
        createPair({
          nodeA: nodeB,
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'a'),
          ancestryB: null,
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // Only deletion, no move for A since it was and remains first
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ type: 'delete', ref: 'b' });
    });
  });

  describe('spurious move filtering', () => {
    it('should NOT generate move when single predecessor was deleted', () => {
      // scenario: A, B, C -> A, C (B deleted)
      // C's afterRef changes from 'b' to 'a', but expected is 'a' after deletion
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const nodeC = createNode('heading', 'c');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: nodeA,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry([]),
        }),
        createPair({
          nodeA: nodeB,
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'a'),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeC,
          nodeB: nodeC,
          pathA: ['children', 2],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([], 'b'),
          ancestryB: createAncestry([], 'a'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ type: 'delete', ref: 'b' });
    });

    it('should NOT generate move when multiple predecessors were deleted', () => {
      // scenario: A, B, C, D -> A, D (B and C deleted)
      // D's afterRef changes from 'c' to 'a', expected is 'a' after deletions
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const nodeC = createNode('paragraph', 'c');
      const nodeD = createNode('heading', 'd');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: nodeA,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry([]),
        }),
        createPair({
          nodeA: nodeB,
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'a'),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeC,
          nodeB: null,
          pathA: ['children', 2],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'b'),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeD,
          nodeB: nodeD,
          pathA: ['children', 3],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([], 'c'),
          ancestryB: createAncestry([], 'a'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toHaveLength(2);
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'b' }),
      );
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'c' }),
      );
      expect(ops).not.toContainEqual(expect.objectContaining({ type: 'move' }));
    });

    it('should generate move when node moved AND predecessor deleted', () => {
      // scenario: A, B, C, D -> D, A, C (B deleted, D moved to front)
      // D's old afterRef was 'c', new afterRef is undefined
      // Expected afterRef after B deletion is 'c' (C survives), but D is now first
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const nodeC = createNode('paragraph', 'c');
      const nodeD = createNode('heading', 'd');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: nodeA,
          pathA: ['children', 0],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry([], 'd'),
        }),
        createPair({
          nodeA: nodeB,
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'a'),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeC,
          nodeB: nodeC,
          pathA: ['children', 2],
          pathB: ['children', 2],
          matchType: 'ref',
          ancestryA: createAncestry([], 'b'),
          ancestryB: createAncestry([], 'a'),
        }),
        createPair({
          nodeA: nodeD,
          nodeB: nodeD,
          pathA: ['children', 3],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([], 'c'),
          ancestryB: createAncestry([]),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'b' }),
      );
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'move', ref: 'd' }),
      );
    });

    it('should NOT generate move when afterRef unchanged (same predecessor)', () => {
      const node = createNode('heading', 'intro');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 2],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([], 'sibling-a'),
          ancestryB: createAncestry([], 'sibling-a'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toHaveLength(0);
    });

    it('should generate move when afterRef differs and old afterRef NOT deleted', () => {
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const nodeC = createNode('heading', 'c');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: nodeA,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry([]),
        }),
        createPair({
          nodeA: nodeB,
          nodeB,
          pathA: ['children', 1],
          pathB: ['children', 2],
          matchType: 'ref',
          ancestryA: createAncestry([], 'a'),
          ancestryB: createAncestry([], 'c'),
        }),
        createPair({
          nodeA: nodeC,
          nodeB: nodeC,
          pathA: ['children', 2],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([], 'b'),
          ancestryB: createAncestry([], 'a'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // B's afterRef changed from 'a' to 'c', and 'a' not deleted = genuine move
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'move', ref: 'b' }),
      );
    });

    it('should generate move when parentRefs differ (moved to different container)', () => {
      const node = createNode('heading', 'intro');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0, 'children', 0],
          pathB: ['children', 1, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry(['container-a']),
          ancestryB: createAncestry(['container-b']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(expect.objectContaining({ type: 'move' }));
    });

    it('should NOT generate move when all predecessors deleted and node becomes first', () => {
      // scenario: A, B, C -> C (A and B deleted)
      // C was after B, now first child (afterRef undefined)
      // Expected afterRef after deletions: undefined (all predecessors gone)
      const nodeA = createNode('paragraph', 'a');
      const nodeB = createNode('paragraph', 'b');
      const nodeC = createNode('heading', 'c');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB: null,
          pathA: ['children', 0],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([]),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeB,
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry([], 'a'),
          ancestryB: null,
        }),
        createPair({
          nodeA: nodeC,
          nodeB: nodeC,
          pathA: ['children', 2],
          pathB: ['children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([], 'b'),
          ancestryB: createAncestry([]),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toHaveLength(2);
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'a' }),
      );
      expect(ops).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'b' }),
      );
      expect(ops).not.toContainEqual(expect.objectContaining({ type: 'move' }));
    });
  });
});
