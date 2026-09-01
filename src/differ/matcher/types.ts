import type { BlockNode } from '#types/ast';
import type { Path } from '#types/diff';

/** indicates how a pair of nodes was matched */
export type MatchType = 'ref' | 'positional' | 'added' | 'removed';

/** ancestry context for a node in the AST */
export interface AncestryContext {
  /** chain of ancestor refs from root to parent (only includes ancestors with refs) */
  parentRefs: string[];
  /** ref of preceding sibling (omitted if first child or sibling has no ref) */
  afterRef?: string;
}

/** represents a matched pair of nodes from two AST trees */
export interface MatchedPair {
  /** node from source AST (null if added) */
  nodeA: BlockNode | null;
  /** node from target AST (null if removed) */
  nodeB: BlockNode | null;
  /** path to node in source AST */
  pathA: Path | null;
  /** path to node in target AST */
  pathB: Path | null;
  /** how this pair was matched */
  matchType: MatchType;
  /** ancestry context for nodeA (null if added) */
  ancestryA: AncestryContext | null;
  /** ancestry context for nodeB (null if removed) */
  ancestryB: AncestryContext | null;
}
