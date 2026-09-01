import type { PartialDeep } from 'type-fest';

import type { BlockNode, DocumentNode } from '#types';

// TYPE DEFINITIONS //

/** array of property keys and indices representing path to AST node */
export type Path = Array<string | number>;

/** discriminated union of all diff operation types */
export type DiffOperation =
  | DeleteOperation
  | InsertOperation
  | UpdateOperation
  | MoveOperation;

/** delete operation describing a node removal from the AST */
export interface DeleteOperation {
  type: 'delete';
  /** ref from the removed node */
  ref?: string;
  /** path to the node in source AST */
  path: Path;
  /** the removed node */
  node: BlockNode;
  /** chain of explicit or generated ancestor refs from root to parent in source AST */
  parentRefs: string[];
}

/** insert operation describing a new node added to the AST */
export interface InsertOperation {
  type: 'insert';
  /** ref from the added node */
  ref?: string;
  /** path to the node in target AST */
  path: Path;
  /** the added node */
  node: BlockNode;
  /** chain of explicit or generated ancestor refs from root to parent */
  parentRefs: string[];
  /** explicit or generated ref of preceding sibling (omitted only for the first child) */
  afterRef?: string;
}

/** move operation describing a node relocation within the AST */
export interface MoveOperation {
  type: 'move';
  /** ref from the moved node */
  ref?: string;
  /** original path in source AST */
  from: Path;
  /** new path in target AST */
  to: Path;
  /** the moved node */
  node: BlockNode;
  /** chain of explicit or generated ancestor refs in source AST */
  fromParentRefs: string[];
  /** chain of explicit or generated ancestor refs in target AST */
  toParentRefs: string[];
  /** explicit or generated ref of preceding sibling (omitted only for the first child) */
  toAfterRef?: string;
}

/** update operation describing property changes to an existing node */
export interface UpdateOperation {
  type: 'update';
  /** ref from original node, or virtual ref for positionally-matched nodes */
  ref: string;
  /** path to the node */
  path: Path;
  /** original node from source AST */
  old: BlockNode;
  /** updated node from target AST */
  new: BlockNode;
  /** properties from old node that changed or were removed */
  from: PartialDeep<BlockNode>;
  /** properties in new node that changed or were added */
  to: PartialDeep<BlockNode>;
  /** chain of explicit or generated ancestor refs from the target position */
  parentRefs: string[];
}

/** result of comparing two AST documents */
export interface Diff {
  /** clone of input AST with reconciled refs assigned; the original input is never mutated */
  sourceAst: DocumentNode;
  /** clone of input AST with reconciled refs assigned; the original input is never mutated */
  targetAst: DocumentNode;
  /** ordered list of diff operations to transform source to target */
  operations: DiffOperation[];
  /** generated refs used by operations or ancestry, mapped to source AST nodes */
  virtuals: Record<string, BlockNode>;
  /** aggregate counts of each operation type */
  summary: {
    /** number of nodes added */
    inserts: number;
    /** number of nodes removed */
    deletes: number;
    /** number of nodes modified in place */
    updates: number;
    /** number of nodes moved to different positions */
    moves: number;
  };
}
