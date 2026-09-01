import { findBestSimilarityMatch } from '#differ/fallback';
import { matchByInference as matchByInferenceStrategy } from '#differ/inference/index';

import type { InferenceContext } from '#differ/inference/types';
import type { AncestryContext, MatchedPair } from '#differ/matcher/types';
import type { DocumentNode, BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

/** inputs for matching remaining nodes with fallback similarity */
export interface MatchByFallbackSimilarityParams {
  /** inference context containing unmatched nodes */
  context: InferenceContext;
  /** source AST */
  astA: DocumentNode;
  /** target AST */
  astB: DocumentNode;
  /** function for computing ancestry context */
  computeAncestry: (ast: DocumentNode, path: Path) => AncestryContext;
}

/**
 * matches nodes using inference strategies
 * @param context inference context with tracked nodes
 * @param options options for ancestry and ref tracking
 * @param options.astA source AST
 * @param options.astB target AST
 * @param options.computeAncestry function to compute ancestry context
 * @param options.registerMatchRef callback to register matched source/target refs
 * @returns array of inference-matched pairs
 */
export function matchByInference(
  context: InferenceContext,
  options: {
    astA: DocumentNode;
    astB: DocumentNode;
    computeAncestry: (ast: DocumentNode, path: Path) => AncestryContext;
    registerMatchRef: (sourceNode: BlockNode, targetNode: BlockNode) => void;
  },
): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  const inferenceResults = matchByInferenceStrategy(context);
  for (const { newNode, oldNode } of inferenceResults) {
    options.registerMatchRef(oldNode.node, newNode.node);

    pairs.push({
      nodeA: oldNode.node,
      nodeB: newNode.node,
      pathA: oldNode.path,
      pathB: newNode.path,
      matchType: 'positional',
      ancestryA: options.computeAncestry(options.astA, oldNode.path),
      ancestryB: options.computeAncestry(options.astB, newNode.path),
    });
  }

  return pairs;
}

/**
 * matches remaining nodes using bounded fallback similarity
 * @param params inference context, ASTs, and ancestry callback
 * @returns similarity-matched, added, and removed pairs
 */
export function matchByFallbackSimilarity(
  params: MatchByFallbackSimilarityParams,
): MatchedPair[] {
  const { context, astA, astB, computeAncestry } = params;
  const pairs: MatchedPair[] = [];
  const remainingOld = context.oldNodes.filter(
    (node) => !context.matchedOldIndices.has(node.index),
  );
  const remainingNew = context.newNodes.filter(
    (node) => !context.matchedNewIndices.has(node.index),
  );
  const usedOldIndices = new Set<number>();

  for (const newTracked of remainingNew) {
    const match = findBestSimilarityMatch({
      target: newTracked,
      candidates: remainingOld,
      usedIndices: usedOldIndices,
      similarityBudget: context.similarityBudget,
    });

    pairs.push({
      nodeA: match?.node ?? null,
      nodeB: newTracked.node,
      pathA: match?.path ?? null,
      pathB: newTracked.path,
      matchType: match ? 'positional' : 'added',
      ancestryA: match ? computeAncestry(astA, match.path) : null,
      ancestryB: computeAncestry(astB, newTracked.path),
    });
    if (match) {
      usedOldIndices.add(match.index);
    }
  }

  for (const oldTracked of remainingOld) {
    if (!usedOldIndices.has(oldTracked.index)) {
      pairs.push({
        nodeA: oldTracked.node,
        nodeB: null,
        pathA: oldTracked.path,
        pathB: null,
        matchType: 'removed',
        ancestryA: computeAncestry(astA, oldTracked.path),
        ancestryB: null,
      });
    }
  }

  return pairs;
}
