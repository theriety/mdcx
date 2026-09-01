import type { InferenceContext, TrackedNode } from './types';

/** inputs for normalizing a similarity score */
export interface NormalizeScoreParams {
  /** similarity score to normalize */
  similarity: number;
  /** minimum similarity threshold */
  minThreshold: number;
  /** lower bound of the output score */
  baseScore: number;
  /** output score range */
  scoreRange: number;
  /** upper bound of the output score */
  maxScore: number;
}

/**
 * normalizes a similarity score to a bounded range
 *
 * maps similarity from [minThreshold, 1.0] to [baseScore, maxScore]
 * and clamps the result to [baseScore, maxScore]
 * @param params score values used for normalization
 * @param params.similarity similarity score to normalize
 * @param params.minThreshold minimum similarity threshold
 * @param params.baseScore lower bound of the output score
 * @param params.scoreRange output score range
 * @param params.maxScore upper bound of the output score
 * @returns normalized and clamped score
 */
export function normalizeScore(params: NormalizeScoreParams): number {
  const { similarity, minThreshold, baseScore, scoreRange, maxScore } = params;
  const normalized =
    baseScore + ((similarity - minThreshold) / (1 - minThreshold)) * scoreRange;

  return Math.min(Math.max(normalized, baseScore), maxScore);
}

/**
 * gets list of unmatched old nodes with refs
 *
 * inference strategies should only match TO old nodes that have refs
 * (to prevent ambiguous ref-less chains)
 * @param context inference context
 * @param typeFilter optional node type to filter by
 * @returns unmatched old nodes that have refs (optionally filtered by type)
 */
export function getUnmatchedOldNodesWithRefs(
  context: InferenceContext,
  typeFilter?: string,
): TrackedNode[] {
  return context.oldNodes.filter(
    (tracked) =>
      tracked.node.ref !== undefined &&
      !context.matchedOldIndices.has(tracked.index) &&
      (typeFilter === undefined || tracked.node.type === typeFilter),
  );
}
