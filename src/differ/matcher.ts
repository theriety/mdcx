import { createInferenceContext } from '#differ/inference/index';
import {
  matchByFallbackSimilarity,
  matchByInference,
} from '#differ/matcher/remaining';
import {
  matchByRef,
  matchChildrenRecursively,
  markDescendantsAsMatched,
} from '#differ/matcher/utilities';

import { generateLocalRef } from '#differ/ref';
import { createSimilarityBudget } from '#differ/similarity';
import {
  buildRefMap,
  collectUnmatchedNodes,
  getChildrenByProperty,
} from '#differ/traversal';

import type { InferenceContext } from '#differ/inference/types';
import type { AncestryContext, MatchedPair } from '#differ/matcher/types';
import type { Children } from '#differ/matcher/utilities';

import type { SimilarityBudget } from '#differ/similarity';
import type { DocumentNode, BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

export type {
  AncestryContext,
  MatchedPair,
  MatchType,
} from '#differ/matcher/types';

/** result of traversing one path segment */
interface PathTraversalStep {
  node: BlockNode;
  children: BlockNode[];
  index: number;
}

/** inputs for traversing one segment of an AST path */
interface TraversePathSegmentParams {
  /** current node being traversed */
  current: DocumentNode | BlockNode;
  /** property name containing children */
  prop: string;
  /** index of child to access */
  index: number;
}

/** function for computing ancestry context for a node at the given path */
type ComputeAncestry = (ast: DocumentNode, path: Path) => AncestryContext;

/** accumulators for matched nodes and refs across both ASTs */
interface MatchState {
  /** accumulator for matched pairs */
  pairs: MatchedPair[];
  /** matched ref set for source AST */
  matchedRefsA: Set<string>;
  /** matched ref set for target AST */
  matchedRefsB: Set<string>;
  /** matched node set for source AST */
  matchedNodesA: Set<BlockNode>;
  /** matched node set for target AST */
  matchedNodesB: Set<BlockNode>;
}

/** shared context for matching operations */
interface MatchContext {
  /** bounded work shared by every similarity-matching phase */
  similarityBudget: SimilarityBudget;
  /** accumulators for matched nodes and refs across both ASTs */
  state: MatchState;
  /** source AST */
  astA: DocumentNode;
  /** target AST */
  astB: DocumentNode;
  /** function to compute ancestry context */
  computeAncestry: ComputeAncestry;
  /** callback to register matched ref pairs */
  registerMatchRef: (sourceNode: BlockNode, targetNode: BlockNode) => void;
}

/**
 * identifies corresponding nodes between two AST trees
 *
 * responsibilities:
 * - match nodes by `ref` attribute (identity matching)
 * - fall back to structural/positional matching
 * - handle moved nodes (same ref, different position)
 */
export class TreeMatcher {
  #astA: DocumentNode;
  #astB: DocumentNode;
  #refMapA: Map<string, Children>;
  #refMapB: Map<string, Children>;
  #virtualRefMap = new Map<BlockNode, string>();
  #virtuals = new Map<string, BlockNode>();

  /**
   * creates a new TreeMatcher
   * @param astA source AST to compare from
   * @param astB target AST to compare to
   */
  constructor(astA: DocumentNode, astB: DocumentNode) {
    this.#astA = astA;
    this.#astB = astB;
    this.#refMapA = buildRefMap(astA);
    this.#refMapB = buildRefMap(astB);
  }

  /**
   * gets the cached virtual ref for a node, if one was generated
   * @param node node to look up
   * @returns virtual ref or undefined if none was generated
   */
  public getVirtualRef(node: BlockNode): string | undefined {
    return this.#virtualRefMap.get(node);
  }

  /**
   * gets or creates a virtual ref for a source node, tracking it in virtuals
   * this is used when emitting source-anchored operation refs (update/delete/move)
   * @param node source node to get or create a virtual ref for
   * @returns explicit ref or virtual ref
   */
  public getOrCreateVirtualRef(node: BlockNode): string {
    return this.#getOrCreateRef(node, true);
  }

  /**
   * returns the map of virtual refs to their source AST nodes
   * only source-side nodes are tracked, so diff results can resolve refs back
   * to source nodes without traversing the source AST again
   * @returns virtual ref to source node map
   */
  public getVirtuals(): Map<string, BlockNode> {
    return this.#virtuals;
  }

  /**
   * matches nodes between the two ASTs
   *
   * uses a 3-phase pipeline:
   * - phase 1: ref matching (identity matching by ref attribute)
   * - phase 2: recursive child matching (scoped matching within ref-matched pairs)
   * - phase 3: inference matching (new non-ref nodes → old ref nodes)
   * - phase 4: fallback similarity (remaining nodes without refs)
   * @returns array of matched node pairs
   */
  public match(): MatchedPair[] {
    const computeAncestry: ComputeAncestry = (ast, path) =>
      this.#computeAncestry(ast, path);
    const matchState: MatchState = {
      pairs: [],
      matchedRefsA: new Set<string>(),
      matchedRefsB: new Set<string>(),
      matchedNodesA: new Set<BlockNode>(),
      matchedNodesB: new Set<BlockNode>(),
    };
    const matchContext: MatchContext = {
      similarityBudget: createSimilarityBudget(),
      state: matchState,
      astA: this.#astA,
      astB: this.#astB,
      computeAncestry,
      registerMatchRef: (
        sourceNode: BlockNode,
        targetNode: BlockNode,
      ): void => {
        this.#registerMatchRef(sourceNode, targetNode);
      },
    };

    const refPairs = this.#applyRefMatches(matchContext);
    this.#matchRefChildren(refPairs, matchContext);

    const { pairs, matchedRefsA, matchedRefsB, matchedNodesA, matchedNodesB } =
      matchContext.state;

    const unmatchedA = collectUnmatchedNodes(this.#astA, matchedRefsA).filter(
      (entry) => !matchedNodesA.has(entry.node),
    );
    const unmatchedB = collectUnmatchedNodes(this.#astB, matchedRefsB).filter(
      (entry) => !matchedNodesB.has(entry.node),
    );

    const inferenceContext = createInferenceContext(unmatchedA, unmatchedB);
    inferenceContext.similarityBudget = matchContext.similarityBudget;

    this.#matchRemainingNodes(inferenceContext, matchContext);

    return pairs;
  }

  /**
   * matches ref-based pairs and tracks matched nodes/refs
   * @param matchContext shared context for ancestry and match state
   * @returns ref-matched pairs
   */
  #applyRefMatches(matchContext: MatchContext): MatchedPair[] {
    const { state: matchState, computeAncestry } = matchContext;
    const { pairs, matchedRefsA, matchedRefsB, matchedNodesA, matchedNodesB } =
      matchState;
    const refPairs = matchByRef({
      source: { ast: this.#astA, map: this.#refMapA },
      target: { ast: this.#astB, map: this.#refMapB },
      computeAncestry,
    });
    for (const pair of refPairs) {
      pairs.push(pair);
      matchedRefsA.add(pair.nodeA!.ref!);
      matchedRefsB.add(pair.nodeB!.ref!);
      matchedNodesA.add(pair.nodeA!);
      matchedNodesB.add(pair.nodeB!);
    }

    for (const [ref, entryA] of this.#refMapA) {
      if (!this.#refMapB.has(ref)) {
        markDescendantsAsMatched({
          node: entryA.node,
          matchedNodes: matchedNodesA,
          matchedRefs: matchedRefsA,
        });
      }
    }

    return refPairs;
  }

  /**
   * matches children within ref-matched container pairs
   * @param refPairs ref-matched pairs to process
   * @param matchContext shared context for ancestry computation and ref registration
   */
  #matchRefChildren(refPairs: MatchedPair[], matchContext: MatchContext): void {
    for (const pair of refPairs) {
      matchChildrenRecursively({
        source: { node: pair.nodeA!, path: pair.pathA! },
        target: { node: pair.nodeB!, path: pair.pathB! },
        context: matchContext,
      });
    }
  }

  /**
   * matches remaining nodes using inference and fallback similarity
   * @param inferenceContext inference context with tracked nodes
   * @param matchContext shared context for ancestry and ref registration
   */
  #matchRemainingNodes(
    inferenceContext: InferenceContext,
    matchContext: MatchContext,
  ): void {
    const { pairs } = matchContext.state;
    const inferencePairs = matchByInference(inferenceContext, matchContext);
    pairs.push(...inferencePairs);

    const fallbackPairs = matchByFallbackSimilarity({
      context: inferenceContext,
      astA: matchContext.astA,
      astB: matchContext.astB,
      computeAncestry: matchContext.computeAncestry,
    });
    pairs.push(...fallbackPairs);
  }

  /**
   * traverses one step in the path and returns the node at that position
   * @param params traversal inputs
   * @returns traversal step result or undefined if path is invalid
   */
  #traversePathSegment(
    params: TraversePathSegmentParams,
  ): PathTraversalStep | undefined {
    const { current, prop, index } = params;
    const children = getChildrenByProperty(current, prop);
    if (!children) {
      return undefined;
    }

    const node = children.at(index);
    if (node === undefined) {
      return undefined;
    }

    return { node, children, index };
  }

  /**
   * computes ancestry context for a node at the given path
   * @param ast AST to traverse
   * @param path path to the target node
   * @returns ancestry context with parent refs and optional afterRef
   */
  #computeAncestry(ast: DocumentNode, path: Path): AncestryContext {
    const parentRefs: string[] = [];
    let afterRef: string | undefined;
    let current: DocumentNode | BlockNode = ast;
    const segments = [...path];
    const isSource = ast === this.#astA;

    while (segments.length > 0) {
      const prop = segments.shift() as string;
      const index = segments.shift() as number;

      const step = this.#traversePathSegment({ current, prop, index });
      if (!step) {
        break;
      }

      // afterRef: preceding sibling at final level
      // children is a dense array - at(index) exists and index > 0 guarantees at(index - 1) exists
      if (segments.length === 0 && step.index > 0) {
        afterRef = this.#getOrCreateRef(
          step.children.at(step.index - 1)!,
          isSource,
        );
      }

      // parentRefs: collect from intermediate nodes (not target)
      if (segments.length > 0) {
        parentRefs.push(this.#getOrCreateRef(step.node, isSource));
      }

      current = step.node;
    }

    return { parentRefs, ...(afterRef && { afterRef }) };
  }

  /**
   * registers a matched ref pair, propagating or generating shared virtual refs
   * @param sourceNode source AST node
   * @param targetNode target AST node
   */
  #registerMatchRef(sourceNode: BlockNode, targetNode: BlockNode): void {
    if (sourceNode.ref) {
      // propagate source ref to target's virtualRefMap entry
      if (!targetNode.ref && !this.#virtualRefMap.has(targetNode)) {
        this.#virtualRefMap.set(targetNode, sourceNode.ref);
      }
    } else {
      // neither has ref — generate one shared virtual ref
      const sharedRef = generateLocalRef();
      // defensive guards: matchPairedChildren and matchByInference only invoke
      // this callback once per (sourceNode, targetNode) pair, so the same
      // node cannot already be in the virtualRefMap when we get here.
      /* v8 ignore start */
      if (!this.#virtualRefMap.has(sourceNode)) {
        this.#virtualRefMap.set(sourceNode, sharedRef);
      }
      if (!targetNode.ref && !this.#virtualRefMap.has(targetNode)) {
        this.#virtualRefMap.set(targetNode, sharedRef);
      }
      /* v8 ignore stop */
      this.#virtuals.set(sharedRef, sourceNode);
    }
  }

  /**
   * gets explicit ref or generates/retrieves virtual ref for a node
   * @param node node to get ref for
   * @param isSource whether this node is from the source AST
   * @returns explicit ref or cached virtual ref
   */
  #getOrCreateRef(node: BlockNode, isSource = false): string {
    if (node.ref) {
      return node.ref;
    }
    const cached = this.#virtualRefMap.get(node);
    if (cached) {
      return cached;
    }
    const virtualRef = generateLocalRef();
    this.#virtualRefMap.set(node, virtualRef);

    if (isSource) {
      this.#virtuals.set(virtualRef, node);
    }

    return virtualRef;
  }
}
