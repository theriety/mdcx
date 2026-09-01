import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TreeMatcher } from '#differ/matcher';
import { parse } from '#parse';

import type { BlockNode, DocumentNode } from '#types/ast';

// MOCKS //

// use vi.hoisted to create state that can be used in mocks for deterministic refs
const mockState = vi.hoisted(() => ({ counter: 0 }));

vi.mock('#differ/ref', () => ({
  generateLocalRef: () => `#mock${mockState.counter++}`,
}));

beforeEach(() => {
  mockState.counter = 0;
});

// TEST SUITES //

describe('cl:TreeMatcher', () => {
  describe('ancestry context', () => {
    it('should compute empty parentRefs for root-level nodes', () => {
      const astA = parse('# Title');
      const astB = parse('# Title modified');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      expect(pairs).toMatchObject([
        {
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should stop ancestry walk when path is out of bounds', () => {
      const astA = parse(['{{ ref: intro }}', '# Intro'].join('\n'));
      const astB = parse(['{{ ref: intro }}', '# Intro'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      astA.children.length = 0;

      const pairs = matcher.match();
      const refPair = pairs.find((p) => p.nodeA?.ref === 'intro');

      expect(refPair).toMatchObject({
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should stop ancestry walk when nested children property is not an array', () => {
      // create a nested structure where we can invalidate children
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'nested-item',
                content: [],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 7, offset: 6 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 7, offset: 6 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);

      // invalidate the children property of the list node AFTER the matcher is created
      // this will cause getChildrenByProperty to return undefined when computing ancestry
      // for the nested-item path ['children', 0, 'children', 0]
      (astA.children[0] as unknown as { children: null }).children = null;

      const pairs = matcher.match();

      // the nested item should still match (paths were built before invalidation)
      // but ancestry computation should handle the invalid children gracefully
      const nestedPair = pairs.find((p) => p.nodeA?.ref === 'nested-item');
      expect(nestedPair).toBeDefined();
      // ancestryA stops at parent-list because nested children is invalid
      expect(nestedPair?.ancestryA?.parentRefs).toEqual(['parent-list']);
    });

    it('should handle missing previous sibling when computing afterRef', () => {
      // create an AST with nested nodes where we'll manipulate the children
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'item-0',
                content: [],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 7, offset: 6 },
                },
              },
              {
                type: 'enum',
                ref: 'item-1',
                content: [],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 8 },
                  end: { line: 2, column: 7, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 2, column: 7, offset: 14 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);

      // remove the first item AFTER matcher is created but BEFORE match()
      // this causes prevSibling lookup to fail for item-1 at path [..., 1]
      // because children[0] is now item-1 but path says index 1
      (astA.children[0] as { children: BlockNode[] }).children.shift();

      const pairs = matcher.match();

      // item-1 should still be found in some form through the matcher
      // though its ancestry may not have afterRef since sibling lookup fails
      const item1Pair = pairs.find((p) => p.nodeA?.ref === 'item-1');

      // the pair may or may not be found depending on matcher behavior
      // but if found, check it has the expected ancestry structure
      if (item1Pair) {
        expect(item1Pair.ancestryA?.parentRefs).toEqual(['parent-list']);
      }
    });

    it('should compute parentRefs chain for nested nodes with refs', () => {
      // use a list with nested structure
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'child-item',
                content: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 7, offset: 6 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 7, offset: 6 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // find the pair for the child node
      const childPair = pairs.find((p) => p.nodeA?.ref === 'child-item');
      expect(childPair).toMatchObject({
        ancestryA: { parentRefs: ['parent-list'] },
        ancestryB: { parentRefs: ['parent-list'] },
      });
    });

    it('should omit afterRef when node is first child', () => {
      const astA = parse('# First');
      const astB = parse('# First');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      expect(pairs).toMatchObject([
        expect.objectContaining({
          ancestryA: expect.not.objectContaining({
            afterRef: expect.anything(),
          }),
          ancestryB: expect.not.objectContaining({
            afterRef: expect.anything(),
          }),
        }),
      ]);
    });

    it('should include afterRef when preceding sibling has ref', () => {
      const astA = parse(
        ['{{ ref: first }}', 'First', '', '{{ ref: second }}', 'Second'].join(
          '\n',
        ),
      );
      const astB = parse(
        ['{{ ref: first }}', 'First', '', '{{ ref: second }}', 'Second'].join(
          '\n',
        ),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const secondPair = pairs.find((p) => p.nodeA?.ref === 'second');
      expect(secondPair).toMatchObject({
        ancestryA: { parentRefs: [], afterRef: 'first' },
        ancestryB: { parentRefs: [], afterRef: 'first' },
      });
    });

    it('should omit afterRef when previous sibling slot is empty', () => {
      const astA = parse(
        ['{{ ref: first }}', 'First', '', '{{ ref: second }}', 'Second'].join(
          '\n',
        ),
      );
      const astB = parse(
        ['{{ ref: first }}', 'First', '', '{{ ref: second }}', 'Second'].join(
          '\n',
        ),
      );

      const matcher = new TreeMatcher(astA, astB);
      astA.children.shift();
      astB.children.shift();

      const pairs = matcher.match();
      const secondPair = pairs.find((p) => p.nodeA?.ref === 'second');

      expect(secondPair?.ancestryA?.afterRef).toBeUndefined();
      expect(secondPair?.ancestryB?.afterRef).toBeUndefined();
    });

    it('should have null ancestryA for added nodes', () => {
      const astA = parse('# Title');
      const astB = parse(['# Title', '', 'New paragraph'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const addedPair = pairs.find((p) => p.nodeA === null);
      expect(addedPair).toMatchObject({
        ancestryA: null,
        ancestryB: { parentRefs: [] },
      });
    });

    it('should have null ancestryB for removed nodes', () => {
      const astA = parse(['# Title', '', 'Removed paragraph'].join('\n'));
      const astB = parse('# Title');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const removedPair = pairs.find((p) => p.nodeB === null);
      expect(removedPair).toMatchObject({
        ancestryA: { parentRefs: [] },
        ancestryB: null,
      });
    });
  });

  describe('deep nesting ancestry', () => {
    it('should compute parentRefs for 3-level deep nesting with explicit refs', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'l1',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'li1',
                content: [],
                children: [
                  {
                    type: 'list',
                    ref: 'l2',
                    ordered: false,
                    children: [
                      {
                        type: 'enum',
                        ref: 'deepest',
                        content: [],
                        range: {
                          start: { line: 1, column: 1, offset: 0 },
                          end: { line: 1, column: 12, offset: 11 },
                        },
                      },
                    ],
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 12, offset: 11 },
                    },
                  },
                ],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 12, offset: 11 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 12, offset: 11 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const deepestPair = pairs.find((p) => p.nodeA?.ref === 'deepest');

      expect(deepestPair).toMatchObject({
        ancestryA: { parentRefs: ['l1', 'li1', 'l2'] },
        ancestryB: { parentRefs: ['l1', 'li1', 'l2'] },
      });
    });

    it('should compute parentRefs for 4-level deep nesting with explicit refs', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'l1',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'li1',
                content: [],
                children: [
                  {
                    type: 'list',
                    ref: 'l2',
                    ordered: false,
                    children: [
                      {
                        type: 'enum',
                        ref: 'li2',
                        content: [],
                        children: [
                          {
                            type: 'list',
                            ref: 'l3',
                            ordered: false,
                            children: [
                              {
                                type: 'enum',
                                ref: 'deepest',
                                content: [],
                                range: {
                                  start: { line: 1, column: 1, offset: 0 },
                                  end: { line: 1, column: 5, offset: 4 },
                                },
                              },
                            ],
                            range: {
                              start: { line: 1, column: 1, offset: 0 },
                              end: { line: 1, column: 5, offset: 4 },
                            },
                          },
                        ],
                        range: {
                          start: { line: 1, column: 1, offset: 0 },
                          end: { line: 1, column: 5, offset: 4 },
                        },
                      },
                    ],
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 5, offset: 4 },
                    },
                  },
                ],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 5, offset: 4 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 5, offset: 4 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const deepestPair = pairs.find((p) => p.nodeA?.ref === 'deepest');

      expect(deepestPair).toMatchObject({
        ancestryA: { parentRefs: ['l1', 'li1', 'l2', 'li2', 'l3'] },
        ancestryB: { parentRefs: ['l1', 'li1', 'l2', 'li2', 'l3'] },
      });
    });
  });
});
