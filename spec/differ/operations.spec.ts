import { describe, it, expect } from 'vitest';

import { OperationGenerator } from '#differ/operations';

import {
  createBlockNode,
  testRefGetter,
  testRefResolver,
} from '../fixtures/ast';
import { createPair } from '../fixtures/operations';

import type { MatchedPair } from '#differ/matcher';
import type { BlockNode } from '#types/ast';

// HELPERS //

const createNode = createBlockNode;

// TEST SUITES //

describe('cl:OperationGenerator', () => {
  describe('ambiguous table/layout type changes', () => {
    it('should not generate update when table with undefined headers changes to layout', () => {
      const nodeA = {
        ...createNode('table'),
        headers: undefined,
        children: [],
      } as BlockNode;
      const nodeB = {
        ...createNode('layout'),
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
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

    it('should not generate update when layout changes to table with undefined headers', () => {
      const nodeA = {
        ...createNode('layout'),
        children: [],
      } as BlockNode;
      const nodeB = {
        ...createNode('table'),
        headers: undefined,
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
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

    it('should not generate update when table with empty headers array changes to layout', () => {
      const nodeA = {
        ...createNode('table'),
        headers: [],
        children: [],
      } as BlockNode;
      const nodeB = {
        ...createNode('layout'),
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
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

    it('should generate update when table with actual headers changes to layout', () => {
      const nodeA = {
        ...createNode('table'),
        headers: [
          {
            type: 'header',
            content: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 10, offset: 9 },
            },
          },
        ],
        children: [],
      } as BlockNode;
      const nodeB = {
        ...createNode('layout'),
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(expect.objectContaining({ type: 'update' }));
    });

    it('should generate update when layout changes to table with actual headers', () => {
      const nodeA = {
        ...createNode('layout'),
        children: [],
      } as BlockNode;
      const nodeB = {
        ...createNode('table'),
        headers: [
          {
            type: 'header',
            content: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 10, offset: 9 },
            },
          },
        ],
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(expect.objectContaining({ type: 'update' }));
    });

    it('should not detect child content changes at parent level for ambiguous type pairs', () => {
      // children are excluded from comparison to ensure changes are detected
      // at the appropriate granularity level (child level, not parent level)
      const range = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      };
      const nodeA = {
        ...createNode('table'),
        headers: undefined,
        children: [
          {
            type: 'row',
            children: [
              {
                type: 'cell',
                content: [{ type: 'text', text: 'old', range }],
                range,
              },
            ],
            range,
          },
        ],
      } as unknown as BlockNode;
      const nodeB = {
        ...createNode('layout'),
        children: [
          {
            type: 'column',
            children: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'new', range }],
                range,
              },
            ],
            range,
          },
        ],
      } as unknown as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // no update at parent level - child changes should be detected via separate child pairs
      expect(ops).toHaveLength(0);
    });

    it('should detect headers change when same type but one has headers and one does not', () => {
      const range = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      };
      const nodeA = {
        ...createNode('table'),
        headers: [{ type: 'header', content: [], range }],
        children: [],
      } as unknown as BlockNode;
      const nodeB = {
        ...createNode('table'),
        headers: undefined,
        children: [],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(expect.objectContaining({ type: 'update' }));
    });

    it('should return empty content for nodes without content or children properties', () => {
      // create minimal node without content or children to exercise fallback path
      const range = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      };
      const nodeWithoutContentOrChildren = {
        type: 'thematic-break',
        range,
      } as BlockNode;
      const nodeB = {
        type: 'thematic-break',
        annotations: { changed: true },
        range,
      } as unknown as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: nodeWithoutContentOrChildren,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'positional',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      // should generate update due to annotations change (content extraction returns [])
      expect(ops).toContainEqual(expect.objectContaining({ type: 'update' }));
    });
  });
});
