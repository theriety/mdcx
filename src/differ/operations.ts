import { computeNodeDelta } from './delta';
import {
  areArraysEqual,
  areObjectsEqual,
  computeExpectedAfterRef,
  doPathsDiffer,
  getParentKey,
  isAmbiguousTableLayoutPair,
  stripRangesDeep,
} from './utilities';

import type { AncestryContext, MatchedPair } from '#differ/matcher';
import type { SiblingInfo } from '#differ/utilities';
import type { BlockNode } from '#types/ast';
import type {
  InsertOperation,
  DiffOperation,
  UpdateOperation,
  MoveOperation,
  Path,
  DeleteOperation,
} from '#types/diff';

/** function type for retrieving virtual refs from TreeMatcher */
export type VirtualRefGetter = (node: BlockNode) => string | undefined;

/** function type for resolving a node to a guaranteed virtual ref */
export type VirtualRefResolver = (node: BlockNode) => string;

/** constructor parameters for OperationGenerator */
export interface OperationGeneratorParams {
  /** matched node pairs from TreeMatcher */
  pairs: MatchedPair[];
  /** function to retrieve virtual refs for nodes */
  getVirtualRef: VirtualRefGetter;
  /** function to resolve a node to a guaranteed virtual ref */
  resolveVirtualRef: VirtualRefResolver;
}

/** inputs for processing a single matched pair */
interface ProcessMatchedPairParams {
  /** matched pair to process */
  pair: MatchedPair;
  /** refs of deleted nodes */
  deletedRefs: Set<string>;
  /** sibling info per parent container */
  siblingMap: Map<string, SiblingInfo[]>;
}

/** inputs for creating a move operation */
interface CreateMoveOperationParams {
  /** moved node payload (target-side shape) */
  node: BlockNode;
  /** matched source node used for stable operation identity */
  sourceNode: BlockNode;
  /** original path in source AST */
  fromPath: Path;
  /** new path in target AST */
  toPath: Path;
  /** ancestry context from source AST */
  ancestryA: AncestryContext;
  /** ancestry context from target AST */
  ancestryB: AncestryContext;
}

/** inputs for creating an insert (add) operation */
interface CreateAddOperationParams {
  /** the added node */
  nodeB: BlockNode;
  /** path to the node in target AST */
  pathB: Path;
  /** ancestry context from target AST */
  ancestry: AncestryContext;
}

/** inputs for creating a delete (remove) operation */
interface CreateRemoveOperationParams {
  /** the removed node */
  nodeA: BlockNode;
  /** path to the node in source AST */
  pathA: Path;
  /** ancestry context from source AST */
  ancestry: AncestryContext;
}

/** inputs for creating a modify (update) operation */
interface CreateModifyOperationParams {
  /** original node from source AST */
  nodeA: BlockNode;
  /** updated node from target AST */
  nodeB: BlockNode;
  /** path to the node */
  path: Path;
  /** ancestry context from target AST */
  ancestry: AncestryContext;
}

/** inputs for determining if a matched pair represents a genuine move */
interface IsGenuineMoveParams {
  /** path to node in source AST */
  pathA: Path;
  /** path to node in target AST */
  pathB: Path;
  /** ancestry context from source AST */
  ancestryA: AncestryContext;
  /** ancestry context from target AST */
  ancestryB: AncestryContext;
  /** refs of nodes being deleted */
  deletedRefs: Set<string>;
  /** map of parent containers to sibling info */
  siblingMap: Map<string, SiblingInfo[]>;
}

/**
 * produces change operations from matched node pairs
 *
 * responsibilities:
 * - generate `add` operations for new nodes
 * - generate `remove` operations for deleted nodes
 * - generate `modify` operations for changed content/annotations
 * - generate `move` operations for repositioned nodes
 */
export class OperationGenerator {
  #pairs: MatchedPair[];
  #getVirtualRef: VirtualRefGetter;
  #resolveVirtualRef: VirtualRefResolver;

  /**
   * creates a new OperationGenerator
   * @param params constructor inputs
   */
  constructor(params: OperationGeneratorParams) {
    this.#pairs = params.pairs;
    this.#getVirtualRef = params.getVirtualRef;
    this.#resolveVirtualRef = params.resolveVirtualRef;
  }

  /**
   * generates diff operations from the matched pairs
   * @returns array of diff operations
   */
  public generate(): DiffOperation[] {
    const { deletedRefs, siblingMap } = this.#buildMoveContext();

    return this.#generateOperations(deletedRefs, siblingMap);
  }

  /**
   * builds context for spurious move detection
   * @returns deleted refs set and sibling map for each parent container
   */
  #buildMoveContext(): {
    deletedRefs: Set<string>;
    siblingMap: Map<string, SiblingInfo[]>;
  } {
    const deletedRefs = new Set<string>();
    const siblingMap = new Map<string, SiblingInfo[]>();

    for (const pair of this.#pairs) {
      if (pair.nodeA !== null && pair.nodeB === null && pair.nodeA.ref) {
        deletedRefs.add(pair.nodeA.ref);
      }

      if (pair.pathA) {
        const parentKey = getParentKey(pair.ancestryA);
        const index = pair.pathA[pair.pathA.length - 1] as number;
        const siblings = siblingMap.get(parentKey) ?? [];
        siblings.push({
          ref: pair.nodeA?.ref,
          index,
          deleted: pair.nodeB === null,
        });
        siblingMap.set(parentKey, siblings);
      }
    }

    for (const siblings of siblingMap.values()) {
      siblings.sort((a, b) => a.index - b.index);
    }

    return { deletedRefs, siblingMap };
  }

  /**
   * generates operations from pairs with spurious move filtering
   * @param deletedRefs refs of deleted nodes
   * @param siblingMap sibling info per parent container
   * @returns array of diff operations
   */
  #generateOperations(
    deletedRefs: Set<string>,
    siblingMap: Map<string, SiblingInfo[]>,
  ): DiffOperation[] {
    const operations: DiffOperation[] = [];

    for (const pair of this.#pairs) {
      const op = this.#processMatchedPair({ pair, deletedRefs, siblingMap });
      if (op) {
        operations.push(...op);
      }
    }

    return operations;
  }

  /**
   * processes a single matched pair to generate operations
   * @param params processing inputs
   * @returns array of operations or null
   */
  #processMatchedPair(
    params: ProcessMatchedPairParams,
  ): DiffOperation[] | null {
    const { pair, deletedRefs, siblingMap } = params;
    const { nodeA, nodeB, pathA, pathB, ancestryA, ancestryB } = pair;

    if (nodeA === null && nodeB !== null && pathB !== null && ancestryB) {
      return [this.#createAddOperation({ nodeB, pathB, ancestry: ancestryB })];
    }

    if (nodeA !== null && nodeB === null && pathA !== null && ancestryA) {
      return [
        this.#createRemoveOperation({ nodeA, pathA, ancestry: ancestryA }),
      ];
    }

    if (
      nodeA !== null &&
      nodeB !== null &&
      pathA !== null &&
      pathB !== null &&
      ancestryA &&
      ancestryB
    ) {
      const ops: DiffOperation[] = [];

      if (
        this.#isGenuineMove({
          pathA,
          pathB,
          ancestryA,
          ancestryB,
          deletedRefs,
          siblingMap,
        })
      ) {
        ops.push(
          this.#createMoveOperation({
            node: nodeB,
            sourceNode: nodeA,
            fromPath: pathA,
            toPath: pathB,
            ancestryA,
            ancestryB,
          }),
        );
      }

      const modifyOp = this.#createModifyOperation({
        nodeA,
        nodeB,
        path: pathB,
        ancestry: ancestryB,
      });

      if (modifyOp) {
        ops.push(modifyOp);
      }

      return ops.length > 0 ? ops : null;
    }

    return null;
  }

  /**
   * creates an add operation for a new node
   * @param params add operation inputs
   * @returns add diff operation
   */
  #createAddOperation(params: CreateAddOperationParams): InsertOperation {
    const { nodeB, pathB, ancestry } = params;
    // use explicit ref if present, otherwise use virtual ref if available
    const virtualRef = this.#getVirtualRef(nodeB);
    const ref = nodeB.ref ?? virtualRef;

    return {
      type: 'insert',
      ref,
      path: pathB,
      node: nodeB,
      parentRefs: ancestry.parentRefs,
      ...(ancestry.afterRef && { afterRef: ancestry.afterRef }),
    };
  }

  /**
   * creates a remove operation for a deleted node
   * @param params remove operation inputs
   * @returns remove diff operation
   */
  #createRemoveOperation(params: CreateRemoveOperationParams): DeleteOperation {
    const { nodeA, pathA, ancestry } = params;
    // delete identity is anchored to source; materialize a source virtual ref when needed
    const ref = nodeA.ref ?? this.#resolveVirtualRef(nodeA);

    return {
      type: 'delete',
      ref,
      path: pathA,
      node: nodeA,
      parentRefs: ancestry.parentRefs,
    };
  }

  /**
   * creates a modify operation if content or annotations changed
   * @param params modify operation inputs
   * @returns modify operation or null if unchanged
   */
  #createModifyOperation(
    params: CreateModifyOperationParams,
  ): UpdateOperation | null {
    const { nodeA, nodeB, path, ancestry } = params;
    if (this.#hasNodeChanged(nodeA, nodeB)) {
      const { from, to } = computeNodeDelta(nodeA, nodeB);

      const ref = nodeA.ref ?? this.#resolveVirtualRef(nodeA);

      return {
        type: 'update',
        ref,
        path,
        old: nodeA,
        new: nodeB,
        from,
        to,
        parentRefs: ancestry.parentRefs,
      };
    }

    return null;
  }

  /**
   * creates a move operation for a repositioned node
   * @param params move operation inputs
   * @returns move diff operation
   */
  #createMoveOperation(params: CreateMoveOperationParams): MoveOperation {
    const { node, sourceNode, fromPath, toPath, ancestryA, ancestryB } = params;
    // move identity is anchored to source; use target node only for payload shape
    const ref = sourceNode.ref ?? this.#resolveVirtualRef(sourceNode);

    return {
      type: 'move',
      ref,
      from: fromPath,
      to: toPath,
      node,
      fromParentRefs: ancestryA.parentRefs,
      toParentRefs: ancestryB.parentRefs,
      ...(ancestryB.afterRef && { toAfterRef: ancestryB.afterRef }),
    };
  }

  /**
   * checks if a node has changed (type, content, annotations, or headers)
   *
   * excludes `children` from comparison since those are matched and compared
   * separately to ensure changes are detected at the appropriate granularity level.
   * also strips `range` at all levels since positional changes are not semantic
   * @param nodeA original node
   * @param nodeB updated node
   * @returns true if node differs
   */
  #hasNodeChanged(nodeA: BlockNode, nodeB: BlockNode): boolean {
    // exclude range, children, and ref from comparison
    // children are matched separately to ensure proper granularity
    // ref is excluded because inference matching may pair nodes with different refs
    // use stripRangesDeep to remove range at all nesting levels (e.g., in content)
    const {
      range: _ra,
      children: _ca,
      ref: _refa,
      ...a
    } = nodeA as Record<string, unknown>;
    const {
      range: _rb,
      children: _cb,
      ref: _refb,
      ...b
    } = nodeB as Record<string, unknown>;

    // strip ranges from all nested objects (e.g., content array items)
    const strippedA = stripRangesDeep(a) as object;
    const strippedB = stripRangesDeep(b) as object;

    // handle ambiguous table/layout case: when comparing table (without headers)
    // to layout, they're equivalent and should not be considered changed
    if (isAmbiguousTableLayoutPair(nodeA, nodeB)) {
      // normalize: remove headers from comparison since empty/undefined headers
      // makes a table equivalent to a layout
      const { headers: _ha, ...normalizedA } = strippedA as Record<
        string,
        unknown
      >;
      const { headers: _hb, ...normalizedB } = strippedB as Record<
        string,
        unknown
      >;

      // also normalize type since table without headers is equivalent to layout
      const withoutTypeA = { ...normalizedA, type: 'layout' };
      const withoutTypeB = { ...normalizedB, type: 'layout' };

      return !areObjectsEqual(withoutTypeA, withoutTypeB);
    }

    return !areObjectsEqual(strippedA, strippedB);
  }

  /**
   * determines if a matched node pair represents a genuine move
   *
   * a move is spurious when:
   * - paths differ only due to index shifts from deletions
   * - the new afterRef matches what we'd expect after deletions
   * @param params move detection inputs
   * @returns true if this represents a genuine move operation
   */
  #isGenuineMove(params: IsGenuineMoveParams): boolean {
    const { pathA, pathB, ancestryA, ancestryB, deletedRefs, siblingMap } =
      params;
    // no path change = no move
    if (!doPathsDiffer(pathA, pathB)) {
      return false;
    }

    // moved to different parent container = genuine move
    if (!areArraysEqual(ancestryA.parentRefs, ancestryB.parentRefs)) {
      return true;
    }

    // same afterRef = spurious (index shift only)
    if (ancestryA.afterRef === ancestryB.afterRef) {
      return false;
    }

    // afterRef changed - need deeper analysis
    const oldAfterRef = ancestryA.afterRef;
    const newAfterRef = ancestryB.afterRef;

    // If old afterRef was NOT deleted, any change is genuine
    if (!oldAfterRef || !deletedRefs.has(oldAfterRef)) {
      return true;
    }

    // Old afterRef was deleted - compute expected afterRef
    // siblingMap is built from pairs with pathA using same parentKey, so entry exists
    const parentKey = getParentKey(ancestryA);
    const siblings = siblingMap.get(parentKey)!;

    const currentIndex = pathA[pathA.length - 1] as number;
    const expectedAfterRef = computeExpectedAfterRef(siblings, currentIndex);

    // If new afterRef matches expected (after deletions), it's spurious
    // If they differ, the node was genuinely moved
    return newAfterRef !== expectedAfterRef;
  }
}
