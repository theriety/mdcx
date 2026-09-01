import { createSimilarityBudget } from '#differ/similarity';

import type { InferenceContext, TrackedNode } from '#differ/inference/types';
import type { BlockNode } from '#types/ast';

/**
 * creates a TrackedNode for inference testing
 * @param node the BlockNode to track
 * @param index the index in the node list
 * @param path optional custom path (defaults to ['children', index])
 * @returns a TrackedNode for testing
 * @example
 * ```typescript
 * const tracked = createTrackedNode(paragraphNode, 0);
 * const nested = createTrackedNode(node, 0, ['children', 0, 'children', 0]);
 * ```
 */
export function createTrackedNode(
  node: BlockNode,
  index: number,
  path: Array<string | number> = ['children', index],
): TrackedNode {
  return { node, path, index };
}

/**
 * creates an InferenceContext for testing inference strategies
 * @param oldNodes array of tracked nodes from the old document
 * @param newNodes array of tracked nodes from the new document
 * @param matches optional pre-existing matches (Map<newIndex, oldTrackedNode>)
 * @returns an InferenceContext for testing
 * @example
 * ```typescript
 * const context = createInferenceContext([oldNode], [newNode]);
 * ```
 */
export function createInferenceContext(
  oldNodes: TrackedNode[],
  newNodes: TrackedNode[],
  matches = new Map<number, TrackedNode>(),
): InferenceContext {
  const matchedOldIndices = new Set<number>();
  const matchedNewIndices = new Set<number>();

  for (const [newIdx, oldNode] of matches) {
    matchedNewIndices.add(newIdx);
    matchedOldIndices.add(oldNode.index);
  }

  return {
    similarityBudget: createSimilarityBudget(),
    oldNodes,
    newNodes,
    oldByRef: new Map(
      oldNodes.filter((n) => n.node.ref).map((n) => [n.node.ref!, n]),
    ),
    newByRef: new Map(
      newNodes.filter((n) => n.node.ref).map((n) => [n.node.ref!, n]),
    ),
    matchedOldIndices,
    matchedNewIndices,
    matches,
  };
}

/**
 * creates a paragraph BlockNode for inference testing
 * (self-contained version that doesn't depend on other fixtures)
 * @param text the paragraph text content
 * @param ref optional unique reference identifier
 * @returns a paragraph BlockNode for testing
 * @example
 * ```typescript
 * const para = createInferenceParagraph('Hello world', 'para-1');
 * ```
 */
export function createInferenceParagraph(
  text: string,
  ref?: string,
): BlockNode {
  return {
    type: 'paragraph',
    ref,
    content: [
      {
        type: 'text',
        text,
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: text.length + 1, offset: text.length },
        },
      },
    ],
    children: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: text.length + 1, offset: text.length },
    },
  } as BlockNode;
}

/**
 * creates a heading BlockNode for inference testing
 * @param text the heading text content
 * @param depth the heading level (default: 1)
 * @param ref optional unique reference identifier
 * @returns a heading BlockNode for testing
 * @example
 * ```typescript
 * const h1 = createInferenceHeading('Title');
 * const h2 = createInferenceHeading('Subtitle', 2, 'subtitle-ref');
 * ```
 */
export function createInferenceHeading(
  text: string,
  depth = 1,
  ref?: string,
): BlockNode {
  return {
    type: 'heading',
    depth,
    ref,
    content: [
      {
        type: 'text',
        text,
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: text.length + 1, offset: text.length },
        },
      },
    ],
    children: [],
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: text.length + 1, offset: text.length },
    },
  } as BlockNode;
}
