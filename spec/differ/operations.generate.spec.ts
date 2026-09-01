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
  describe('generate', () => {
    it('should generate add operation for new nodes', () => {
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: createNode('paragraph'),
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'insert',
          parentRefs: [],
        }),
      );
    });

    it('should generate remove operation for deleted nodes', () => {
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: createNode('paragraph'),
          nodeB: null,
          pathA: ['children', 0],
          pathB: null,
          matchType: 'removed',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'delete',
          parentRefs: [],
        }),
      );
    });

    it('should generate move operation for repositioned nodes', () => {
      const node = createNode('heading', 'intro');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry([]), // was first (no afterRef)
          ancestryB: createAncestry([], 'new-first'), // now after new-first
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'move',
          fromParentRefs: [],
          toParentRefs: [],
        }),
      );
    });

    it('should generate modify operation for changed content', () => {
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

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'update',
          parentRefs: [],
        }),
      );
    });

    it('should preserve ref when modifying nodes with explicit refs', () => {
      const nodeA = {
        ...createNode('paragraph', 'ref-1'),
        content: [{ type: 'text', text: 'old' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph', 'ref-1'),
        content: [{ type: 'text', text: 'new' }],
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

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'update',
          ref: 'ref-1',
        }),
      );
    });

    it('should generate virtual ref when modifying nodes without explicit refs', () => {
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
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const modifyOp = ops.find((op) => op.type === 'update');
      expect(modifyOp?.ref).toMatch(/^#[a-z0-9]+$/);
    });

    it('should not generate operation for unchanged nodes', () => {
      const node = createNode('heading');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
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

    it('should generate modify operation for changed annotations', () => {
      const nodeA = {
        ...createNode('paragraph'),
        annotations: { status: 'draft' },
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        annotations: { status: 'published' },
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

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'update',
          parentRefs: [],
        }),
      );
    });

    it('should handle multiple operations', () => {
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: createNode('paragraph'),
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
        }),
        createPair({
          nodeA: createNode('heading'),
          nodeB: null,
          pathA: ['children', 1],
          pathB: null,
          matchType: 'removed',
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
        expect.objectContaining({
          type: 'insert',
          parentRefs: [],
        }),
      );
      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'delete',
          parentRefs: [],
        }),
      );
    });

    it('should include node in add operation', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const addOp = ops.find((o) => o.type === 'insert');
      expect(addOp).toMatchObject({
        type: 'insert',
        path: ['children', 0],
        node,
        parentRefs: [],
      });
    });

    it('should include paths in move operation', () => {
      const node = createNode('heading', 'ref1');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 2],
          matchType: 'ref',
          ancestryA: createAncestry([]), // was first (no afterRef)
          ancestryB: createAncestry([], 'sibling-b'), // now after sibling-b
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
        ref: 'ref1',
        from: ['children', 0],
        to: ['children', 2],
        fromParentRefs: [],
        toParentRefs: [],
      });
    });

    it('should detect move when paths have different lengths', () => {
      const node = createNode('heading', 'nested');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 0, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry([]),
          ancestryB: createAncestry(['parent-ref']), // different parent = genuine move
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'move',
          fromParentRefs: [],
          toParentRefs: ['parent-ref'],
        }),
      );
    });

    it('should detect changes in code property for code blocks', () => {
      // change detection now compares all properties (except range and children)
      // so code property changes are detected
      const nodeA = {
        ...createNode('code'),
        code: 'const x = 1;',
      } as BlockNode;
      const nodeB = {
        ...createNode('code'),
        code: 'const x = 2;',
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

      // code property change is detected as an update
      expect(ops).toContainEqual(expect.objectContaining({ type: 'update' }));
    });

    it('should handle content with non-text items', () => {
      const nodeA = {
        ...createNode('paragraph'),
        content: [
          { type: 'text', text: 'hello' },
          { type: 'link', href: 'http://example.com' },
        ],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        content: [
          { type: 'text', text: 'hello' },
          { type: 'link', href: 'http://different.com' },
        ],
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

      expect(ops).toContainEqual(
        expect.objectContaining({
          type: 'update',
          parentRefs: [],
        }),
      );
    });

    it('should skip pairs where paths are null but nodes exist', () => {
      const nodeA = createNode('heading');
      const nodeB = createNode('heading');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: null,
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

    it('should include ref in add operation when node has ref', () => {
      const node = createNode('paragraph', 'my-ref');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
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
          ref: 'my-ref',
          parentRefs: [],
        },
      ]);
    });

    it('should include ref in remove operation when node has ref', () => {
      const node = createNode('paragraph', 'my-ref');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: null,
          pathA: ['children', 0],
          pathB: null,
          matchType: 'removed',
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
          ref: 'my-ref',
          parentRefs: [],
        },
      ]);
    });

    it('should include ref in modify operation when node has ref', () => {
      const nodeA = {
        ...createNode('paragraph', 'my-ref'),
        content: [{ type: 'text', text: 'old' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph', 'my-ref'),
        content: [{ type: 'text', text: 'new' }],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
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
          type: 'update',
          ref: 'my-ref',
          parentRefs: [],
        },
      ]);
    });

    it('should include old and new BlockNodes in modify operation', () => {
      const nodeA = {
        ...createNode('paragraph'),
        content: [{ type: 'text', text: 'old content' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        content: [{ type: 'text', text: 'new content' }],
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toMatchObject({
        type: 'update',
        old: nodeA,
        new: nodeB,
        parentRefs: [],
      });
    });

    it('should include from and to delta fields in modify operation', () => {
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toHaveProperty('from');
      expect(modifyOp).toHaveProperty('to');
      expect(modifyOp).toHaveProperty('parentRefs', []);
    });

    it('should compute correct delta for changed content', () => {
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toMatchObject({
        type: 'update',
        parentRefs: [],
      });
      if (modifyOp?.type === 'update') {
        expect(modifyOp.from).toMatchObject({
          content: [{ type: 'text', text: 'old' }],
        });
        expect(modifyOp.to).toMatchObject({
          content: [{ type: 'text', text: 'new' }],
        });
      }
    });

    it('should compute correct delta for changed annotations', () => {
      const nodeA = {
        ...createNode('paragraph'),
        annotations: { status: 'draft' },
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        annotations: { status: 'published' },
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toMatchObject({
        type: 'update',
        parentRefs: [],
      });
      if (modifyOp?.type === 'update') {
        expect(modifyOp.from).toMatchObject({
          annotations: { status: 'draft' },
        });
        expect(modifyOp.to).toMatchObject({
          annotations: { status: 'published' },
        });
      }
    });

    it('should generate virtual ref for positionally matched nodes without explicit ref', () => {
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toHaveProperty('ref');
      expect(modifyOp).toHaveProperty('parentRefs', []);
      if (modifyOp?.type === 'update' && modifyOp.ref) {
        expect(modifyOp.ref).toMatch(/^#[a-z0-9]+$/);
      }
    });

    it('should not generate virtual ref for ref-matched nodes', () => {
      const nodeA = {
        ...createNode('paragraph', 'explicit-ref'),
        content: [{ type: 'text', text: 'old' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph', 'explicit-ref'),
        content: [{ type: 'text', text: 'new' }],
      } as BlockNode;
      const pairs: MatchedPair[] = [
        createPair({
          nodeA,
          nodeB,
          pathA: ['children', 0],
          pathB: ['children', 0],
          matchType: 'ref',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toHaveProperty('ref', 'explicit-ref');
      expect(modifyOp).toHaveProperty('parentRefs', []);
    });

    it('should use explicit ref over virtual ref when node has ref', () => {
      const nodeA = {
        ...createNode('paragraph', 'my-explicit-ref'),
        content: [{ type: 'text', text: 'old' }],
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph', 'my-explicit-ref'),
        content: [{ type: 'text', text: 'new' }],
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toHaveProperty('ref', 'my-explicit-ref');
      expect(modifyOp).toHaveProperty('parentRefs', []);
    });

    it('should exclude position from delta computation', () => {
      const nodeA = {
        ...createNode('paragraph'),
        annotations: { status: 'old' },
      } as BlockNode;
      const nodeB = {
        ...createNode('paragraph'),
        annotations: { status: 'new' },
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

      const modifyOp = ops.find((o) => o.type === 'update');
      expect(modifyOp).toMatchObject({
        type: 'update',
        parentRefs: [],
      });
      if (modifyOp?.type === 'update') {
        expect(modifyOp.from).not.toHaveProperty('position');
        expect(modifyOp.to).not.toHaveProperty('position');
        expect(modifyOp.to).toMatchObject({ annotations: { status: 'new' } });
      }
    });

    it('should include parentRefs in add operation', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0, 'children', 1],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(['parent-ref']),
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
          parentRefs: ['parent-ref'],
        },
      ]);
    });

    it('should include afterRef in add operation when provided', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 1],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry([], 'sibling-ref'),
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
          afterRef: 'sibling-ref',
        },
      ]);
    });

    it('should omit afterRef in add operation when not provided', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(),
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
        },
      ]);
      expect(ops[0]).not.toHaveProperty('afterRef');
    });

    it('should include parentRefs in remove operation', () => {
      const node = createNode('paragraph');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: null,
          pathA: ['children', 0, 'children', 1],
          pathB: null,
          matchType: 'removed',
          ancestryA: createAncestry(['parent-ref']),
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
          parentRefs: ['parent-ref'],
        },
      ]);
    });

    it('should include parentRefs in modify operation', () => {
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
          pathA: ['children', 0, 'children', 1],
          pathB: ['children', 0, 'children', 1],
          matchType: 'positional',
          ancestryA: createAncestry(['old-parent']),
          ancestryB: createAncestry(['new-parent']),
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
        parentRefs: ['new-parent'],
      });
    });

    it('should include fromParentRefs and toParentRefs in move operation', () => {
      const node = createNode('heading', 'moved-node');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 1, 'children', 0],
          matchType: 'ref',
          ancestryA: createAncestry(['from-parent']),
          ancestryB: createAncestry(['to-parent'], 'sibling-before'),
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
        fromParentRefs: ['from-parent'],
        toParentRefs: ['to-parent'],
        toAfterRef: 'sibling-before',
      });
    });

    it('should omit toAfterRef in move operation when not provided', () => {
      const node = createNode('heading', 'moved-node');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry(['old-parent']), // different parents = genuine move
          ancestryB: createAncestry(['new-parent']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: testRefGetter,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');
      expect(moveOp).not.toHaveProperty('toAfterRef');
      expect(moveOp).toMatchObject({
        type: 'move',
        fromParentRefs: ['old-parent'],
        toParentRefs: ['new-parent'],
      });
    });
  });

  describe('virtual ref getter', () => {
    it('should include virtual ref in insert operation when provided by getter', () => {
      const node = createNode('paragraph');
      const virtualRef = '#abc123';
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => virtualRef,
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          ref: virtualRef,
          parentRefs: [],
        },
      ]);
    });

    it('should prefer explicit ref over virtual ref in insert operation', () => {
      const node = createNode('paragraph', 'explicit-ref');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: node,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => '#virtual-ref',
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'insert',
          ref: 'explicit-ref',
          parentRefs: [],
        },
      ]);
    });

    it('should use resolver virtual ref in delete operation', () => {
      const node = createNode('paragraph');
      const virtualRef = '#def456';
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: null,
          pathA: ['children', 0],
          pathB: null,
          matchType: 'removed',
        }),
      ];
      const resolveVirtualRef = (): string => virtualRef;

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => '#getter-ref',
        resolveVirtualRef,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'delete',
          ref: virtualRef,
          parentRefs: [],
        },
      ]);
    });

    it('should prefer explicit ref over resolver virtual ref in delete operation', () => {
      const node = createNode('paragraph', 'explicit-ref');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: null,
          pathA: ['children', 0],
          pathB: null,
          matchType: 'removed',
        }),
      ];
      const resolveVirtualRef = (): string => '#resolved-ref';

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => '#virtual-ref',
        resolveVirtualRef,
      });
      const ops = generator.generate();

      expect(ops).toMatchObject([
        {
          type: 'delete',
          ref: 'explicit-ref',
          parentRefs: [],
        },
      ]);
    });

    it('should use source resolver virtual ref in move operation', () => {
      const sourceNode = createNode('heading');
      const targetNode = createNode('heading');
      const sourceVirtualRef = '#source-ref';
      const targetVirtualRef = '#target-ref';
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: sourceNode,
          nodeB: targetNode,
          pathA: ['children', 0],
          pathB: ['children', 1],
          matchType: 'positional',
          ancestryA: createAncestry(['old-parent']),
          ancestryB: createAncestry(['new-parent']),
        }),
      ];
      const resolveVirtualRef = (node: BlockNode): string =>
        node === sourceNode ? sourceVirtualRef : targetVirtualRef;

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => '#getter-ref',
        resolveVirtualRef,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');
      expect(moveOp).toMatchObject({
        type: 'move',
        ref: sourceVirtualRef,
        fromParentRefs: ['old-parent'],
        toParentRefs: ['new-parent'],
      });
    });

    it('should prefer explicit ref over resolver virtual ref in move operation', () => {
      const node = createNode('heading', 'explicit-ref');
      const pairs: MatchedPair[] = [
        createPair({
          nodeA: node,
          nodeB: node,
          pathA: ['children', 0],
          pathB: ['children', 1],
          matchType: 'ref',
          ancestryA: createAncestry(['old-parent']),
          ancestryB: createAncestry(['new-parent']),
        }),
      ];
      const resolveVirtualRef = (): string => '#resolved-ref';

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: () => '#virtual-ref',
        resolveVirtualRef,
      });
      const ops = generator.generate();

      const moveOp = ops.find((o) => o.type === 'move');
      expect(moveOp).toMatchObject({
        type: 'move',
        ref: 'explicit-ref',
        fromParentRefs: ['old-parent'],
        toParentRefs: ['new-parent'],
      });
    });

    it('should call virtual ref getter with correct node for each operation', () => {
      const parentNode = createNode('bullet');
      const childNode = createNode('paragraph');
      const virtualRefMap = new Map<BlockNode, string>([
        [parentNode, '#parent-virtual'],
        [childNode, '#child-virtual'],
      ]);

      const pairs: MatchedPair[] = [
        createPair({
          nodeA: null,
          nodeB: parentNode,
          pathA: null,
          pathB: ['children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry([]),
        }),
        createPair({
          nodeA: null,
          nodeB: childNode,
          pathA: null,
          pathB: ['children', 0, 'children', 0],
          matchType: 'added',
          ancestryA: null,
          ancestryB: createAncestry(['#parent-virtual']),
        }),
      ];

      const generator = new OperationGenerator({
        pairs,
        getVirtualRef: (node) => virtualRefMap.get(node),
        resolveVirtualRef: testRefResolver,
      });
      const ops = generator.generate();

      const parentInsert = ops.find(
        (o) => o.type === 'insert' && o.path.length === 2,
      );
      const childInsert = ops.find(
        (o) => o.type === 'insert' && o.path.length === 4,
      );

      expect(parentInsert).toMatchObject({
        type: 'insert',
        ref: '#parent-virtual',
        parentRefs: [],
      });
      expect(childInsert).toMatchObject({
        type: 'insert',
        ref: '#child-virtual',
        parentRefs: ['#parent-virtual'],
      });
    });
  });
});
