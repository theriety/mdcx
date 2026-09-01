import { describe, expect, it } from 'vitest';

import { TreeMatcher } from '#differ/matcher';
import { parse } from '#parse';

import { createParagraph } from '../fixtures/ast';

import type { DocumentNode } from '#types/ast';

// TEST SUITES //

describe('cl:TreeMatcher', () => {
  describe('mt:match', () => {
    it('should match nodes by ref attribute', () => {
      const astA = parse(
        ['{{ ref: intro }}', '# Intro', '', '{{ ref: body }}', 'Content'].join(
          '\n',
        ),
      );
      const astB = parse(
        ['{{ ref: body }}', 'Content', '', '{{ ref: intro }}', '# Intro'].join(
          '\n',
        ),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const introPair = pairs.find((p) => p.nodeA?.ref === 'intro');
      expect(introPair).toMatchObject({
        nodeA: expect.objectContaining({ ref: 'intro' }),
        nodeB: expect.objectContaining({ ref: 'intro' }),
        matchType: 'ref',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should fall back to positional matching without refs', () => {
      const astA = parse(['# Title', '', 'Paragraph'].join('\n'));
      const astB = parse(['# Title', '', 'Paragraph modified'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      expect(pairs).toMatchObject([
        {
          nodeA: expect.objectContaining({ type: 'heading' }),
          nodeB: expect.objectContaining({ type: 'heading' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
        {
          nodeA: expect.objectContaining({ type: 'paragraph' }),
          nodeB: expect.objectContaining({ type: 'paragraph' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should preserve a sole inference target after a filtered child gap', () => {
      const sharedChildA = createParagraph('Shared child');
      const sharedChildB = createParagraph('Shared child');
      const sharedParentA = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: [sharedChildA],
      };
      const sharedParentB = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: [sharedChildB],
      };
      const source = createParagraph('Candidate', { ref: 'candidate-ref' });
      const target = createParagraph('Candidate');
      const astA: DocumentNode = {
        type: 'document',
        children: [sharedParentA, source],
      };
      const astB: DocumentNode = {
        type: 'document',
        children: [sharedParentB, target],
      };

      const pairs = new TreeMatcher(astA, astB).match();

      expect(pairs).toContainEqual(
        expect.objectContaining({
          nodeA: source,
          nodeB: target,
          pathA: ['children', 1],
          pathB: ['children', 1],
        }),
      );
    });

    it('should preserve inference identities when a filtered gap has successors', () => {
      const sharedParentA = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: [createParagraph('Shared child')],
      };
      const sharedParentB = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: [createParagraph('Shared child')],
      };
      const sourceA = createParagraph('First candidate', { ref: 'first-ref' });
      const sourceB = createParagraph('Second candidate', {
        ref: 'second-ref',
      });
      const targetA = createParagraph('First candidate');
      const targetB = createParagraph('Second candidate');
      const astA: DocumentNode = {
        type: 'document',
        children: [sharedParentA, sourceA, sourceB],
      };
      const astB: DocumentNode = {
        type: 'document',
        children: [sharedParentB, targetA, targetB],
      };

      const pairs = new TreeMatcher(astA, astB).match();

      expect(pairs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeA: sourceA,
            nodeB: targetA,
            pathB: ['children', 1],
          }),
          expect.objectContaining({
            nodeA: sourceB,
            nodeB: targetB,
            pathB: ['children', 2],
          }),
        ]),
      );
    });

    it('should share one similarity budget across all matcher phases', () => {
      // 141 + 140 + ... + 1 = 10,011 comparisons, exceeding the 10,000 cap.
      const childCount = 141;
      const sourceChildren = Array.from(
        { length: childCount },
        (_value, index) => createParagraph(`Child ${index}`),
      );
      const targetChildren = Array.from(
        { length: childCount },
        (_value, index) => createParagraph(`Child ${childCount - index - 1}`),
      );
      const sharedParentA = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: sourceChildren,
      };
      const sharedParentB = {
        ...createParagraph('Shared parent', { ref: 'shared-parent' }),
        children: targetChildren,
      };
      const inferenceSource = createParagraph('Inference candidate', {
        ref: 'inference-candidate',
      });
      const inferenceTarget = createParagraph('Inference candidate');
      const sourceContainer = {
        ...createParagraph('Source container'),
        children: [inferenceSource, createParagraph('Source sibling')],
      };
      const astA: DocumentNode = {
        type: 'document',
        children: [sharedParentA, sourceContainer],
      };
      const astB: DocumentNode = {
        type: 'document',
        children: [sharedParentB, inferenceTarget],
      };

      const pairs = new TreeMatcher(astA, astB).match();

      expect(pairs).not.toContainEqual(
        expect.objectContaining({
          nodeA: inferenceSource,
          nodeB: inferenceTarget,
        }),
      );
      expect(pairs).toContainEqual(
        expect.objectContaining({
          nodeA: inferenceSource,
          nodeB: null,
          matchType: 'removed',
        }),
      );
      expect(pairs).toContainEqual(
        expect.objectContaining({
          nodeA: null,
          nodeB: inferenceTarget,
          matchType: 'added',
        }),
      );
    });

    it('should identify unmatched nodes as null', () => {
      const astA = parse(['# Title', '', 'Removed'].join('\n'));
      const astB = parse('# Title');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const removedPair = pairs.find(
        (p) => p.nodeB === null && p.nodeA !== null,
      );
      expect(removedPair).toMatchObject({
        nodeA: expect.objectContaining({ type: 'paragraph' }),
        nodeB: null,
        matchType: 'removed',
        ancestryA: { parentRefs: [] },
        ancestryB: null,
      });
    });

    it('should identify added nodes', () => {
      const astA = parse('# Title');
      const astB = parse(['# Title', '', 'Added'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const addedPair = pairs.find((p) => p.nodeA === null && p.nodeB !== null);
      expect(addedPair).toMatchObject({
        nodeA: null,
        nodeB: expect.objectContaining({ type: 'paragraph' }),
        matchType: 'added',
        ancestryA: null,
        ancestryB: { parentRefs: [] },
      });
    });

    it('should handle identical documents', () => {
      const ast = parse(['# Title', '', 'Paragraph'].join('\n'));

      const matcher = new TreeMatcher(ast, ast);
      const pairs = matcher.match();

      expect(pairs.every((p) => p.nodeA !== null && p.nodeB !== null)).toBe(
        true,
      );
      expect(
        pairs.every((p) => p.ancestryA !== null && p.ancestryB !== null),
      ).toBe(true);
    });

    it('should handle empty documents', () => {
      const astA = parse('');
      const astB = parse('');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      expect(pairs).toHaveLength(0);
    });

    it('should match nodes with same type when positions differ', () => {
      const astA = parse(['# First', '', '# Second'].join('\n'));
      const astB = parse(['# Second', '', '# First'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // without refs, positional matching is used
      expect(pairs).toMatchObject([
        {
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
        {
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should detect moved nodes with refs', () => {
      const astA = parse(
        ['{{ ref: a }}', 'First', '', '{{ ref: b }}', 'Second'].join('\n'),
      );
      const astB = parse(
        ['{{ ref: b }}', 'Second', '', '{{ ref: a }}', 'First'].join('\n'),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const pairA = pairs.find((p) => p.nodeA?.ref === 'a');
      expect(pairA).toMatchObject({
        pathA: ['children', 0],
        pathB: ['children', 1],
        matchType: 'ref',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [], afterRef: 'b' },
      });
    });

    it('should handle ref in A that does not exist in B', () => {
      const astA = parse(
        [
          '{{ ref: only-a }}',
          'Content A',
          '',
          '{{ ref: shared }}',
          'Shared',
        ].join('\n'),
      );
      const astB = parse(
        ['{{ ref: shared }}', 'Shared', '', 'New content'].join('\n'),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // ref 'only-a' node gets positionally matched to another paragraph since types match
      const onlyAPair = pairs.find((p) => p.nodeA?.ref === 'only-a');
      expect(onlyAPair).toMatchObject({
        nodeA: expect.objectContaining({ ref: 'only-a' }),
        nodeB: expect.objectContaining({ type: 'paragraph' }),
        matchType: 'positional',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [], afterRef: 'shared' },
      });
      // nodeB has no ref (undefined)
      expect(onlyAPair?.nodeB?.ref).toBeUndefined();

      // ref 'shared' should be matched
      const sharedPair = pairs.find((p) => p.nodeA?.ref === 'shared');
      expect(sharedPair).toMatchObject({
        nodeA: expect.objectContaining({ ref: 'shared' }),
        nodeB: expect.objectContaining({ ref: 'shared' }),
        matchType: 'ref',
        ancestryA: { parentRefs: [], afterRef: 'only-a' },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should handle ref in B that does not exist in A', () => {
      const astA = parse(['{{ ref: shared }}', 'Shared'].join('\n'));
      const astB = parse(
        [
          '{{ ref: shared }}',
          'Shared',
          '',
          '{{ ref: only-b }}',
          'Content B',
        ].join('\n'),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // ref 'only-b' should be added
      const onlyBPair = pairs.find(
        (p) => p.nodeA === null && p.nodeB?.ref === 'only-b',
      );
      expect(onlyBPair).toMatchObject({
        nodeA: null,
        nodeB: expect.objectContaining({ ref: 'only-b' }),
        matchType: 'added',
        ancestryA: null,
        ancestryB: { parentRefs: [], afterRef: 'shared' },
      });
    });

    it('should match different types as unmatched', () => {
      const astA = parse('# Heading');
      const astB = parse('Paragraph');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // different types should not match
      const removedHeading = pairs.find(
        (p) => p.nodeA?.type === 'heading' && p.nodeB === null,
      );
      const addedParagraph = pairs.find(
        (p) => p.nodeA === null && p.nodeB?.type === 'paragraph',
      );
      expect(removedHeading).toMatchObject({
        nodeA: expect.objectContaining({ type: 'heading' }),
        nodeB: null,
        matchType: 'removed',
        ancestryA: { parentRefs: [] },
        ancestryB: null,
      });
      expect(addedParagraph).toMatchObject({
        nodeA: null,
        nodeB: expect.objectContaining({ type: 'paragraph' }),
        matchType: 'added',
        ancestryA: null,
        ancestryB: { parentRefs: [] },
      });
    });

    it('should prefer matching nodes with similar content', () => {
      // single paragraph in each AST with similar content
      const astA = parse('Hello world this is a test');
      const astB = parse('Hello world this is a test modified');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should match based on content similarity
      expect(pairs).toMatchObject([
        {
          nodeA: expect.objectContaining({ type: 'paragraph' }),
          nodeB: expect.objectContaining({ type: 'paragraph' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should match code blocks without inline content by type', () => {
      // code blocks use raw content, not inline content like paragraphs
      const astA = parse(['```js', 'code here', '```'].join('\n'));
      const astB = parse(['```js', 'code here', '```'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // both are code type
      expect(pairs).toMatchObject([
        {
          nodeA: expect.objectContaining({ type: 'code' }),
          nodeB: expect.objectContaining({ type: 'code' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should match code blocks with different content', () => {
      const astA = parse(['```js', 'const a = 1;', '```'].join('\n'));
      const astB = parse(['```js', 'const b = 2;', '```'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // code blocks match by type (same language)
      expect(pairs).toMatchObject([
        {
          nodeA: expect.objectContaining({ type: 'code' }),
          nodeB: expect.objectContaining({ type: 'code' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should traverse table header cells', () => {
      // table with header and a row
      const astA = parse(['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n'));
      const astB = parse(['| A | B |', '|---|---|', '| 1 | 3 |'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should have table match
      const tablePair = pairs.find((p) => p.nodeA?.type === 'table');
      expect(tablePair).toMatchObject({
        nodeA: expect.objectContaining({ type: 'table' }),
        nodeB: expect.objectContaining({ type: 'table' }),
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should handle inline content with non-text nodes like links', () => {
      // paragraphs with links (link has href, not just text)
      const astA = parse('Hello [link](http://a.com) world');
      const astB = parse('Hello [link](http://b.com) world');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should match paragraphs with similar text content around links
      expect(pairs).toMatchObject([
        {
          nodeA: expect.objectContaining({ type: 'paragraph' }),
          nodeB: expect.objectContaining({ type: 'paragraph' }),
          matchType: 'positional',
          ancestryA: { parentRefs: [] },
          ancestryB: { parentRefs: [] },
        },
      ]);
    });

    it('should handle nested children with refs in deep structure', () => {
      // nested list with refs on inner items
      // with list wrapping: item with ref:'outer' is inside a list container
      // note: layout columns now parse content as full block structure,
      // so `- column A` becomes a bullet node with nested children
      const astA = parse(
        [
          '{{ ref: layout_ref }}',
          '| {{ ref: column_A_ref }} | {{ ref: column_B_ref }} |',
          '| - column A | - column B |',
          '|   nested item | |',
          'Other content',
        ].join('\n'),
      );
      const astB = parse(
        [
          '{{ ref: layout_ref }}',
          '| {{ ref: column_A_ref }} | {{ ref: column_B_ref }} |',
          '| - column A | - column B |',
          '|   nested item modified | |',
          'Other content',
        ].join('\n'),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // with recursive child matching, pairs are created at all levels:
      // - ref-matched pairs for layout, columns
      // - positionally-matched pairs for nested children (bullets, paragraphs)
      // use arrayContaining to verify key pairs are present
      expect(pairs).toEqual(
        expect.arrayContaining([
          // layout ref-matched
          expect.objectContaining({
            matchType: 'ref',
            nodeA: expect.objectContaining({
              ref: 'layout_ref',
              type: 'layout',
            }),
            nodeB: expect.objectContaining({
              ref: 'layout_ref',
              type: 'layout',
            }),
            pathA: ['children', 0],
            pathB: ['children', 0],
          }),
          // column_A ref-matched
          expect.objectContaining({
            matchType: 'ref',
            nodeA: expect.objectContaining({
              ref: 'column_A_ref',
              type: 'column',
            }),
            nodeB: expect.objectContaining({
              ref: 'column_A_ref',
              type: 'column',
            }),
            pathA: ['children', 0, 'children', 0],
            pathB: ['children', 0, 'children', 0],
          }),
          // column_B ref-matched
          expect.objectContaining({
            matchType: 'ref',
            nodeA: expect.objectContaining({
              ref: 'column_B_ref',
              type: 'column',
            }),
            nodeB: expect.objectContaining({
              ref: 'column_B_ref',
              type: 'column',
            }),
            pathA: ['children', 0, 'children', 1],
            pathB: ['children', 0, 'children', 1],
          }),
          // nested paragraph inside column_A (recursively matched)
          expect.objectContaining({
            matchType: 'positional',
            nodeA: expect.objectContaining({ type: 'paragraph' }),
            nodeB: expect.objectContaining({ type: 'paragraph' }),
          }),
          // "Other content" paragraph
          expect.objectContaining({
            matchType: 'positional',
            nodeA: expect.objectContaining({ type: 'paragraph' }),
            nodeB: expect.objectContaining({ type: 'paragraph' }),
            pathA: ['children', 1],
            pathB: ['children', 1],
          }),
        ]),
      );
    });

    it('should handle nested ref that exists in A but not matched', () => {
      // create AST where nested child has ref that doesn't exist in B
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'list-item-ref',
                content: [
                  {
                    type: 'text',
                    text: 'nested content',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 15, offset: 14 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 15, offset: 14 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            children: [
              {
                type: 'enum',
                // no ref - different from A
                content: [
                  {
                    type: 'text',
                    text: 'nested content',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 15, offset: 14 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 15, offset: 14 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should match list structure even with different ref status
      expect(pairs.length).toBeGreaterThan(0);

      // list should match with ancestry info
      const listPair = pairs.find((p) => p.nodeA?.type === 'list');
      expect(listPair).toMatchObject({
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should set matchType to ref for ref-matched pairs', () => {
      const astA = parse(['{{ ref: intro }}', '# Intro'].join('\n'));
      const astB = parse(['{{ ref: intro }}', '# Intro modified'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const refPair = pairs.find((p) => p.nodeA?.ref === 'intro');
      expect(refPair).toMatchObject({
        matchType: 'ref',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should generate shared virtual ref when matching paired children that both lack refs', () => {
      // ref-matched parent (layout_ref) drives child matching - both child
      // paragraphs inside the column have no ref, so registerMatchRef must
      // generate a shared virtual ref via the no-ref else branch
      const astA = parse(
        [
          '{{ ref: layout_ref }}',
          '| col A          | col B          |',
          '| paragraph one  | paragraph two  |',
          '| nested A       | nested B       |',
        ].join('\n'),
      );
      const astB = parse(
        [
          '{{ ref: layout_ref }}',
          '| col A          | col B          |',
          '| paragraph 1    | paragraph 2    |',
          '| nested AA      | nested BB      |',
        ].join('\n'),
      );

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // verify at least one positional pair was produced from inside the
      // ref-matched parent, and that the source side received a virtual ref
      // (the else-branch of registerMatchRef)
      const positionalPair = pairs.find(
        (pair) =>
          pair.matchType === 'positional' &&
          pair.nodeA !== null &&
          pair.nodeB !== null &&
          !pair.nodeA.ref &&
          !pair.nodeB.ref,
      );

      expect(positionalPair).toBeDefined();
      const virtualRef = matcher.getVirtualRef(positionalPair!.nodeA!);

      expect(virtualRef).toBeDefined();
      expect(matcher.getVirtuals().get(virtualRef!)).toBe(
        positionalPair!.nodeA,
      );
    });

    it('should set matchType to positional for positionally matched pairs', () => {
      const astA = parse(['# Title', '', 'Paragraph'].join('\n'));
      const astB = parse(['# Title', '', 'Paragraph modified'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // find a pair that was positionally matched (no ref on either node)
      const positionalPair = pairs.find(
        (p) => p.nodeA !== null && p.nodeB !== null && !p.nodeA.ref,
      );
      expect(positionalPair).toMatchObject({
        matchType: 'positional',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });
    });

    it('should set matchType to added for new nodes', () => {
      const astA = parse('# Title');
      const astB = parse(['# Title', '', 'Added paragraph'].join('\n'));

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const addedPair = pairs.find((p) => p.nodeA === null);
      expect(addedPair).toMatchObject({
        matchType: 'added',
        ancestryA: null,
        ancestryB: { parentRefs: [] },
      });
    });

    it('should set matchType to removed for deleted nodes', () => {
      const astA = parse(['# Title', '', 'Removed paragraph'].join('\n'));
      const astB = parse('# Title');

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      const removedPair = pairs.find((p) => p.nodeB === null);
      expect(removedPair).toMatchObject({
        matchType: 'removed',
        ancestryA: { parentRefs: [] },
        ancestryB: null,
      });
    });

    it('should handle nested child ref that is matched at top level', () => {
      // list item ref matched at top level but nested child ref is NOT matched
      // this tests the branch: !matchedRefs.has(child.ref)
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-list-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'nested-ref-only-in-a', // ref exists in A but NOT in B
                content: [
                  {
                    type: 'text',
                    text: 'nested',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 7, offset: 6 },
                    },
                  },
                ],
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
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-list-ref', // same parent ref, so parent will match
            ordered: false,
            children: [
              {
                type: 'enum',
                // ref: 'different-ref', // different or no ref
                content: [
                  {
                    type: 'text',
                    text: 'nested',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 7, offset: 6 },
                    },
                  },
                ],
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

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // parent list should match with ref, nested items collected as unmatched
      expect(pairs.length).toBeGreaterThan(0);

      // parent list matched by ref
      const parentPair = pairs.find((p) => p.nodeA?.ref === 'parent-list-ref');
      expect(parentPair).toMatchObject({
        matchType: 'ref',
        ancestryA: { parentRefs: [] },
        ancestryB: { parentRefs: [] },
      });

      // nested item should be positionally matched with ancestry pointing to parent
      const nestedPair = pairs.find(
        (p) => p.nodeA?.ref === 'nested-ref-only-in-a',
      );
      expect(nestedPair).toMatchObject({
        matchType: 'positional',
        ancestryA: { parentRefs: ['parent-list-ref'] },
        ancestryB: { parentRefs: ['parent-list-ref'] },
      });
    });

    it('should skip already-matched childB ref during recursive matching', () => {
      // scenario: childB has a ref that was already matched at top level
      // during recursive matching, the same child should be skipped
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'item 1',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 7, offset: 6 },
                    },
                  },
                ],
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
          {
            type: 'paragraph',
            ref: 'nested-in-b-ref',
            content: [
              {
                type: 'text',
                text: 'separate paragraph',
                range: {
                  start: { line: 2, column: 1, offset: 10 },
                  end: { line: 2, column: 20, offset: 29 },
                },
              },
            ],
            range: {
              start: { line: 2, column: 1, offset: 10 },
              end: { line: 2, column: 20, offset: 29 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'nested-in-b-ref',
                content: [
                  {
                    type: 'text',
                    text: 'item with ref',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 14, offset: 13 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 14, offset: 13 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 14, offset: 13 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // the ref 'nested-in-b-ref' should be matched as ref pair
      const refMatchedPair = pairs.find(
        (p) => p.nodeA?.ref === 'nested-in-b-ref',
      );
      expect(refMatchedPair).toMatchObject({
        matchType: 'ref',
        nodeB: expect.objectContaining({ ref: 'nested-in-b-ref' }),
      });
    });

    it('should mark removed children during recursive matching when A has more children', () => {
      // parent matches, but A has more children than B
      // triggers matchRemovedChild in the recursive loop
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'first',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 6, offset: 5 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 6, offset: 5 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'second',
                    range: {
                      start: { line: 2, column: 1, offset: 10 },
                      end: { line: 2, column: 7, offset: 16 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 10 },
                  end: { line: 2, column: 7, offset: 16 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'third to be removed',
                    range: {
                      start: { line: 3, column: 1, offset: 20 },
                      end: { line: 3, column: 20, offset: 39 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 3, column: 1, offset: 20 },
                  end: { line: 3, column: 20, offset: 39 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 3, column: 20, offset: 39 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'first modified',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 15, offset: 14 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 15, offset: 14 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should have removed pairs for the extra children in A
      const removedPairs = pairs.filter(
        (p) =>
          p.matchType === 'removed' &&
          p.nodeA?.type === 'enum' &&
          p.ancestryA?.parentRefs.includes('list-ref'),
      );
      expect(removedPairs).toHaveLength(2);
    });

    it('should mark added children during recursive matching when B has more children', () => {
      // parent matches, but B has more children than A
      // triggers matchAddedChild in the recursive loop
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'only item',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 10, offset: 9 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 10, offset: 9 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 10, offset: 9 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'only item modified',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 19, offset: 18 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 19, offset: 18 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'new item',
                    range: {
                      start: { line: 2, column: 1, offset: 20 },
                      end: { line: 2, column: 9, offset: 28 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 20 },
                  end: { line: 2, column: 9, offset: 28 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'another new item',
                    range: {
                      start: { line: 3, column: 1, offset: 30 },
                      end: { line: 3, column: 17, offset: 46 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 3, column: 1, offset: 30 },
                  end: { line: 3, column: 17, offset: 46 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 3, column: 17, offset: 46 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // should have added pairs for the extra children in B
      const addedPairs = pairs.filter(
        (p) =>
          p.matchType === 'added' &&
          p.nodeB?.type === 'enum' &&
          p.ancestryB?.parentRefs.includes('list-ref'),
      );
      expect(addedPairs).toHaveLength(2);
    });

    it('should mark descendants as matched when ref in A has no match in B', () => {
      // when a ref exists in A but not in B, all descendants with refs
      // and descendants without refs should both be marked as matched
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'only-in-a-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                ref: 'nested-child-ref',
                content: [
                  {
                    type: 'text',
                    text: 'nested with ref',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 16, offset: 15 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 16, offset: 15 },
                },
              },
              {
                type: 'enum',
                // no ref - exercises the false branch of if (child.ref)
                content: [
                  {
                    type: 'text',
                    text: 'nested without ref',
                    range: {
                      start: { line: 2, column: 1, offset: 20 },
                      end: { line: 2, column: 19, offset: 38 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 20 },
                  end: { line: 2, column: 19, offset: 38 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 2, column: 19, offset: 38 },
            },
          },
          {
            type: 'paragraph',
            ref: 'shared-ref',
            content: [
              {
                type: 'text',
                text: 'shared content',
                range: {
                  start: { line: 3, column: 1, offset: 40 },
                  end: { line: 3, column: 15, offset: 54 },
                },
              },
            ],
            range: {
              start: { line: 3, column: 1, offset: 40 },
              end: { line: 3, column: 15, offset: 54 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            ref: 'shared-ref',
            content: [
              {
                type: 'text',
                text: 'shared content',
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 15, offset: 14 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // shared ref should match
      const sharedPair = pairs.find((p) => p.nodeA?.ref === 'shared-ref');
      expect(sharedPair).toMatchObject({
        matchType: 'ref',
        nodeB: expect.objectContaining({ ref: 'shared-ref' }),
      });

      // 'only-in-a-ref' and its nested children should be handled
      // descendants are marked as matched internally so they don't create duplicate pairs
      const onlyInAPair = pairs.find((p) => p.nodeA?.ref === 'only-in-a-ref');
      expect(onlyInAPair).toMatchObject({
        matchType: 'removed',
        nodeB: null,
      });
    });

    it('should handle added children in recursive matching within ref pairs', () => {
      // test case: ref-matched list where B has more nested children than A
      // lists have proper children arrays that matchChildrenRecursively can traverse
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref-for-added',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'only child in A',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 16, offset: 15 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 16, offset: 15 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 16, offset: 15 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'list-ref-for-added',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'first child modified',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 21, offset: 20 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 21, offset: 20 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'added child in B',
                    range: {
                      start: { line: 2, column: 1, offset: 25 },
                      end: { line: 2, column: 17, offset: 41 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 25 },
                  end: { line: 2, column: 17, offset: 41 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 2, column: 17, offset: 41 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // list should match by ref
      const listPair = pairs.find((p) => p.nodeA?.ref === 'list-ref-for-added');
      expect(listPair).toMatchObject({
        matchType: 'ref',
        nodeB: expect.objectContaining({ ref: 'list-ref-for-added' }),
      });

      // should have an added pair for the extra enum in B
      const addedPairs = pairs.filter(
        (p) =>
          p.matchType === 'added' &&
          p.nodeB?.type === 'enum' &&
          p.ancestryB?.parentRefs.includes('list-ref-for-added'),
      );
      expect(addedPairs).toHaveLength(1);
    });

    it('should transfer ref via virtualRefMap when inference matches node with ref', () => {
      // scenario: three similar paragraphs where middle one has ref in A
      // first and last are identical, middle has slight diff
      // this ensures inference (not fallback) matches the middle paragraph
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            ref: 'first-ref',
            content: [
              {
                type: 'text',
                text: 'first paragraph identical',
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 26, offset: 25 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 26, offset: 25 },
            },
          },
          {
            type: 'paragraph',
            ref: 'middle-ref',
            content: [
              {
                type: 'text',
                text: 'middle paragraph with ref',
                range: {
                  start: { line: 2, column: 1, offset: 30 },
                  end: { line: 2, column: 26, offset: 55 },
                },
              },
            ],
            range: {
              start: { line: 2, column: 1, offset: 30 },
              end: { line: 2, column: 26, offset: 55 },
            },
          },
          {
            type: 'paragraph',
            ref: 'last-ref',
            content: [
              {
                type: 'text',
                text: 'last paragraph identical',
                range: {
                  start: { line: 3, column: 1, offset: 60 },
                  end: { line: 3, column: 25, offset: 84 },
                },
              },
            ],
            range: {
              start: { line: 3, column: 1, offset: 60 },
              end: { line: 3, column: 25, offset: 84 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            ref: 'first-ref',
            content: [
              {
                type: 'text',
                text: 'first paragraph identical',
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 26, offset: 25 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 26, offset: 25 },
            },
          },
          {
            type: 'paragraph',
            // no ref - will be matched via inference to middle-ref node
            content: [
              {
                type: 'text',
                text: 'middle paragraph with ref',
                range: {
                  start: { line: 2, column: 1, offset: 30 },
                  end: { line: 2, column: 26, offset: 55 },
                },
              },
            ],
            range: {
              start: { line: 2, column: 1, offset: 30 },
              end: { line: 2, column: 26, offset: 55 },
            },
          },
          {
            type: 'paragraph',
            ref: 'last-ref',
            content: [
              {
                type: 'text',
                text: 'last paragraph identical',
                range: {
                  start: { line: 3, column: 1, offset: 60 },
                  end: { line: 3, column: 25, offset: 84 },
                },
              },
            ],
            range: {
              start: { line: 3, column: 1, offset: 60 },
              end: { line: 3, column: 25, offset: 84 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // middle paragraph with ref should be matched positionally (via inference)
      // because first and last are ref-matched, middle is inferred
      const middlePair = pairs.find((p) => p.nodeA?.ref === 'middle-ref');
      expect(middlePair).toMatchObject({
        matchType: 'positional',
        nodeB: expect.objectContaining({ type: 'paragraph' }),
      });
    });

    it('should skip recursion for identical paired children and handle added children', () => {
      // scenario: ref-matched parent where first child is identical, but B has extra children
      // this covers:
      // - line 144 false branch (identical children skip recursion)
      // - line 259 true branch (added children in B)
      const astA: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'identical item',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 15, offset: 14 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 15, offset: 14 },
            },
          },
        ],
      };
      const astB: DocumentNode = {
        type: 'root',
        children: [
          {
            type: 'list',
            ref: 'parent-ref',
            ordered: false,
            children: [
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'identical item',
                    range: {
                      start: { line: 1, column: 1, offset: 0 },
                      end: { line: 1, column: 15, offset: 14 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 15, offset: 14 },
                },
              },
              {
                type: 'enum',
                content: [
                  {
                    type: 'text',
                    text: 'added item in B',
                    range: {
                      start: { line: 2, column: 1, offset: 20 },
                      end: { line: 2, column: 16, offset: 35 },
                    },
                  },
                ],
                children: [],
                range: {
                  start: { line: 2, column: 1, offset: 20 },
                  end: { line: 2, column: 16, offset: 35 },
                },
              },
            ],
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 2, column: 16, offset: 35 },
            },
          },
        ],
      };

      const matcher = new TreeMatcher(astA, astB);
      const pairs = matcher.match();

      // parent list should match by ref
      const parentPair = pairs.find((p) => p.nodeA?.ref === 'parent-ref');
      expect(parentPair).toMatchObject({
        matchType: 'ref',
        nodeA: expect.objectContaining({ ref: 'parent-ref' }),
        nodeB: expect.objectContaining({ ref: 'parent-ref' }),
      });

      // first child should be matched (identical content)
      const identicalChildPair = pairs.find(
        (p) =>
          p.matchType === 'positional' &&
          p.nodeA?.type === 'enum' &&
          p.nodeB?.type === 'enum',
      );
      expect(identicalChildPair).toBeDefined();

      // second child in B should be added
      const addedChildPair = pairs.find(
        (p) =>
          p.matchType === 'added' &&
          p.nodeB?.type === 'enum' &&
          p.ancestryB?.parentRefs.includes('parent-ref'),
      );
      expect(addedChildPair).toMatchObject({
        matchType: 'added',
        nodeA: null,
        nodeB: expect.objectContaining({ type: 'enum' }),
        ancestryB: expect.objectContaining({ parentRefs: ['parent-ref'] }),
      });
    });

    describe('similarity-based child matching', () => {
      it('should match rows by similarity when a new row is inserted at the beginning', () => {
        const astA = parse(
          [
            '| Col1 | Col2 |',
            '|------|------|',
            '| Apple | 1 |',
            '| Banana | 2 |',
            '| Cherry | 3 |',
          ].join('\n'),
        );
        const astB = parse(
          [
            '| Col1 | Col2 |',
            '|------|------|',
            '| New | 0 |',
            '| Apple | 1 |',
            '| Banana | 2 |',
            '| Cherry | 3 |',
          ].join('\n'),
        );

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // "New|0" row in B has no counterpart in A, so it should be added
        const addedRow = pairs.find(
          (p) =>
            p.matchType === 'added' &&
            p.nodeB?.type === 'row' &&
            p.nodeA === null,
        );
        expect(addedRow).toMatchObject({
          matchType: 'added',
          nodeA: null,
          nodeB: expect.objectContaining({ type: 'row' }),
        });

        // all three original rows should be matched positionally
        const matchedRows = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            p.nodeB?.type === 'row',
        );
        expect(matchedRows).toHaveLength(3);
      });

      it('should detect a removed row when the middle row is deleted', () => {
        const astA = parse(
          [
            '| Col1 | Col2 |',
            '|------|------|',
            '| Apple | 1 |',
            '| Banana | 2 |',
            '| Cherry | 3 |',
          ].join('\n'),
        );
        const astB = parse(
          [
            '| Col1 | Col2 |',
            '|------|------|',
            '| Apple | 1 |',
            '| Cherry | 3 |',
          ].join('\n'),
        );

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // "Banana|2" row in A has no counterpart in B, so it should be removed
        const removedRow = pairs.find(
          (p) =>
            p.matchType === 'removed' &&
            p.nodeA?.type === 'row' &&
            p.nodeB === null,
        );
        expect(removedRow).toMatchObject({
          matchType: 'removed',
          nodeA: expect.objectContaining({ type: 'row' }),
          nodeB: null,
        });

        // the remaining two rows should be matched positionally
        const matchedRows = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            p.nodeB?.type === 'row',
        );
        expect(matchedRows).toHaveLength(2);
      });

      it('should use partial refs as anchors while matching remaining rows by similarity', () => {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        };

        const astA: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  ref: 'row-a',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Apple', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Banana', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  ref: 'row-c',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Cherry', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };
        const astB: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  ref: 'row-a',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Apple', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'New', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '0', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Banana', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  ref: 'row-c',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Cherry', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // row-a and row-c should be ref-matched by Phase 1
        const rowAPair = pairs.find((p) => p.nodeA?.ref === 'row-a');
        expect(rowAPair).toMatchObject({
          matchType: 'ref',
          nodeB: expect.objectContaining({ ref: 'row-a' }),
        });

        const rowCPair = pairs.find((p) => p.nodeA?.ref === 'row-c');
        expect(rowCPair).toMatchObject({
          matchType: 'ref',
          nodeB: expect.objectContaining({ ref: 'row-c' }),
        });

        // "New|0" row should be added
        const addedRow = pairs.find(
          (p) => p.matchType === 'added' && p.nodeB?.type === 'row',
        );
        expect(addedRow).toMatchObject({
          matchType: 'added',
          nodeA: null,
        });

        // "Banana|2" should be matched by similarity
        const bananaPair = pairs.find(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            !p.nodeA.ref &&
            p.nodeB?.type === 'row' &&
            !p.nodeB.ref,
        );
        expect(bananaPair).toBeDefined();
      });

      it('should match all cells within a ref-matched table row when one cell content changes', () => {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        };

        const astA: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              ref: 'tbl',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col3', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Alpha', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Beta', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Gamma', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };
        const astB: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              ref: 'tbl',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col3', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Alpha', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [
                        { type: 'text', text: 'Beta modified content', range },
                      ],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Gamma', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // all three cells should be matched via recursive child matching
        const cellPairs = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'cell' &&
            p.nodeB?.type === 'cell',
        );
        expect(cellPairs).toHaveLength(3);

        // no cells should be added or removed
        const addedOrRemovedCells = pairs.filter(
          (p) =>
            (p.matchType === 'added' || p.matchType === 'removed') &&
            (p.nodeA?.type === 'cell' || p.nodeB?.type === 'cell'),
        );
        expect(addedOrRemovedCells).toHaveLength(0);
      });

      it('should match reordered rows by similarity when partial refs anchor some rows', () => {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        };

        const astA: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  ref: 'r1',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'First', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Second', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Third', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };
        const astB: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Third', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  ref: 'r1',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'First', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'Second', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // ref:r1 should be matched by Phase 1
        const r1Pair = pairs.find((p) => p.nodeA?.ref === 'r1');
        expect(r1Pair).toMatchObject({
          matchType: 'ref',
          nodeB: expect.objectContaining({ ref: 'r1' }),
        });

        // "Second" and "Third" rows should be matched by similarity (not removed/added)
        const positionalRows = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            p.nodeB?.type === 'row',
        );
        expect(positionalRows).toHaveLength(2);

        // no rows should be added or removed
        const addedOrRemovedRows = pairs.filter(
          (p) =>
            (p.matchType === 'added' || p.matchType === 'removed') &&
            (p.nodeA?.type === 'row' || p.nodeB?.type === 'row'),
        );
        expect(addedOrRemovedRows).toHaveLength(0);
      });

      it('should match identical empty rows positionally via fast-path', () => {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        };

        const emptyRow = {
          type: 'row' as const,
          children: [
            {
              type: 'cell' as const,
              content: [{ type: 'text' as const, text: '', range }],
              range,
            },
            {
              type: 'cell' as const,
              content: [{ type: 'text' as const, text: '', range }],
              range,
            },
          ],
          range,
        };

        const astA: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'A', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'B', range }],
                  range,
                },
              ],
              children: [{ ...emptyRow }, { ...emptyRow }, { ...emptyRow }],
              range,
            },
          ],
        };
        const astB: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'A', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'B', range }],
                  range,
                },
              ],
              children: [{ ...emptyRow }, { ...emptyRow }, { ...emptyRow }],
              range,
            },
          ],
        };

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // all 3 rows should be matched positionally
        const rowPairs = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            p.nodeB?.type === 'row',
        );
        expect(rowPairs).toHaveLength(3);

        // no rows should be added or removed
        const addedOrRemovedRows = pairs.filter(
          (p) =>
            (p.matchType === 'added' || p.matchType === 'removed') &&
            (p.nodeA?.type === 'row' || p.nodeB?.type === 'row'),
        );
        expect(addedOrRemovedRows).toHaveLength(0);
      });

      it('should anchor on a ref in the middle and match surrounding rows by similarity', () => {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        };

        const astA: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'A', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  ref: 'mid',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'B', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'C', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };
        const astB: DocumentNode = {
          type: 'root',
          children: [
            {
              type: 'table',
              headers: [
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col1', range }],
                  range,
                },
                {
                  type: 'header',
                  content: [{ type: 'text', text: 'Col2', range }],
                  range,
                },
              ],
              children: [
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'A', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '1', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  ref: 'mid',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'B', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '2', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'NEW', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '0', range }],
                      range,
                    },
                  ],
                  range,
                },
                {
                  type: 'row',
                  children: [
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: 'C', range }],
                      range,
                    },
                    {
                      type: 'cell',
                      content: [{ type: 'text', text: '3', range }],
                      range,
                    },
                  ],
                  range,
                },
              ],
              range,
            },
          ],
        };

        const matcher = new TreeMatcher(astA, astB);
        const pairs = matcher.match();

        // ref:mid should be matched by Phase 1
        const midPair = pairs.find((p) => p.nodeA?.ref === 'mid');
        expect(midPair).toMatchObject({
          matchType: 'ref',
          nodeB: expect.objectContaining({ ref: 'mid' }),
        });

        // "A|1" and "C|3" rows should be matched by similarity
        const positionalRows = pairs.filter(
          (p) =>
            p.matchType === 'positional' &&
            p.nodeA?.type === 'row' &&
            p.nodeB?.type === 'row',
        );
        expect(positionalRows).toHaveLength(2);

        // "NEW|0" row should be added
        const addedRow = pairs.find(
          (p) => p.matchType === 'added' && p.nodeB?.type === 'row',
        );
        expect(addedRow).toMatchObject({
          matchType: 'added',
          nodeA: null,
          nodeB: expect.objectContaining({ type: 'row' }),
        });
      });
    });
  });
});
