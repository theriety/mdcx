/**
 * content inference strategy
 *
 * matches nodes based on text content similarity using weighted metrics
 * (jaccard, levenshtein, ngram)
 *
 * medium confidence strategy (0.6-0.9) because content can change
 */

import {
  computeCombinedSimilarity,
  consumeSimilarityComparison,
} from '#differ/similarity';
import { extractTextContent } from '#differ/text';

import { getUnmatchedOldNodesWithRefs, normalizeScore } from './utilities';

import type {
  InferenceContext,
  InferenceResult,
  InferenceStrategy,
  TrackedNode,
} from './types';

/** minimum similarity threshold for content matching */
const MIN_CONTENT_SIMILARITY = 0.6;

/** base score for content matches */
const BASE_CONTENT_SCORE = 0.6;

/** score range for content matches */
const CONTENT_SCORE_RANGE = 0.3;

/** maximum score for content matches */
const MAX_CONTENT_SCORE = 0.9;

/** priority for this strategy (lower = higher priority) */
const STRATEGY_PRIORITY = 2;

/** best candidate selected by content similarity */
interface ContentMatch {
  node: TrackedNode;
  similarity: number;
}

/** inputs for selecting the best content-similar node */
interface FindBestContentMatchParams {
  newNode: TrackedNode;
  newText: string;
  candidates: TrackedNode[];
  context: InferenceContext;
}

/**
 * finds the highest-similarity candidate with a compatible node type
 * @param params content and candidates to compare
 * @returns best candidate and similarity, or null when none qualifies
 */
function findBestContentMatch(
  params: FindBestContentMatchParams,
): ContentMatch | null {
  const { newNode, newText, candidates, context } = params;
  let bestMatch: TrackedNode | null = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    if (candidate.node.type !== newNode.node.type) {
      continue;
    }

    const oldText = extractTextContent(candidate.node);

    if (oldText.length === 0) {
      continue;
    }

    if (!consumeSimilarityComparison(context.similarityBudget)) {
      break;
    }

    const similarity = computeCombinedSimilarity(newText, oldText);

    if (similarity > bestSimilarity && similarity >= MIN_CONTENT_SIMILARITY) {
      bestSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { node: bestMatch, similarity: bestSimilarity } : null;
}

/**
 * content inference strategy implementation
 *
 * finds best content match among unmatched old nodes with refs
 */
export const contentStrategy: InferenceStrategy = {
  name: 'content',
  priority: STRATEGY_PRIORITY,

  /**
   * attempts to match based on text content similarity
   * @param newNode node to find match for
   * @param context inference context with tracked nodes
   * @returns inference result or null if no match found
   */
  infer(
    newNode: TrackedNode,
    context: InferenceContext,
  ): InferenceResult | null {
    const newText = extractTextContent(newNode.node);

    // cannot match without content
    if (newText.length === 0) {
      return null;
    }

    const bestMatch = findBestContentMatch({
      newNode,
      newText,
      candidates: getUnmatchedOldNodesWithRefs(context),
      context,
    });

    if (!bestMatch) {
      return null;
    }

    // calculate score: map similarity [0.6, 1.0] to [0.6, 0.9]
    const score = normalizeScore({
      similarity: bestMatch.similarity,
      minThreshold: MIN_CONTENT_SIMILARITY,
      baseScore: BASE_CONTENT_SCORE,
      scoreRange: CONTENT_SCORE_RANGE,
      maxScore: MAX_CONTENT_SCORE,
    });

    return {
      match: bestMatch.node.node,
      path: bestMatch.node.path,
      score,
      strategy: 'content',
    };
  },
};
