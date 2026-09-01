/**
 * structural inference strategy
 *
 * matches nodes based on block type when there's exactly one unmatched
 * candidate of the same type
 *
 * medium-high confidence strategy (0.7-0.9) because type uniqueness is strong signal
 */

import {
  computeCombinedSimilarity,
  consumeSimilarityComparison,
} from '#differ/similarity';
import { extractTextContent } from '#differ/text';

import { getUnmatchedOldNodesWithRefs } from './utilities';

import type {
  InferenceContext,
  InferenceResult,
  InferenceStrategy,
  TrackedNode,
} from './types';

/** minimum content similarity for validation */
const MIN_STRUCTURAL_SIMILARITY = 0.3;

/** base score for structural matches */
const BASE_STRUCTURAL_SCORE = 0.7;

/** maximum score for structural matches */
const MAX_STRUCTURAL_SCORE = 0.9;

/** score range for structural matches */
const STRUCTURAL_SCORE_RANGE = 0.2;

/** priority for this strategy (lower = higher priority) */
const STRATEGY_PRIORITY = 3;

/**
 * structural inference strategy implementation
 *
 * finds match when exactly one unmatched candidate of same type exists
 */
export const structuralStrategy: InferenceStrategy = {
  name: 'structural',
  priority: STRATEGY_PRIORITY,

  /**
   * finds match when exactly one unmatched candidate of same type exists
   * @param newNode node to find match for
   * @param context inference context with tracked nodes
   * @returns inference result or null if no match found
   */
  infer(
    newNode: TrackedNode,
    context: InferenceContext,
  ): InferenceResult | null {
    const candidates = getUnmatchedOldNodesWithRefs(context, newNode.node.type);

    // structural inference requires exactly one candidate of same type
    if (candidates.length !== 1) {
      return null;
    }

    const candidate = candidates[0] as TrackedNode | undefined;

    // A one-element filtered array necessarily initializes index zero.
    /* c8 ignore start */
    if (candidate === undefined) {
      return null;
    }
    /* c8 ignore stop */

    // validate with content similarity
    const newText = extractTextContent(newNode.node);
    const oldText = extractTextContent(candidate.node);
    if (!consumeSimilarityComparison(context.similarityBudget)) {
      return null;
    }
    const similarity = computeCombinedSimilarity(newText, oldText);

    // allow low similarity for structural since type uniqueness is strong
    if (similarity < MIN_STRUCTURAL_SIMILARITY) {
      return null;
    }

    // calculate score: base + similarity bonus
    const score = Math.min(
      BASE_STRUCTURAL_SCORE + similarity * STRUCTURAL_SCORE_RANGE,
      MAX_STRUCTURAL_SCORE,
    );

    return {
      match: candidate.node,
      path: candidate.path,
      score,
      strategy: 'structural',
    };
  },
};
