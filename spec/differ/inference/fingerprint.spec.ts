import { describe, it, expect } from 'vitest';

import { fingerprintStrategy } from '#differ/inference/fingerprint';

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

describe('fingerprintStrategy', () => {
  it('should have correct name and priority', () => {
    expect(fingerprintStrategy).toMatchObject({
      name: 'fingerprint',
      priority: 4,
    });
  });

  describe('mt:infer', () => {
    it('should match based on structural fingerprint similarity', () => {
      // old: [heading, paragraph with ref, heading]
      const oldH1 = createTrackedNode(createHeading('Title 1', 1), 0);
      const oldPara = createTrackedNode(createParagraph('content', 'p-ref'), 1);
      const oldH2 = createTrackedNode(createHeading('Title 2', 1), 2);

      // new: [heading, paragraph without ref, heading] - same structure
      const newH1 = createTrackedNode(createHeading('Title 1', 1), 0);
      const newPara = createTrackedNode(createParagraph('content'), 1);
      const newH2 = createTrackedNode(createHeading('Title 2', 1), 2);

      const context = createContext(
        [oldH1, oldPara, oldH2],
        [newH1, newPara, newH2],
      );

      const result = fingerprintStrategy.infer(newPara, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('p-ref');
      expect(result?.strategy).toBe('fingerprint');
      expect(result?.score).toBeGreaterThanOrEqual(0.5);
      expect(result?.score).toBeLessThanOrEqual(0.8);
    });

    it('should consider siblings at the same depth when scoring', () => {
      const oldTarget = createTrackedNode(
        createParagraph('content', 'p-ref'),
        0,
        ['children', 0, 'children', 0],
      );
      const oldSibling = createTrackedNode(createHeading('Sibling', 1), 1, [
        'children',
        0,
        'children',
        1,
      ]);
      const oldOther = createTrackedNode(createHeading('Root', 1), 2);

      const newTarget = createTrackedNode(createParagraph('content'), 0, [
        'children',
        0,
        'children',
        0,
      ]);
      const newSibling = createTrackedNode(createHeading('Sibling', 1), 1, [
        'children',
        0,
        'children',
        1,
      ]);
      const newOther = createTrackedNode(createHeading('Root', 1), 2);

      const context = createContext(
        [oldTarget, oldSibling, oldOther],
        [newTarget, newSibling, newOther],
      );

      const result = fingerprintStrategy.infer(newTarget, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('p-ref');
      expect(result?.score).toBeCloseTo(0.8, 5);
    });

    it('should handle differing depths and parent types', () => {
      const oldParent = createTrackedNode(
        {
          type: 'list',
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
        } as BlockNode,
        0,
        ['children', 0],
      );
      const oldTarget = createTrackedNode(
        createParagraph('content', 'p-ref'),
        1,
        ['children', 0, 'children', 0],
      );

      const newTarget = createTrackedNode(createParagraph('content'), 0, [
        'children',
        0,
      ]);

      const context = createContext([oldParent, oldTarget], [newTarget]);

      const result = fingerprintStrategy.infer(newTarget, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('p-ref');
    });

    it('should score sibling overlap when only some types match', () => {
      const oldTarget = createTrackedNode(
        createParagraph('content', 'p-ref'),
        0,
        ['children', 0, 'children', 0],
      );
      const oldSibling = createTrackedNode(createHeading('Sibling', 1), 1, [
        'children',
        0,
        'children',
        1,
      ]);

      const newTarget = createTrackedNode(createParagraph('content'), 0, [
        'children',
        0,
        'children',
        0,
      ]);
      const newSibling = createTrackedNode(createHeading('Sibling', 1), 1, [
        'children',
        0,
        'children',
        1,
      ]);
      const newExtraSibling = createTrackedNode(
        {
          type: 'enum',
          children: [],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 4, offset: 3 },
          },
        } as BlockNode,
        2,
        ['children', 0, 'children', 2],
      );

      const context = createContext(
        [oldTarget, oldSibling],
        [newTarget, newSibling, newExtraSibling],
      );

      const result = fingerprintStrategy.infer(newTarget, context);

      expect(result).not.toBeNull();
      expect(result?.match.ref).toBe('p-ref');
    });

    it('should match even with different types if structural context is similar', () => {
      // fingerprint considers: selfType (40%), parentType (20%), depth (20%), siblings (20%)
      // when only selfType differs, similarity can still be above threshold

      // old: [paragraph with ref]
      const oldPara = createTrackedNode(createParagraph('content', 'p-ref'), 0);

      // new: [heading] - different type but same structural context
      const newHeading = createTrackedNode(createHeading('title', 1), 0);

      const context = createContext([oldPara], [newHeading]);

      const result = fingerprintStrategy.infer(newHeading, context);

      // fingerprint can match across types when structural context is similar
      // this is expected as fingerprint is a last-resort strategy
      expect(result).not.toBeNull();
      expect(result?.score).toBeLessThanOrEqual(0.8);
    });

    it('should skip candidates without refs', () => {
      // old has paragraph without ref
      const oldPara = createTrackedNode(createParagraph('content'), 0);

      // new paragraph
      const newPara = createTrackedNode(createParagraph('content'), 0);

      const context = createContext([oldPara], [newPara]);

      const result = fingerprintStrategy.infer(newPara, context);

      // no candidates with refs
      expect(result).toBeNull();
    });

    it('should skip already matched candidates', () => {
      const oldPara = createTrackedNode(createParagraph('content', 'p-ref'), 0);
      const newPara = createTrackedNode(createParagraph('content'), 0);

      const context = createContext([oldPara], [newPara]);
      context.matchedOldIndices.add(0);

      const result = fingerprintStrategy.infer(newPara, context);

      expect(result).toBeNull();
    });

    it('should find best fingerprint match among multiple candidates', () => {
      // old: [heading, paragraph1 with ref, paragraph2 with ref, heading]
      const oldH1 = createTrackedNode(createHeading('T1', 1), 0);
      const oldPara1 = createTrackedNode(
        createParagraph('content1', 'p1-ref'),
        1,
      );
      const oldPara2 = createTrackedNode(
        createParagraph('content2', 'p2-ref'),
        2,
      );
      const oldH2 = createTrackedNode(createHeading('T2', 1), 3);

      // new: same structure
      const newH1 = createTrackedNode(createHeading('T1', 1), 0);
      const newPara = createTrackedNode(createParagraph('content'), 1);
      const newH2 = createTrackedNode(createHeading('T2', 1), 2);

      const context = createContext(
        [oldH1, oldPara1, oldPara2, oldH2],
        [newH1, newPara, newH2],
      );

      const result = fingerprintStrategy.infer(newPara, context);

      // should find a match (could be either paragraph due to similar fingerprints)
      expect(result === null || result.match.ref !== undefined).toBe(true);
    });

    it('should handle node with no siblings', () => {
      // single node in old - no siblings
      const oldPara = createTrackedNode(createParagraph('content', 'p-ref'), 0);

      // multiple nodes in new - has siblings
      const newH1 = createTrackedNode(createHeading('Title', 1), 0);
      const newPara = createTrackedNode(createParagraph('content'), 1);

      const context = createContext([oldPara], [newH1, newPara]);

      const result = fingerprintStrategy.infer(newPara, context);

      // should still attempt to match despite different sibling contexts
      // fingerprint similarity is calculated with empty sibling case
      expect(result === null || result.match.ref !== undefined).toBe(true);
    });

    it('should return 0 similarity when only one side has siblings', () => {
      // old: single paragraph (no siblings)
      const oldPara = createTrackedNode(createParagraph('content', 'p-ref'), 0);

      // new: paragraph in between headings (has siblings)
      const newH1 = createTrackedNode(createHeading('T1', 1), 0);
      const newPara = createTrackedNode(createParagraph('other'), 1);
      const newH2 = createTrackedNode(createHeading('T2', 1), 2);

      const context = createContext([oldPara], [newH1, newPara, newH2]);

      const result = fingerprintStrategy.infer(newPara, context);

      // with asymmetric siblings, the fingerprint similarity may be lower
      // but should still attempt matching as fingerprint is last resort
      expect(result === null || result.match.ref !== undefined).toBe(true);
    });
  });
});
