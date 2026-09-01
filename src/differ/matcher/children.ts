import { selectBestSimilarityCandidate } from '#differ/fallback';

import type { Children } from '#differ/matcher/utilities';
import type { SimilarityBudget } from '#differ/similarity';

/** minimum similarity score for child matching within containers (above 0 to require same type, below type weight to always accept same-type pairs) */
const MIN_CHILD_SIMILARITY = 0.3;

/** indexed child entry for similarity matching */
export interface IndexedChild {
  child: Children;
  index: number;
}

/** inputs for child similarity matching */
export interface FindBestChildMatchParams {
  /** target child */
  target: Children;
  /** available indexed candidates */
  candidates: IndexedChild[];
  /** candidate indexes already claimed */
  usedIndices: Set<number>;
  /** shared cap for similarity work */
  similarityBudget: SimilarityBudget;
}

/**
 * collects indices of children already consumed by Phase 1 ref matching
 * @param children child entries to check
 * @param matchedRefs set of matched refs to test against
 * @returns set of consumed child indices
 */
export function collectConsumedIndices(
  children: Children[],
  matchedRefs: Set<string>,
): Set<number> {
  const consumed = new Set<number>();

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Children | undefined;
    const ref = child?.node.ref;

    if (ref && matchedRefs.has(ref)) {
      consumed.add(i);
    }
  }

  return consumed;
}

/**
 * finds the best similarity match for a target child among candidates
 * @param params target, candidates, claimed indexes, and work budget
 * @returns best matching candidate or null if none above threshold
 */
export function findBestChildMatch(
  params: FindBestChildMatchParams,
): IndexedChild | null {
  const { target, candidates, usedIndices, similarityBudget } = params;

  return selectBestSimilarityCandidate({
    targetNode: target.node,
    candidates,
    usedIndices,
    threshold: MIN_CHILD_SIMILARITY,
    getNode: (candidate) => candidate.child.node,
    getIndex: (candidate) => candidate.index,
    similarityBudget,
  });
}
