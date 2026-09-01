import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TreeMatcher } from '#differ/matcher';

import type { DocumentNode } from '#types/ast';

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
  describe('virtual refs for non-ref ancestors', () => {
    it('should generate virtual ref for ancestor without explicit ref', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'child-item',
                content: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 8, offset: 7 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 8, offset: 7 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const childPair = pairs.find((p) => p.nodeA?.ref === 'child-item');

      expect(childPair).toMatchObject({
        ancestryA: { parentRefs: ['#mock0'] },
        ancestryB: { parentRefs: ['#mock1'] },
      });
    });

    it('should generate virtual refs for multiple non-ref ancestors', () => {
      // structure: root -> list (no ref) -> item (no ref) -> nested list (no ref) -> deep-item (with ref)
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [],
                children: [
                  {
                    type: 'list',
                    ordered: false,
                    children: [
                      {
                        type: 'enum',
                        ref: 'deep-item',
                        content: [
                          {
                            type: 'text',
                            text: 'deep',
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

      const deepPair = pairs.find((p) => p.nodeA?.ref === 'deep-item');

      // 3 non-ref ancestors: outer list, item, nested list
      expect(deepPair).toMatchObject({
        ancestryA: { parentRefs: ['#mock0', '#mock1', '#mock2'] },
        ancestryB: { parentRefs: ['#mock3', '#mock4', '#mock5'] },
      });
    });

    it('should mix explicit and virtual refs in ancestry chain', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'outer-list',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [],
                children: [
                  {
                    type: 'list',
                    ref: 'inner-list',
                    ordered: false,
                    children: [
                      {
                        type: 'enum',
                        ref: 'deep-item',
                        content: [{ type: 'text', text: 'deep' }] as never,
                        children: [],
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

      const deepPair = pairs.find((p) => p.nodeA?.ref === 'deep-item');

      // outer-list has explicit ref, item gets virtual ref, inner-list has explicit ref
      expect(deepPair).toMatchObject({
        ancestryA: { parentRefs: ['outer-list', '#mock0', 'inner-list'] },
        ancestryB: { parentRefs: ['outer-list', '#mock1', 'inner-list'] },
      });
    });

    it('should use same virtual ref for same node across sibling operations', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'first-child',
                content: [{ type: 'text', text: 'first' }] as never,
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 6, offset: 5 },
                },
              },
              {
                type: 'enum',
                ref: 'second-child',
                content: [{ type: 'text', text: 'second' }] as never,
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 7 },
                  end: { line: 2, column: 7, offset: 13 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 2, column: 7, offset: 13 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const firstPair = pairs.find((p) => p.nodeA?.ref === 'first-child');
      const secondPair = pairs.find((p) => p.nodeA?.ref === 'second-child');

      // both should have same virtual ref for their parent (the list without explicit ref)
      expect(firstPair).toMatchObject({
        ancestryA: { parentRefs: ['#mock0'] },
        ancestryB: { parentRefs: ['#mock1'] },
      });
      expect(secondPair).toMatchObject({
        ancestryA: { parentRefs: ['#mock0'] },
        ancestryB: { parentRefs: ['#mock1'] },
      });
    });

    it('should generate virtual afterRef when preceding sibling has no ref', () => {
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'first' }] as never,
            children: [],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 6, offset: 5 },
            },
          },
          {
            type: 'paragraph',
            ref: 'second-para',
            content: [{ type: 'text', text: 'second' }] as never,
            children: [],
            range: {
              start: { line: 3, column: 1, offset: 7 },
              end: { line: 3, column: 7, offset: 13 },
            },
          },
        ],
      };
      const astB = structuredClone(astA);

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const secondPair = pairs.find((p) => p.nodeA?.ref === 'second-para');

      // afterRef should be virtual ref of first paragraph
      expect(secondPair).toMatchObject({
        ancestryA: { parentRefs: [], afterRef: '#mock0' },
        ancestryB: { parentRefs: [], afterRef: '#mock1' },
      });
    });
  });
});
