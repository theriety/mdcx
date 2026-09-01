/**
 * fallback similarity matching for the differ module
 *
 * provides greedy similarity matching for nodes that were not matched
 * by ref or inference strategies
 */

import {
  computeCombinedSimilarity,
  consumeSimilarityComparison,
} from '#differ/similarity';
import { extractTextContent } from '#differ/text';

import type { TrackedNode } from '#differ/inference/types';
import type { SimilarityBudget } from '#differ/similarity';
import type { BlockNode } from '#types/ast';

/** minimum similarity score for positional matching */
const MIN_SIMILARITY_THRESHOLD = 0.5;

/** weight applied to type match in similarity scoring */
const TYPE_MATCH_WEIGHT = 0.4;

/** weight applied to content similarity in scoring */
const CONTENT_SIMILARITY_WEIGHT = 0.6;

/** inputs for the shared greedy similarity selector */
export interface SelectBestSimilarityCandidateParams<T> {
  /** target node to compare */
  targetNode: BlockNode;
  /** available candidate values */
  candidates: T[];
  /** stable candidate indexes already claimed */
  usedIndices: Set<number>;
  /** exclusive minimum accepted score */
  threshold: number;
  /** extracts a block node from a candidate */
  getNode: (candidate: T) => BlockNode;
  /** extracts the stable index from a candidate */
  getIndex: (candidate: T) => number;
  /** shared cap for similarity work */
  similarityBudget: SimilarityBudget;
}

/** inputs for fallback similarity matching */
export interface FindBestSimilarityMatchParams {
  /** target tracked node */
  target: TrackedNode;
  /** available tracked candidates */
  candidates: TrackedNode[];
  /** stable candidate indexes already claimed */
  usedIndices: Set<number>;
  /** shared cap for similarity work */
  similarityBudget: SimilarityBudget;
}

/**
 * computes similarity score between two nodes
 *
 * uses weighted combination of:
 * - type match (40%): binary match on node type
 * - content similarity (60%): text-based similarity metrics
 * @param nodeA first node to compare
 * @param nodeB second node to compare
 * @returns similarity score from 0 to 1
 */
export function computeNodeSimilarity(
  nodeA: BlockNode,
  nodeB: BlockNode,
): number {
  // different types have no similarity
  if (nodeA.type !== nodeB.type) {
    return 0;
  }

  // same type gets base score (40%)
  const typeScore = TYPE_MATCH_WEIGHT;

  // compute content-based similarity (60%)
  const textA = extractTextContent(nodeA);
  const textB = extractTextContent(nodeB);

  // if both nodes have no text content, use type match only
  if (textA.length === 0 && textB.length === 0) {
    return typeScore + CONTENT_SIMILARITY_WEIGHT;
  }

  const contentScore =
    computeCombinedSimilarity(textA, textB) * CONTENT_SIMILARITY_WEIGHT;

  return typeScore + contentScore;
}

/**
 * selects the highest-scoring unused candidate above a policy threshold
 * @param params candidate collection, accessors, and similarity policy
 * @returns best candidate or null when no score clears the threshold
 */
export function selectBestSimilarityCandidate<T>(
  params: SelectBestSimilarityCandidateParams<T>,
): T | null {
  const {
    targetNode,
    candidates,
    usedIndices,
    threshold,
    getNode,
    getIndex,
    similarityBudget,
  } = params;
  let bestMatch: T | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (usedIndices.has(getIndex(candidate))) {
      continue;
    }

    if (!consumeSimilarityComparison(similarityBudget)) {
      break;
    }

    const score = computeNodeSimilarity(targetNode, getNode(candidate));

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch !== null && bestScore > threshold ? bestMatch : null;
}

/**
 * finds the best similarity match for a tracked node
 * @param params tracked target, candidates, claimed indexes, and work budget
 * @returns best matching tracked node or null if none found
 */
export function findBestSimilarityMatch(
  params: FindBestSimilarityMatchParams,
): TrackedNode | null {
  const { target, candidates, usedIndices, similarityBudget } = params;

  return selectBestSimilarityCandidate({
    targetNode: target.node,
    candidates,
    usedIndices,
    threshold: MIN_SIMILARITY_THRESHOLD,
    getNode: (candidate) => candidate.node,
    getIndex: (candidate) => candidate.index,
    similarityBudget,
  });
}
