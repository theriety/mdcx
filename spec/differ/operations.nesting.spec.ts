import { describe, it, expect } from 'vitest';

import { OperationGenerator } from '#differ/operations';

import {
  createBlockNode,
  testRefGetter,
  testRefResolver,
} from '../fixtures/ast';
import { createAncestry, createPair } from '../fixtures/operations';

import type { MatchedPair } from '#differ/matcher';
import type { BlockNode } from '#types/ast';

// HELPERS //

const createNode = createBlockNode;

// TEST SUITES //

describe('cl:OperationGenerator', () => {
  describe('deep nesting parentRefs', () => {
    it('should include full parentRefs chain for deeply nested add operation', () => {
      const node = createNode('item');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0, 'children', 0, 'children', 0, 'children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(['list-1', 'item-1', 'list-2']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          parentRefs: ['list-1', 'item-1', 'list-2'],
        },
      ]);
    });

    it('should include full parentRefs chain for deeply nested remove operation', () => {
      const node = createNode('item');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: null,
          pathA: ['children', 0, 'children', 0, 'children', 0, 'children', 0],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry(['list-1', 'item-1', 'list-2']),
          ancestryB: null,
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'delete',
          parentRefs: ['list-1', 'item-1', 'list-2'],
        },
      ]);
    });

    it('should include full parentRefs chain for deeply nested modify operation', () => {
      const nodeA = {
        ...createNode('paragraph'),
        content: [{ type: 'text', text: 'old' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        content: [{ type: 'text', text: 'new' }],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0, 'children', 0, 'children', 0, 'children', 0],
          pathB: ['children', 0, 'children', 0, 'children', 0, 'children', 0],
          matchType: 'positional',
          ancestryA: createAncestry(['list-1', 'item-1', 'list-2']),
          ancestryB: createAncestry(['list-1', 'item-1', 'list-2']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const modifyOp = ops.find((o) => o.type === 'update');

      expect(modifyOp).toMatchObject({
        type: 'update',
        parentRefs: ['list-1', 'item-1', 'list-2'],
      });
    });

    it('should track complete fromParentRefs and toParentRefs in move from shallow to deep', () => {
      const node = createNode('paragraph', 'moved-para');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 0, 'children', 0, 'children', 0, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry(
            ['list-1', 'item-1', 'list-2'],
            'prev-sibling',
          ),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');

      expect(moveOp).toMatchObject({
        type: 'move',
        fromParentRefs: [],
        toParentRefs: ['list-1', 'item-1', 'list-2'],
        toAfterRef: 'prev-sibling',
      });
    });

    it('should track move between different branches at same depth', () => {
      const node = createNode('paragraph', 'moved-para');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0, 'children', 0],
          pathB: ['children', 1, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry(['branch-a']),
          ancestryB: createAncestry(['branch-b']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');

      expect(moveOp).toMatchObject({
        type: 'move',
        fromParentRefs: ['branch-a'],
        toParentRefs: ['branch-b'],
      });
    });
  });

  describe('virtual refs in parentRefs', () => {
    it('should include virtual refs in parentRefs for add operation', () => {
      const node = createNode('item');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0, 'children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(['#virtual123']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          parentRefs: ['#virtual123'],
        },
      ]);
    });

    it('should include mixed explicit and virtual refs in parentRefs', () => {
      const node = createNode('item');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0, 'children', 0, 'children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(['explicit-ref', '#virtual456']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          parentRefs: ['explicit-ref', '#virtual456'],
        },
      ]);
    });

    it('should include virtual afterRef in add operation', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 1],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry([], '#virtual-sibling'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          parentRefs: [],
          afterRef: '#virtual-sibling',
        },
      ]);
    });

    it('should include virtual refs in fromParentRefs and toParentRefs for move', () => {
      const node = createNode('paragraph', 'moved');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0, 'children', 0],
          pathB: ['children', 1, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry(['#virtual-from']),
          ancestryB: createAncestry(['#virtual-to'], '#virtual-after'),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');

      expect(moveOp).toMatchObject({
        type: 'move',
        fromParentRefs: ['#virtual-from'],
        toParentRefs: ['#virtual-to'],
        toAfterRef: '#virtual-after',
      });
    });
  });
});
