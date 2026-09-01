/**
 * AST traversal utilities for the differ module
 *
 * provides helper functions for traversing and collecting nodes from AST structures
 */

import type { DocumentNode, BlockNode, TableNode } from '#types/ast';
import type { Path } from '#types/diff';

/**
 * callback for node traversal
 * @param child child block node
 * @param path path to the child node
 */
export type TraversalCallback = (child: BlockNode, path: Path) => void;

/**
 * traverses children of a block node at all levels
 * @param node node to traverse
 * @param basePath path to the node
 * @param callback function to call for each child
 */
export function traverseNodeChildren(
  node: BlockNode,
  basePath: Path,
  callback: TraversalCallback,
): void {
  // IMPORTANT: we must traverse headers before children to maintain order for positional matching

  // handle table headers (special property, not in children)
  if (node.type === 'table') {
    const tableNode = node as TableNode;
    const headers = tableNode.headers;
    if (headers) {
      headers.forEach((header, index) => {
        const headerPath: Path = [...basePath, 'headers', index];
        callback(header as BlockNode, headerPath);
      });
    }
  }

  // handle nodes with children property (list, quote, etc.)
  if ('children' in node && Array.isArray(node.children)) {
    const children = node.children as BlockNode[];
    children.forEach((child, index) => {
      const childPath: Path = [...basePath, 'children', index];
      callback(child, childPath);
    });
  }
}

/**
 * builds a map of ref to node entries with deep traversal
 * @param ast AST to index
 * @returns map from ref string to node and path
 */
export function buildRefMap(
  ast: DocumentNode,
): Map<string, { node: BlockNode; path: Path }> {
  const map = new Map<string, { node: BlockNode; path: Path }>();

  const indexNode = (node: BlockNode, path: Path): void => {
    if (node.ref) {
      map.set(node.ref, { node, path });
    }

    // recursively index nested children
    traverseNodeChildren(node, path, (child, childPath) => {
      indexNode(child, childPath);
    });
  };

  ast.children.forEach((node, index) => {
    indexNode(node, ['children', index]);
  });

  return map;
}

/**
 * collects nodes not matched by ref with deep traversal
 * @param ast AST to collect from
 * @param matchedRefs set of refs already matched
 * @returns array of unmatched node entries
 */
export function collectUnmatchedNodes(
  ast: DocumentNode,
  matchedRefs: Set<string>,
): Array<{ node: BlockNode; path: Path; index: number }> {
  const unmatched: Array<{ node: BlockNode; path: Path; index: number }> = [];
  let globalIndex = 0;

  const collectFromChildren = (children: BlockNode[], basePath: Path): void => {
    children.forEach((node, index) => {
      const currentPath: Path = [...basePath, 'children', index];

      if (!node.ref || !matchedRefs.has(node.ref)) {
        unmatched.push({ node, path: currentPath, index: globalIndex++ });
      }

      // recursively collect from nested children
      traverseNodeChildren(node, currentPath, (child, childPath) => {
        if (!child.ref || !matchedRefs.has(child.ref)) {
          unmatched.push({
            node: child,
            path: childPath,
            index: globalIndex++,
          });
        }
      });
    });
  };

  collectFromChildren(ast.children, []);

  return unmatched;
}

/**
 * gets children array from a node by property name
 * @param node node to get children from
 * @param prop property name ('children' or 'headers')
 * @returns array of block nodes or undefined
 */
export function getChildrenByProperty(
  node: DocumentNode | BlockNode,
  prop: string,
): BlockNode[] | undefined {
  if (
    prop === 'children' &&
    'children' in node &&
    Array.isArray(node.children)
  ) {
    return node.children as BlockNode[];
  }

  if (prop === 'headers' && node.type === 'table') {
    return (node as TableNode).headers as BlockNode[];
  }

  return undefined;
}
