import { areValuesEqual, isAmbiguousTableLayoutPair } from './utilities';

import type { PartialDeep } from 'type-fest';

import type { BlockNode } from '#types/ast';

// TYPES //

/** result of computing the delta between two nodes */
export interface NodeDelta {
  /** values present in the original node */
  from: PartialDeep<BlockNode>;
  /** values present in the updated node */
  to: PartialDeep<BlockNode>;
}

// CONSTANTS //

/** properties excluded from delta computation (position is captured by path) */
const EXCLUDED_KEYS = new Set(['range']);

/**
 * computes the delta between two block nodes
 * @param nodeA original node
 * @param nodeB updated node
 * @returns delta with values differing between nodes
 */
export function computeNodeDelta(
  nodeA: BlockNode,
  nodeB: BlockNode,
): NodeDelta {
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};

  const allKeys = new Set([...Object.keys(nodeA), ...Object.keys(nodeB)]);
  const isAmbiguous = isAmbiguousTableLayoutPair(nodeA, nodeB);

  for (const key of allKeys) {
    if (EXCLUDED_KEYS.has(key)) {
      continue;
    }

    // skip type comparison for ambiguous table/layout pairs
    if (key === 'type' && isAmbiguous) {
      continue;
    }

    const valueA = (nodeA as Record<string, unknown>)[key];
    const valueB = (nodeB as Record<string, unknown>)[key];

    if (!areValuesEqual(valueA, valueB)) {
      if (valueA !== undefined) {
        from[key] = valueA;
      }
      if (valueB !== undefined) {
        to[key] = valueB;
      }
    }
  }

  return {
    from: from as PartialDeep<BlockNode>,
    to: to as PartialDeep<BlockNode>,
  };
}
