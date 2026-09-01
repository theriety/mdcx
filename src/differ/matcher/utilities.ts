import {
  collectConsumedIndices,
  findBestChildMatch,
} from '#differ/matcher/children';
import { traverseNodeChildren } from '#differ/traversal';
import { areObjectsEqual } from '#differ/utilities';

import type { AncestryContext, MatchedPair } from '#differ/matcher/types';
import type { SimilarityBudget } from '#differ/similarity';
import type { DocumentNode, BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

export interface Children {
  node: BlockNode;
  path: Path;
}

interface RefMatchInput {
  ast: DocumentNode;
  map: Map<string, Children>;
}

interface MatchChildrenState {
  pairs: MatchedPair[];
  matchedRefsA: Set<string>;
  matchedRefsB: Set<string>;
  matchedNodesA: Set<BlockNode>;
  matchedNodesB: Set<BlockNode>;
}

interface MatchChildrenContext {
  similarityBudget: SimilarityBudget;
  state: MatchChildrenState;
  astA: DocumentNode;
  astB: DocumentNode;
  computeAncestry: (ast: DocumentNode, path: Path) => AncestryContext;
  registerMatchRef?: (sourceNode: BlockNode, targetNode: BlockNode) => void;
}

/** inputs for marking one matched node */
interface MarkMatchedNodeParams {
  node: BlockNode;
  matchedNodes: Set<BlockNode>;
  matchedRefs: Set<string>;
}

/** inputs for marking a collection of matched children */
interface MarkChildrenMatchedParams {
  children: Children[];
  matchedNodes: Set<BlockNode>;
  matchedRefs: Set<string>;
}

/** inputs for recursively matching one child pair */
interface MatchPairedChildrenParams {
  source: Children;
  target: Children;
  context: MatchChildrenContext;
}

/** inputs for marking every descendant of one node */
interface MarkDescendantsAsMatchedParams {
  node: BlockNode;
  matchedNodes: Set<BlockNode>;
  matchedRefs: Set<string>;
}

/** inputs for recursively matching the children of one node pair */
interface MatchChildrenRecursivelyParams {
  source: Children;
  target: Children;
  context: MatchChildrenContext;
}

/** indexed child entry used while matching unmatched children */
interface IndexedChild {
  child: Children;
  index: number;
}

/** inputs for matching unmatched child entries */
interface MatchUnmatchedChildrenParams {
  childrenA: IndexedChild[];
  childrenB: IndexedChild[];
  context: MatchChildrenContext;
}

/** inputs for direct ref matching */
interface MatchByRefParams {
  source: RefMatchInput;
  target: RefMatchInput;
  computeAncestry: (ast: DocumentNode, path: Path) => AncestryContext;
}

/**
 * collects all direct children from a node with their paths
 * @param node node to collect children from
 * @param basePath path to the node
 * @returns array of child entries with node and path
 */
function collectAllChildren(node: BlockNode, basePath: Path): Children[] {
  const children: Children[] = [];

  traverseNodeChildren(node, basePath, (child, childPath) => {
    children.push({ node: child, path: childPath });
  });

  return children;
}

/**
 * checks if two nodes are identical (excluding range)
 * @param nodeA first node
 * @param nodeB second node
 * @returns true if nodes are identical
 */
function areNodesIdentical(nodeA: BlockNode, nodeB: BlockNode): boolean {
  const { range: _a, ...a } = nodeA;
  const { range: _b, ...b } = nodeB;

  return areObjectsEqual(a, b);
}

/**
 * checks if two children arrays are identical
 * @param childrenA children from source node
 * @param childrenB children from target node
 * @returns true when all children match
 */
function areChildrenIdentical(
  childrenA: Children[],
  childrenB: Children[],
): boolean {
  if (childrenA.length !== childrenB.length) {
    return false;
  }

  return childrenA.every((a, i) => {
    const b = childrenB[i] as Children | undefined;

    return b !== undefined && areNodesIdentical(a.node, b.node);
  });
}

/**
 * marks a node as matched and tracks its ref when present
 * @param params node and match-state sets to update
 */
function markMatchedNode(params: MarkMatchedNodeParams): void {
  const { node, matchedNodes, matchedRefs } = params;
  matchedNodes.add(node);
  if (node.ref) {
    matchedRefs.add(node.ref);
  }
}

/**
 * marks a list of children as matched
 * @param params child entries and match-state sets to update
 */
function markChildrenMatched(params: MarkChildrenMatchedParams): void {
  const { children, matchedNodes, matchedRefs } = params;
  for (const { node } of children) {
    markMatchedNode({ node, matchedNodes, matchedRefs });
  }
}

/**
 * matches a paired child node and recurses when needed
 * @param params source and target children with shared match context
 */
function matchPairedChildren(params: MatchPairedChildrenParams): void {
  const { source: childA, target: childB, context } = params;
  const { state } = context;

  // defensive guards: collectConsumedIndices already filters direct children
  // whose refs are in matchedRefsA/B before pairing, so reaching these branches
  // would require a future caller that bypasses that pre-filter.
  /* v8 ignore start */
  if (childA.node.ref && state.matchedRefsA.has(childA.node.ref)) {
    return;
  }
  if (childB.node.ref && state.matchedRefsB.has(childB.node.ref)) {
    return;
  }
  /* v8 ignore stop */

  // Register match ref for positional matches so descendants can
  // resolve ancestry refs against a stable parent during operation generation.
  // the guard's false branch is unreachable in practice because pairs where
  // both children carry refs are filtered out by collectConsumedIndices before
  // entering this routine, but we keep the check for forward-safety.
  /* v8 ignore start */
  if (!childA.node.ref || !childB.node.ref) {
    context.registerMatchRef?.(childA.node, childB.node);
  }
  /* v8 ignore stop */

  state.pairs.push({
    nodeA: childA.node,
    nodeB: childB.node,
    pathA: childA.path,
    pathB: childB.path,
    matchType: 'positional',
    ancestryA: context.computeAncestry(context.astA, childA.path),
    ancestryB: context.computeAncestry(context.astB, childB.path),
  });

  markMatchedNode({
    node: childA.node,
    matchedNodes: state.matchedNodesA,
    matchedRefs: state.matchedRefsA,
  });
  markMatchedNode({
    node: childB.node,
    matchedNodes: state.matchedNodesB,
    matchedRefs: state.matchedRefsB,
  });

  if (!areNodesIdentical(childA.node, childB.node)) {
    matchChildrenRecursively({ source: childA, target: childB, context });
  }
}

/**
 * records a removed child match
 * @param childA child entry from source
 * @param context matching context
 */
function matchRemovedChild(
  childA: Children,
  context: MatchChildrenContext,
): void {
  const { state } = context;

  state.pairs.push({
    nodeA: childA.node,
    nodeB: null,
    pathA: childA.path,
    pathB: null,
    matchType: 'removed',
    ancestryA: context.computeAncestry(context.astA, childA.path),
    ancestryB: null,
  });
  markMatchedNode({
    node: childA.node,
    matchedNodes: state.matchedNodesA,
    matchedRefs: state.matchedRefsA,
  });
}

/**
 * records an added child match
 * @param childB child entry from target
 * @param context matching context
 */
function matchAddedChild(
  childB: Children,
  context: MatchChildrenContext,
): void {
  const { state } = context;

  state.pairs.push({
    nodeA: null,
    nodeB: childB.node,
    pathA: null,
    pathB: childB.path,
    matchType: 'added',
    ancestryA: null,
    ancestryB: context.computeAncestry(context.astB, childB.path),
  });
  markMatchedNode({
    node: childB.node,
    matchedNodes: state.matchedNodesB,
    matchedRefs: state.matchedRefsB,
  });
}

/**
 * matches target children against available source children
 * @param params unmatched child entries and shared matching context
 * @returns source indexes consumed by successful matches
 */
function matchUnmatchedChildren(
  params: MatchUnmatchedChildrenParams,
): Set<number> {
  const { childrenA, childrenB, context } = params;
  const usedA = new Set<number>();

  for (const { child: childB } of childrenB) {
    const match = findBestChildMatch({
      target: childB,
      candidates: childrenA,
      usedIndices: usedA,
      similarityBudget: context.similarityBudget,
    });

    if (match) {
      matchPairedChildren({
        source: match.child,
        target: childB,
        context,
      });
      usedA.add(match.index);
    } else {
      matchAddedChild(childB, context);
    }
  }

  return usedA;
}

/**
 * marks all descendants of a node as matched
 * @param params root node and match-state sets to update
 */
export function markDescendantsAsMatched(
  params: MarkDescendantsAsMatchedParams,
): void {
  const { node, matchedNodes, matchedRefs } = params;
  traverseNodeChildren(node, [], (child) => {
    matchedNodes.add(child);
    if (child.ref) {
      matchedRefs.add(child.ref);
    }
    markDescendantsAsMatched({ node: child, matchedNodes, matchedRefs });
  });
}

/**
 * matches children recursively within the scope of a parent pair
 * @param params source and target roots with shared match context
 */
export function matchChildrenRecursively(
  params: MatchChildrenRecursivelyParams,
): void {
  const { source, target, context } = params;
  const { state } = context;
  const childrenA = collectAllChildren(source.node, source.path);
  const childrenB = collectAllChildren(target.node, target.path);

  if (areChildrenIdentical(childrenA, childrenB)) {
    markChildrenMatched({
      children: childrenA,
      matchedNodes: state.matchedNodesA,
      matchedRefs: state.matchedRefsA,
    });
    markChildrenMatched({
      children: childrenB,
      matchedNodes: state.matchedNodesB,
      matchedRefs: state.matchedRefsB,
    });

    return;
  }

  // step 1: skip children already consumed by Phase 1 ref matching (anchors)
  const consumedA = collectConsumedIndices(childrenA, state.matchedRefsA);
  const consumedB = collectConsumedIndices(childrenB, state.matchedRefsB);

  // step 2: match remaining children by similarity
  const unmatchedA: IndexedChild[] = childrenA
    .map((child, i) => ({ child, index: i }))
    .filter(({ index }) => !consumedA.has(index));
  const unmatchedB: IndexedChild[] = childrenB
    .map((child, i) => ({ child, index: i }))
    .filter(({ index }) => !consumedB.has(index));
  const usedA = matchUnmatchedChildren({
    childrenA: unmatchedA,
    childrenB: unmatchedB,
    context,
  });

  // step 3: remaining unmatched A children are removed
  for (const { child: childA, index } of unmatchedA) {
    if (!usedA.has(index)) {
      matchRemovedChild(childA, context);
    }
  }
}

/**
 * matches nodes by ref attribute
 * @param params source and target ref maps with ancestry callback
 * @returns array of ref-matched pairs
 */
export function matchByRef(params: MatchByRefParams): MatchedPair[] {
  const { source, target, computeAncestry } = params;
  const pairs: MatchedPair[] = [];
  for (const [ref, entryA] of source.map) {
    const entryB = target.map.get(ref);
    if (entryB) {
      pairs.push({
        nodeA: entryA.node,
        nodeB: entryB.node,
        pathA: entryA.path,
        pathB: entryB.path,
        matchType: 'ref',
        ancestryA: computeAncestry(source.ast, entryA.path),
        ancestryB: computeAncestry(target.ast, entryB.path),
      });
    }
  }

  return pairs;
}
