/**
 * fingerprint inference strategy
 *
 * matches nodes based on structural context fingerprint:
 * - self type
 * - parent type (when nested)
 * - depth level
 * - sibling types
 *
 * lowest confidence strategy (0.5-0.8) because context can change
 * used as last resort when other strategies fail
 */

import { computeSetIntersectionSize } from '#differ/similarity';
import { arePathsEqual } from '#differ/utilities';

import { getUnmatchedOldNodesWithRefs, normalizeScore } from './utilities';

import type {
  InferenceContext,
  InferenceResult,
  InferenceStrategy,
  TrackedNode,
} from './types';

/** minimum fingerprint similarity threshold */
const MIN_FINGERPRINT_SIMILARITY = 0.6;

/** base score for fingerprint matches */
const BASE_FINGERPRINT_SCORE = 0.5;

/** maximum score for fingerprint matches */
const MAX_FINGERPRINT_SCORE = 0.8;

/** score range for fingerprint matches */
const FINGERPRINT_SCORE_RANGE = 0.3;

/** priority for this strategy (lower = higher priority) */
const STRATEGY_PRIORITY = 4;

// WEIGHT CONSTANTS //

/** weight for self type match */
const SELF_TYPE_WEIGHT = 0.4;

/** weight for parent type match */
const PARENT_TYPE_WEIGHT = 0.2;

/** weight for depth match */
const DEPTH_WEIGHT = 0.2;

/** weight for sibling type similarity */
const SIBLINGS_WEIGHT = 0.2;

/** structural fingerprint for context matching */
interface Fingerprint {
  /** block's own type */
  selfType: string;
  /** parent block's type (null if root level) */
  parentType: string | null;
  /** nesting depth (0 for root level) */
  depth: number;
  /** types of sibling blocks */
  siblingTypes: string[];
}

/**
 * calculates depth from path
 * @param path path to node
 * @returns depth level (0 for root)
 */
function getDepthFromPath(path: ReadonlyArray<string | number>): number {
  // path like ['children', 0] = depth 0
  // path like ['children', 0, 'children', 0] = depth 1
  let depth = 0;

  for (const segment of path) {
    if (segment === 'children') {
      depth++;
    }
  }

  // subtract 1 because first 'children' is root level
  return Math.max(0, depth - 1);
}

/**
 * creates fingerprint for a node
 * @param node tracked node
 * @param context inference context
 * @returns structural fingerprint
 */
function createFingerprint(
  node: TrackedNode,
  context: InferenceContext,
): Fingerprint {
  const depth = getDepthFromPath(node.path);

  // determine if node is from old or new AST based on presence in oldNodes
  const isOldNode = context.oldNodes.some(
    (n) => n.index === node.index && n.node === node.node,
  );
  const nodes = isOldNode ? context.oldNodes : context.newNodes;

  // collect sibling types at same depth
  const siblingTypes: string[] = [];

  for (const sibling of nodes) {
    if (sibling.index !== node.index) {
      const siblingDepth = getDepthFromPath(sibling.path);

      if (siblingDepth === depth) {
        siblingTypes.push(sibling.node.type);
      }
    }
  }

  // slice off last two segments (property name and index) to get parent path
  const PARENT_PATH_OFFSET = 2;
  const parentPath = node.path.slice(0, -PARENT_PATH_OFFSET);
  const parentType =
    parentPath.length === 0
      ? null
      : (nodes.find((tracked) => arePathsEqual(tracked.path, parentPath))?.node
          .type ?? null);

  return {
    selfType: node.node.type,
    parentType,
    depth,
    siblingTypes,
  };
}

/**
 * computes jaccard similarity between sibling type arrays
 * @param typesA first array of types
 * @param typesB second array of types
 * @returns similarity from 0 to 1
 */
function computeSiblingsSimilarity(typesA: string[], typesB: string[]): number {
  if (typesA.length === 0 && typesB.length === 0) {
    return 1;
  }

  if (typesA.length === 0 || typesB.length === 0) {
    return 0;
  }

  const setA = new Set(typesA);
  const setB = new Set(typesB);

  const intersection = computeSetIntersectionSize(setA, setB);
  const union = setA.size + setB.size - intersection;

  return intersection / union;
}

/**
 * computes fingerprint similarity between two fingerprints
 * @param fpA first fingerprint
 * @param fpB second fingerprint
 * @returns weighted similarity score
 */
function computeFingerprintSimilarity(
  fpA: Fingerprint,
  fpB: Fingerprint,
): number {
  // self type match (40%)
  const selfTypeScore = fpA.selfType === fpB.selfType ? 1 : 0;

  // parent type match (20%)
  const parentTypeScore = fpA.parentType === fpB.parentType ? 1 : 0;

  // depth match (20%)
  const depthScore = fpA.depth === fpB.depth ? 1 : 0;

  // sibling types similarity (20%)
  const siblingsScore = computeSiblingsSimilarity(
    fpA.siblingTypes,
    fpB.siblingTypes,
  );

  return (
    selfTypeScore * SELF_TYPE_WEIGHT +
    parentTypeScore * PARENT_TYPE_WEIGHT +
    depthScore * DEPTH_WEIGHT +
    siblingsScore * SIBLINGS_WEIGHT
  );
}

/**
 * fingerprint inference strategy implementation
 *
 * finds best structural fingerprint match among unmatched old nodes
 */
export const fingerprintStrategy: InferenceStrategy = {
  name: 'fingerprint',
  priority: STRATEGY_PRIORITY,

  /**
   * finds best structural fingerprint match among unmatched old nodes
   * @param newNode node to find match for
   * @param context inference context with tracked nodes
   * @returns inference result or null if no match found
   */
  infer(
    newNode: TrackedNode,
    context: InferenceContext,
  ): InferenceResult | null {
    const newFingerprint = createFingerprint(newNode, context);
    const candidates = getUnmatchedOldNodesWithRefs(context);

    let bestMatch: TrackedNode | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      const oldFingerprint = createFingerprint(candidate, context);
      const similarity = computeFingerprintSimilarity(
        newFingerprint,
        oldFingerprint,
      );

      if (
        similarity > bestSimilarity &&
        similarity >= MIN_FINGERPRINT_SIMILARITY
      ) {
        bestSimilarity = similarity;
        bestMatch = candidate;
      }
    }

    if (!bestMatch) {
      return null;
    }

    // calculate score: map similarity [0.6, 1.0] to [0.5, 0.8]
    const score = normalizeScore({
      similarity: bestSimilarity,
      minThreshold: MIN_FINGERPRINT_SIMILARITY,
      baseScore: BASE_FINGERPRINT_SCORE,
      scoreRange: FINGERPRINT_SCORE_RANGE,
      maxScore: MAX_FINGERPRINT_SCORE,
    });

    return {
      match: bestMatch.node,
      path: bestMatch.path,
      score,
      strategy: 'fingerprint',
    };
  },
};
