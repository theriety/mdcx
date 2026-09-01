import type { AncestryContext, MatchedPair, MatchType } from '#differ/matcher';
import type { BlockNode } from '#types/ast';

/** named inputs for constructing a matched pair in tests */
export interface CreatePairParams {
  nodeA: BlockNode | null;
  nodeB: BlockNode | null;
  pathA: Array<string | number> | null;
  pathB: Array<string | number> | null;
  matchType: MatchType;
  ancestryA?: AncestryContext | null;
  ancestryB?: AncestryContext | null;
}

/**
 * creates an AncestryContext for testing
 * @param parentRefs array of parent ref IDs (from root to immediate parent)
 * @param afterRef optional ref of the preceding sibling
 * @returns an AncestryContext for testing
 * @example
 * ```typescript
 * const firstChild = createAncestry([]);
 * const nested = createAncestry(['parent-ref'], 'sibling-ref');
 * ```
 */
export function createAncestry(
  parentRefs: string[] = [],
  afterRef?: string,
): AncestryContext {
  return {
    parentRefs,
    ...(afterRef && { afterRef }),
  };
}

/**
 * creates a MatchedPair for testing operation generation
 * @param params named node, path, match, and ancestry fields
 * @param params.nodeA source node, or null for an addition
 * @param params.nodeB target node, or null for a removal
 * @param params.pathA source path, or null for an addition
 * @param params.pathB target path, or null for a removal
 * @param params.matchType match classification for the pair
 * @param params.ancestryA optional source ancestry; defaults when nodeA exists
 * @param params.ancestryB optional target ancestry; defaults when nodeB exists
 * @returns a MatchedPair for testing
 * @example
 * ```typescript
 * // added node
 * const addPair = createPair({
 *   nodeA: null,
 *   nodeB: newNode,
 *   pathA: null,
 *   pathB: ['children', 0],
 *   matchType: 'added',
 * });
 * // removed node
 * const removePair = createPair({
 *   nodeA: oldNode,
 *   nodeB: null,
 *   pathA: ['children', 0],
 *   pathB: null,
 *   matchType: 'removed',
 * });
 * // matched nodes
 * const matchPair = createPair({
 *   nodeA,
 *   nodeB,
 *   pathA: ['children', 0],
 *   pathB: ['children', 0],
 *   matchType: 'ref',
 * });
 * ```
 */
export function createPair(params: CreatePairParams): MatchedPair {
  const {
    nodeA,
    nodeB,
    pathA,
    pathB,
    matchType,
    ancestryA = nodeA ? createAncestry() : null,
    ancestryB = nodeB ? createAncestry() : null,
  } = params;

  return {
    nodeA,
    nodeB,
    pathA,
    pathB,
    matchType,
    ancestryA,
    ancestryB,
  };
}
