import { TreeMatcher } from './differ/matcher';
import { OperationGenerator } from './differ/operations';
import { buildRefMap, getChildrenByProperty } from './differ/traversal';

import type { BlockNode, DocumentNode } from '#types/ast';
import type { DiffOperation, Diff, Path } from '#types/diff';

import type { MatchedPair } from './differ/matcher';

// TYPE DEFINITIONS //

/** parameters for collecting virtual ref sources from operation usage */
interface BuildVirtualRefSourcesParams {
  /** set of virtual refs found in operations */
  usedRefs: Set<string>;
  /** matcher's map of virtual ref to source node */
  virtualsMap: Map<string, BlockNode>;
  /** reconciled source AST to search for explicit virtual refs */
  sourceAst: DocumentNode;
}

/** parameters for reconciling refs across matched source/target AST pairs */
export interface ReconcileAstsParams {
  /** source AST to clone and reconcile */
  sourceAst: DocumentNode;
  /** target AST to clone and reconcile */
  targetAst: DocumentNode;
  /** matched node pairs to reconcile refs across */
  pairs: MatchedPair[];
  /** matcher that owns inferred virtual refs */
  matcher: TreeMatcher;
}

// FUNCTIONS //

/**
 * collects all virtual refs used in the given operations
 * @param operations diff operations to scan
 * @returns set of virtual ref strings found in operations
 */
function collectVirtualRefsFromOperations(
  operations: DiffOperation[],
): Set<string> {
  const used = new Set<string>();

  const add = (ref: string | undefined): void => {
    if (ref?.startsWith('#')) {
      used.add(ref);
    }
  };

  const addAll = (refs: string[]): void => {
    for (const ref of refs) {
      add(ref);
    }
  };

  for (const operation of operations) {
    add(operation.ref);
    switch (operation.type) {
      case 'insert': {
        addAll(operation.parentRefs);
        add(operation.afterRef);
        break;
      }
      case 'delete': {
        addAll(operation.parentRefs);
        break;
      }
      case 'update': {
        addAll(operation.parentRefs);
        break;
      }
      case 'move': {
        addAll(operation.fromParentRefs);
        addAll(operation.toParentRefs);
        add(operation.toAfterRef);
        break;
      }
      // v8 ignore next 3 -- defensive guard: OperationGenerator never emits unknown discriminants
      default:
        throw new Error(
          `Unknown operation type: ${(operation as DiffOperation).type}`,
        );
    }
  }

  return used;
}

/**
 * builds virtual ref sources from operation-used refs and matcher source mapping
 * @param params build inputs
 * @returns record with only the used virtual refs
 */
function buildVirtualRefSources(
  params: BuildVirtualRefSourcesParams,
): Record<string, BlockNode> {
  const { usedRefs, virtualsMap, sourceAst } = params;
  const virtuals: Record<string, BlockNode> = {};
  const sourceRefs = buildRefMap(sourceAst);

  for (const ref of usedRefs) {
    const node = virtualsMap.get(ref) ?? sourceRefs.get(ref)?.node;
    if (node) {
      virtuals[ref] = node;
    }
  }

  return virtuals;
}

/**
 * clones a document AST for reconciliation without mutating caller-owned input
 * @param ast document AST to clone
 * @returns cloned document AST
 */
function cloneAst(ast: DocumentNode): DocumentNode {
  return structuredClone(ast);
}

/**
 * returns the block node at a diff path
 * @param ast document AST to traverse
 * @param path path to the block node
 * @returns block node at the supplied path
 */
function getNodeAtPath(ast: DocumentNode, path: Path): BlockNode {
  let current: DocumentNode | BlockNode = ast;

  for (let index = 0; index < path.length; index += 2) {
    const prop = path[index] as string;
    const childIndex = path[index + 1] as number;
    const children = getChildrenByProperty(current, prop);

    /* v8 ignore start -- defensive guard: paths come from matched pairs which are validated by construction */
    if (!children?.[childIndex]) {
      throw new Error(`Invalid diff path: ${path.join('.')}`);
    }
    /* v8 ignore stop */

    current = children[childIndex];
  }

  return current as BlockNode;
}

/**
 * assigns a ref to a cloned node when doing so preserves the canonical identity
 * @param node cloned node to update
 * @param ref reconciled ref
 */
function assignRef(node: BlockNode, ref: string): void {
  node.ref ??= ref;
}

/**
 * resolves the ref shared by a matched source/target pair
 * @param pair matched pair to inspect
 * @param matcher matcher that owns inferred virtual refs
 * @returns ref to apply to cloned nodes, or undefined when refs should be preserved
 */
function getReconciledRef(
  pair: MatchedPair,
  matcher: TreeMatcher,
): string | undefined {
  if (!pair.nodeA || !pair.nodeB) {
    return undefined;
  }

  if (pair.nodeA.ref) {
    return pair.nodeA.ref;
  }

  if (pair.nodeB.ref) {
    return undefined;
  }

  return (
    matcher.getVirtualRef(pair.nodeA) ??
    matcher.getOrCreateVirtualRef(pair.nodeA)
  );
}

/**
 * creates source/target ASTs with refs reconciled across matched nodes
 * @param params reconciliation inputs
 * @returns reconciled cloned AST pair
 */
function reconcileAsts(params: ReconcileAstsParams): {
  sourceAst: DocumentNode;
  targetAst: DocumentNode;
} {
  const { sourceAst: astA, targetAst: astB, pairs, matcher } = params;
  const sourceAst = cloneAst(astA);
  const targetAst = cloneAst(astB);

  for (const pair of pairs) {
    const ref = getReconciledRef(pair, matcher);
    if (!ref || !pair.pathA || !pair.pathB) {
      continue;
    }

    assignRef(getNodeAtPath(sourceAst, pair.pathA), ref);
    assignRef(getNodeAtPath(targetAst, pair.pathB), ref);
  }

  return { sourceAst, targetAst };
}

/**
 * generates diff operations for already-reconciled ASTs
 * @param sourceAst cloned source document with reconciled refs
 * @param targetAst cloned target document with reconciled refs
 * @returns operations and virtual refs from the reconciled trees
 */
function diffReconciledAsts(
  sourceAst: DocumentNode,
  targetAst: DocumentNode,
): { operations: DiffOperation[]; virtuals: Record<string, BlockNode> } {
  const matcher = new TreeMatcher(sourceAst, targetAst);
  const pairs = matcher.match();
  const generator = new OperationGenerator({
    pairs,
    getVirtualRef: (node) => matcher.getVirtualRef(node),
    resolveVirtualRef: (node) => matcher.getOrCreateVirtualRef(node),
  });
  const operations = generator.generate();
  const usedRefs = collectVirtualRefsFromOperations(operations);
  const virtuals = buildVirtualRefSources({
    usedRefs,
    virtualsMap: matcher.getVirtuals(),
    sourceAst,
  });

  return { operations, virtuals };
}

/**
 * computes the semantic differences between two MDC AST trees
 * @param astA source AST
 * @param astB target AST
 * @returns diff object containing all change operations
 * @example
 * ```typescript
 * const astA = parse('# Hello\n\nWorld');
 * const astB = parse('# Hello\n\nUniverse');
 *
 * const changes = diff(astA, astB);
 * const update = changes.operations.find(
 *   (operation) => operation.type === 'update',
 * );
 * console.log(update?.old, update?.new, update?.from, update?.to);
 * ```
 */
export function diff(astA: DocumentNode, astB: DocumentNode): Diff {
  const matcher = new TreeMatcher(astA, astB);
  const pairs = matcher.match();
  const { sourceAst, targetAst } = reconcileAsts({
    sourceAst: astA,
    targetAst: astB,
    pairs,
    matcher,
  });
  const { operations, virtuals } = diffReconciledAsts(sourceAst, targetAst);

  return {
    sourceAst,
    targetAst,
    operations,
    virtuals,
    summary: {
      inserts: operations.filter((o) => o.type === 'insert').length,
      deletes: operations.filter((o) => o.type === 'delete').length,
      updates: operations.filter((o) => o.type === 'update').length,
      moves: operations.filter((o) => o.type === 'move').length,
    },
  };
}
