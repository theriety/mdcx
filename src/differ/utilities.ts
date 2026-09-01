import type { JsonValue } from 'type-fest';

import type { AncestryContext } from '#differ/matcher';
import type { BlockNode, TableNode } from '#types/ast';
import type { Path } from '#types/diff';

/**
 * returns the keys of an object whose values are not undefined
 * used by deep-equality helpers so that `{ x: undefined }` is treated as `{}`
 * @param value the object to inspect
 * @returns array of keys with defined values
 */
function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

/**
 * recursively strips all `range` properties from an object
 *
 * used for comparing nodes where positional range changes should be ignored
 * (e.g., when comparing content arrays where items may have shifted positions)
 * @param input object to strip ranges from
 * @returns new object with all `range` properties removed at all levels
 */
export function stripRangesDeep(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(stripRangesDeep);
  }

  if (typeof input === 'object' && input !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'range') {
        result[key] = stripRangesDeep(value);
      }
    }

    return result;
  }

  return input;
}

/**
 * sibling info for computing expected afterRef
 * @property ref the ref of the sibling (undefined if no explicit ref)
 * @property index the original index of the sibling in the child list
 * @property deleted whether this sibling was deleted in the operation
 */
export interface SiblingInfo {
  ref: string | undefined;
  index: number;
  deleted: boolean;
}

/**
 * compares two objects for deep equality regardless of property order
 * @param a first object to compare
 * @param b second object to compare
 * @returns true if objects are deeply equal regardless of property order
 */
export function areObjectsEqual(
  a: object | undefined,
  b: object | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = definedKeys(recordA);
  const keysB = definedKeys(recordB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every(
    (key) => key in recordB && areValuesEqual(recordA[key], recordB[key]),
  );
}

/**
 * compares two arrays for deep equality
 * @param a first array to compare
 * @param b second array to compare
 * @returns true if arrays are deeply equal
 */
export function areArraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((val, i) => {
    const other = b[i];

    if (Array.isArray(val) && Array.isArray(other)) {
      return areArraysEqual(val, other);
    }

    if (
      typeof val === 'object' &&
      val !== null &&
      typeof other === 'object' &&
      other !== null
    ) {
      return areObjectsEqual(
        val as Record<string, JsonValue>,
        other as Record<string, JsonValue>,
      );
    }

    return val === other;
  });
}

/**
 * compares two values of any type for deep equality
 * @param a first value to compare
 * @param b second value to compare
 * @returns true if values are deeply equal
 */
export function areValuesEqual(a: unknown, b: unknown): boolean {
  // handle identical values (including primitives)
  if (a === b) {
    return true;
  }

  // handle null/undefined
  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  // handle type mismatch
  if (typeof a !== typeof b) {
    return false;
  }

  // handle non-objects (primitives already checked above)
  if (typeof a !== 'object') {
    return false;
  }

  // handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return areArraysEqual(a, b);
  }

  // handle array vs non-array mismatch
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // handle objects
  return areObjectsEqual(a, b as object);
}

/**
 * checks if a pair of nodes represents an ambiguous table/layout comparison
 *
 * this occurs when:
 * - one node is a table with undefined/empty headers
 * - the other node is a layout
 *
 * in this case, we can't determine if a type change is real since
 * the table without headers renders identically to a layout
 * @param nodeA first node to compare
 * @param nodeB second node to compare
 * @returns true if the comparison is ambiguous
 */
export function isAmbiguousTableLayoutPair(
  nodeA: BlockNode,
  nodeB: BlockNode,
): boolean {
  const types = new Set([nodeA.type, nodeB.type]);

  // must be exactly table and layout (not both same type)
  if (!types.has('table') || !types.has('layout') || types.size !== 2) {
    return false;
  }

  // find the table node and check if it has undefined/empty headers
  const tableNode = (nodeA.type === 'table' ? nodeA : nodeB) as TableNode;
  const headers = tableNode.headers;

  return headers === undefined || headers.length === 0;
}

/**
 * checks if two paths are different
 * @param pathA first path
 * @param pathB second path
 * @returns true if paths differ
 */
export function doPathsDiffer(pathA: Path, pathB: Path): boolean {
  if (pathA.length !== pathB.length) {
    return true;
  }

  return pathA.some((segment, i) => segment !== pathB[i]);
}

/**
 * checks if two paths are equal
 * @param pathA first path to compare
 * @param pathB second path to compare
 * @returns true if paths have identical segments
 */
export function arePathsEqual(
  pathA: ReadonlyArray<string | number>,
  pathB: ReadonlyArray<string | number>,
): boolean {
  if (pathA.length !== pathB.length) {
    return false;
  }

  return pathA.every((segment, i) => segment === pathB[i]);
}

/**
 * generates a unique key for a parent container
 * @param ancestry ancestry context containing parentRefs
 * @returns unique key for the parent container
 */
export function getParentKey(ancestry: AncestryContext | null): string {
  return ancestry?.parentRefs.join('/') ?? 'root';
}

/**
 * computes expected afterRef after accounting for deletions
 *
 * walks backwards through siblings from the given index,
 * skipping deleted nodes, to find the first surviving predecessor
 * @param siblings sorted sibling info for the container
 * @param currentIndex the node's index in the original sibling list
 * @returns expected afterRef (undefined if should be first child)
 */
export function computeExpectedAfterRef(
  siblings: SiblingInfo[],
  currentIndex: number,
): string | undefined {
  // find our position in the sibling list
  const siblingIdx = siblings.findIndex((s) => s.index === currentIndex);

  // walk backwards to find first non-deleted predecessor
  // for first child (siblingIdx = 0) or not found (siblingIdx = -1),
  // the loop doesn't execute and we return undefined naturally
  for (let i = siblingIdx - 1; i >= 0; i--) {
    const sibling = siblings[i] as SiblingInfo | undefined;

    if (sibling === undefined) {
      continue;
    }

    if (!sibling.deleted) {
      return sibling.ref;
    }
  }

  // all predecessors were deleted (or no predecessors exist)
  return undefined;
}
