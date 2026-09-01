/**
 * positional inference strategy
 *
 * matches nodes based on their position relative to already-matched neighbors
 * when a new block sits between two matched blocks, finds the corresponding
 * "gap" in the old document
 *
 * highest confidence strategy (0.9-1.0) because position context is strong signal
 */

import {
  computeCombinedSimilarity,
  consumeSimilarityComparison,
} from '#differ/similarity';
import { extractTextContent } from '#differ/text';

import type {
  InferenceContext,
  InferenceResult,
  InferenceStrategy,
  TrackedNode,
} from './types';

/** minimum similarity threshold for positional validation */
const MIN_SIMILARITY_FOR_POSITION = 0.05;

/** base score for positional matches */
const BASE_POSITIONAL_SCORE = 0.9;

/** maximum bonus from content similarity */
const SIMILARITY_BONUS_MAX = 0.1;

/** priority for this strategy (lower = higher priority) */
const STRATEGY_PRIORITY = 1;

/** inputs for selecting unmatched referenced nodes inside an index gap */
interface FindUnmatchedInGapParams {
  /** exclusive lower stable index */
  startIndex: number;
  /** exclusive upper stable index */
  endIndex: number;
  /** inference context containing stable tracked indexes */
  context: InferenceContext;
}

/** inputs for selecting a positional inference candidate */
interface FindPositionalCandidateParams {
  /** unmatched new node to locate in the old index gap */
  newNode: TrackedNode;
  /** inference context containing matched neighbors and old nodes */
  context: InferenceContext;
}

/**
 * finds the nearest matched neighbor before this node
 * @param newNode node to find neighbor for
 * @param context inference context
 * @returns matched predecessor or null
 */
function findPreviousMatchedNeighbor(
  newNode: TrackedNode,
  context: InferenceContext,
): TrackedNode | null {
  // search backwards from current position
  for (let i = newNode.index - 1; i >= 0; i--) {
    if (context.matchedNewIndices.has(i)) {
      const match = context.matches.get(i);

      return match ?? null;
    }
  }

  return null;
}

/**
 * finds the nearest matched neighbor after this node
 * @param newNode node to find neighbor for
 * @param context inference context
 * @returns matched successor or null
 */
function findNextMatchedNeighbor(
  newNode: TrackedNode,
  context: InferenceContext,
): TrackedNode | null {
  let nextIndex: number | undefined;

  for (const index of context.matches.keys()) {
    if (
      index > newNode.index &&
      (nextIndex === undefined || index < nextIndex)
    ) {
      nextIndex = index;
    }
  }

  return nextIndex === undefined
    ? null
    : requiredMatchedNode(context, nextIndex);
}

/**
 * reads the value belonging to a key obtained from the same match map
 * @param context inference context containing the match map
 * @param index key yielded by the match map
 * @returns initialized tracked node
 */
function requiredMatchedNode(
  context: InferenceContext,
  index: number,
): TrackedNode {
  const match = context.matches.get(index);

  // Iterating Map.keys() guarantees that the corresponding value exists.
  /* c8 ignore start */
  if (match === undefined) {
    throw new RangeError(`Missing inference match at index ${index}.`);
  }
  /* c8 ignore stop */

  return match;
}

/**
 * finds unmatched old nodes between two positions
 * @param params exclusive gap bounds and inference context
 * @returns unmatched nodes with refs in the gap
 */
function findUnmatchedInGap(params: FindUnmatchedInGapParams): TrackedNode[] {
  const { startIndex, endIndex, context } = params;

  return context.oldNodes.filter(
    (tracked) =>
      tracked.index > startIndex &&
      tracked.index < endIndex &&
      tracked.node.ref !== undefined &&
      !context.matchedOldIndices.has(tracked.index),
  );
}

/**
 * selects the unique referenced old node in the new node's positional gap
 * @param params unmatched node and inference context
 * @returns positional candidate or null when the gap is not decisive
 */
function findPositionalCandidate(
  params: FindPositionalCandidateParams,
): TrackedNode | null {
  const { newNode, context } = params;
  const prevMatch = findPreviousMatchedNeighbor(newNode, context);
  const nextMatch = findNextMatchedNeighbor(newNode, context);

  if (!prevMatch && !nextMatch) {
    return null;
  }

  const candidates = findUnmatchedInGap({
    startIndex: prevMatch?.index ?? -1,
    endIndex: nextMatch?.index ?? Number.POSITIVE_INFINITY,
    context,
  });

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

  return candidate;
}

/**
 * positional inference strategy implementation
 *
 * attempts to match based on position between matched neighbors
 */
export const positionalStrategy: InferenceStrategy = {
  name: 'positional',
  priority: STRATEGY_PRIORITY,

  /**
   * attempts to match based on position between matched neighbors
   * @param newNode node to find match for
   * @param context inference context with tracked nodes
   * @returns inference result or null if no match found
   */
  infer(
    newNode: TrackedNode,
    context: InferenceContext,
  ): InferenceResult | null {
    const candidate = findPositionalCandidate({ newNode, context });

    if (!candidate) {
      return null;
    }

    // validate with content similarity (minimum threshold)
    const newText = extractTextContent(newNode.node);
    const oldText = extractTextContent(candidate.node);
    if (!consumeSimilarityComparison(context.similarityBudget)) {
      return null;
    }
    const similarity = computeCombinedSimilarity(newText, oldText);

    if (similarity < MIN_SIMILARITY_FOR_POSITION) {
      return null;
    }

    // calculate score: base + similarity bonus
    const score = Math.min(
      BASE_POSITIONAL_SCORE + similarity * SIMILARITY_BONUS_MAX,
      1.0,
    );

    return {
      match: candidate.node,
      path: candidate.path,
      score,
      strategy: 'positional',
    };
  },
};
