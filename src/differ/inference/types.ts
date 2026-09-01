import type { SimilarityBudget } from '#differ/similarity';
import type { BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

/** names of available inference strategies */
export type InferenceStrategyName =
  | 'positional'
  | 'content'
  | 'structural'
  | 'fingerprint';

/** result from an inference strategy attempt */
export interface InferenceResult {
  /** matched node from the old AST */
  match: BlockNode;
  /** path to the matched node in old AST */
  path: Path;
  /** confidence score from 0 to 1 */
  score: number;
  /** name of strategy that produced this match */
  strategy: InferenceStrategyName;
}

/** node with its path for tracking during inference */
export interface TrackedNode {
  /** the block node */
  node: BlockNode;
  /** path to the node in the AST */
  path: Path;
  /** position index in children array */
  index: number;
}

/** context shared across inference strategies */
export interface InferenceContext {
  /** bounded similarity work shared across inference and fallback matching */
  similarityBudget: SimilarityBudget;
  /** all nodes from old AST with tracking info */
  oldNodes: TrackedNode[];
  /** all nodes from new AST with tracking info */
  newNodes: TrackedNode[];
  /** map of old node refs to tracked nodes for quick lookup */
  oldByRef: Map<string, TrackedNode>;
  /** map of new node refs to tracked nodes for quick lookup */
  newByRef: Map<string, TrackedNode>;
  /** set of old node indices that have been matched */
  matchedOldIndices: Set<number>;
  /** set of new node indices that have been matched */
  matchedNewIndices: Set<number>;
  /** map of matched pairs: newIndex -> oldTrackedNode */
  matches: Map<number, TrackedNode>;
}

/** interface for inference strategy implementations */
export interface InferenceStrategy {
  /** name of this strategy */
  name: InferenceStrategyName;
  /** priority for ordering strategies (lower = higher priority) */
  priority: number;
  /**
   * attempts to find a match for an unmatched new node
   * @param newNode the new node to find a match for
   * @param context shared inference context
   * @returns inference result if match found, null otherwise
   */
  infer: (
    newNode: TrackedNode,
    context: InferenceContext,
  ) => InferenceResult | null;
}
