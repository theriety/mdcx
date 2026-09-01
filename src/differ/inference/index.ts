/**
 * inference matching orchestrator
 *
 * coordinates multiple inference strategies to match nodes without refs
 * by trying strategies in priority order until a match is found
 */

import { createSimilarityBudget } from '#differ/similarity';

import { contentStrategy } from './content';
import { fingerprintStrategy } from './fingerprint';
import { positionalStrategy } from './positional';
import { structuralStrategy } from './structural';

import type { BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

import type {
  InferenceContext,
  InferenceResult,
  InferenceStrategy,
  TrackedNode,
} from './types';

/** result of inference matching phase */
export interface InferenceMatchResult {
  /** matched new node */
  newNode: TrackedNode;
  /** matched old node */
  oldNode: TrackedNode;
  /** inference result with score and strategy info */
  result: InferenceResult;
}

interface RecordMatchParams {
  newIndex: number;
  oldNode: TrackedNode;
  context: InferenceContext;
}

/** minimum score threshold for accepting an inference match */
const MIN_INFERENCE_THRESHOLD = 0.5;

/** all available inference strategies sorted by priority */
const STRATEGIES: InferenceStrategy[] = [
  positionalStrategy,
  contentStrategy,
  structuralStrategy,
  fingerprintStrategy,
].sort((a, b) => a.priority - b.priority);

/**
 * creates inference context from AST nodes
 * @param oldNodes nodes from old AST
 * @param newNodes nodes from new AST
 * @returns initialized inference context
 */
export function createInferenceContext(
  oldNodes: Array<{ node: BlockNode; path: Path; index: number }>,
  newNodes: Array<{ node: BlockNode; path: Path; index: number }>,
): InferenceContext {
  const oldByRef = new Map<string, TrackedNode>();
  const newByRef = new Map<string, TrackedNode>();

  for (const tracked of oldNodes) {
    if (tracked.node.ref) {
      oldByRef.set(tracked.node.ref, tracked);
    }
  }

  for (const tracked of newNodes) {
    if (tracked.node.ref) {
      newByRef.set(tracked.node.ref, tracked);
    }
  }

  return {
    similarityBudget: createSimilarityBudget(),
    oldNodes,
    newNodes,
    oldByRef,
    newByRef,
    matchedOldIndices: new Set(),
    matchedNewIndices: new Set(),
    matches: new Map(),
  };
}

/**
 * attempts to find inference match for an unmatched new node
 *
 * tries each strategy in priority order and returns first match
 * above the minimum threshold
 * @param newNode the new node to find a match for
 * @param context shared inference context
 * @returns best inference result above threshold, or null
 */
export function findInferenceMatch(
  newNode: TrackedNode,
  context: InferenceContext,
): InferenceResult | null {
  // skip if node has a ref (should use direct matching)
  if (newNode.node.ref) {
    return null;
  }

  // try each strategy in priority order
  for (const strategy of STRATEGIES) {
    const result = strategy.infer(newNode, context);

    if (result && result.score >= MIN_INFERENCE_THRESHOLD) {
      return result;
    }
  }

  return null;
}

/**
 * marks a match in the inference context
 * @param params match data and inference context
 * @param params.newIndex index of new node
 * @param params.oldNode matched old node
 * @param params.context inference context to update
 */
export function recordMatch(params: RecordMatchParams): void {
  const { newIndex, oldNode, context } = params;
  context.matchedNewIndices.add(newIndex);
  context.matchedOldIndices.add(oldNode.index);
  context.matches.set(newIndex, oldNode);
}

/**
 * performs inference matching for all unmatched new nodes
 *
 * iterates through new nodes without refs and attempts to match them
 * to old nodes with refs using inference strategies
 * @param context inference context with tracked nodes
 * @returns array of successful inference matches
 */
export function matchByInference(
  context: InferenceContext,
): InferenceMatchResult[] {
  const results: InferenceMatchResult[] = [];

  for (const newNode of context.newNodes) {
    // skip already matched nodes
    if (context.matchedNewIndices.has(newNode.index)) {
      continue;
    }

    // skip nodes with refs (they should use direct ref matching)
    if (newNode.node.ref) {
      continue;
    }

    const inferenceResult = findInferenceMatch(newNode, context);

    if (inferenceResult) {
      // find the old tracked node from the result
      const oldTracked = context.oldNodes.find(
        (old) => old.node === inferenceResult.match,
      );

      if (oldTracked) {
        recordMatch({ newIndex: newNode.index, oldNode: oldTracked, context });
        results.push({
          newNode,
          oldNode: oldTracked,
          result: inferenceResult,
        });
      }
    }
  }

  return results;
}
