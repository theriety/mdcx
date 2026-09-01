import { stringifyAnnotationMapping } from '#parser/annotation-profile';

import { stringifyAnnotations } from './annotations';
import { EMBEDDED_PATTERNS } from './inference';
import { stringifyInlineContent } from './inline';
import { stringifyLayout } from './layout';
import { stringifyTable } from './table';
import { indent } from './utilities';

import type { NativeBlockNode, BlockNode } from '#types';

import type { StringifyOptions } from './types';

// TYPES //

interface DefaultBlockResult {
  lines: string[];
  renderedGenericChildren: boolean;
}

interface ShouldEmitClosingMarkerParams {
  node: BlockNode;
  options?: StringifyOptions;
  renderedGenericChildren: boolean;
}

// CONSTANTS //

const INTRINSIC_CONTAINER_TYPES = new Set(['table', 'layout']);
const INTRINSIC_CHILD_TYPES = new Set(['header', 'column', 'row', 'cell']);

// FUNCTIONS //

/**
 * determines whether a blank line should be inserted between two adjacent blocks
 * @param current the current BlockNode
 * @param next the next BlockNode
 * @returns true if a blank line should be inserted
 */
export function shouldInsertBlankLine(
  current: BlockNode,
  next: BlockNode,
): boolean {
  if (isAnnotationOnlyEmptyBlock(current)) {
    return true;
  }

  // insert a blank line between blocks by default, excepts for list items
  return !(
    ['bullet', 'enum', 'todo'].includes(current.type) &&
    current.type === next.type
  );
}

/**
 * returns children owned through MDC's generic indentation serializer
 * @param node block whose child ownership is being inspected
 * @returns generic indentation-owned children, excluding intrinsic structures
 */
export function getGenericBlockChildren(node: BlockNode): BlockNode[] {
  return INTRINSIC_CONTAINER_TYPES.has(node.type) ||
    !Array.isArray(node.children)
    ? []
    : node.children;
}

/**
 * detects the canonical annotation-only empty-block representation
 * @param node block to inspect
 * @returns whether the block has an empty body and no generic children
 */
export function isAnnotationOnlyEmptyBlock(node: BlockNode): boolean {
  return (
    Array.isArray(node.content) &&
    node.content.length === 0 &&
    getGenericBlockChildren(node).length === 0 &&
    (node.type === 'paragraph' || node.annotations?.type === node.type)
  );
}

/**
 * creates a canonical closing marker through the annotation-profile serializer
 * @param ref stable block reference
 * @returns canonical closing marker text
 */
function stringifyClosingMarker(ref: string): string {
  return `--${stringifyAnnotationMapping({ ref })}--`;
}

/**
 * decides whether a completed external block receives a named marker
 * @param params closing-marker decision inputs
 * @param params.node block being serialized
 * @param params.options active stringification options
 * @param params.renderedGenericChildren whether the generic serializer rendered children
 * @returns true when the selected marker policy requires a marker
 */
function shouldEmitClosingMarker(
  params: ShouldEmitClosingMarkerParams,
): boolean {
  const { node, options, renderedGenericChildren } = params;

  if (
    options?.omitAnnotations === true ||
    options?.omitBlockAnnotations === true ||
    typeof node.ref !== 'string' ||
    node.ref.length === 0 ||
    INTRINSIC_CHILD_TYPES.has(node.type)
  ) {
    return false;
  }

  const policy = options?.closingMarkers ?? 'auto';

  return policy === 'all' || (policy === 'auto' && renderedGenericChildren);
}

/**
 * stringifies a single block node with optional format callback
 * @param node the BlockNode to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified block as array of lines
 */
export function stringifyBlock(
  node: BlockNode,
  options?: StringifyOptions,
): string[] {
  const lines: string[] = [];
  const annotationOnlyEmpty = isAnnotationOnlyEmptyBlock(node);

  // block-level annotation row is suppressed by either omitAnnotations (full
  // markdown mode) or omitBlockAnnotations (narrow mode used when re-stringifying
  // children under a parent that already emitted the ref). inline annotations
  // continue to gate only on omitAnnotations.
  const omitBlockRow =
    options?.omitAnnotations === true || options?.omitBlockAnnotations === true;

  if (!omitBlockRow) {
    // remove any embedded properities from annotations
    const excludes = EMBEDDED_PATTERNS[node.type] as string[] | undefined;
    const annotation = stringifyAnnotations(
      { ...node.annotations, type: node.type, ref: node.ref },
      { excludes, preserveType: annotationOnlyEmpty },
    );

    if (annotation) {
      lines.push(annotation);
    }
  }

  let renderedGenericChildren = false;
  const stringifyDefault = (target: BlockNode): string => {
    const result = renderDefaultBlock(target as NativeBlockNode, options);
    renderedGenericChildren ||= result.renderedGenericChildren;

    return result.lines.join('\n');
  };
  const formatted = annotationOnlyEmpty
    ? undefined
    : options?.format?.(node, stringifyDefault);
  const contentBlockLines = annotationOnlyEmpty
    ? []
    : (formatted?.split('\n') ??
      (() => {
        const result = renderDefaultBlock(node as NativeBlockNode, options);
        renderedGenericChildren = result.renderedGenericChildren;

        return result.lines;
      })());

  lines.push(...contentBlockLines);

  if (shouldEmitClosingMarker({ node, options, renderedGenericChildren })) {
    lines.push(stringifyClosingMarker(node.ref!));
  }

  return lines;
}

/**
 * provides default stringification for a block node
 * @param node the NativeBlockNode to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified block as array of lines
 */
export function defaultStringifyBlock(
  node: NativeBlockNode,
  options?: StringifyOptions,
): string[] {
  return renderDefaultBlock(node, options).lines;
}

/**
 * renders a native block and reports whether generic children were represented
 * @param node native block to stringify
 * @param options active stringification options
 * @returns rendered lines and generic-child ownership evidence
 */
function renderDefaultBlock(
  node: NativeBlockNode,
  options?: StringifyOptions,
): DefaultBlockResult {
  const lines = stringifyBlockContent(node, options);
  const genericChildren = getGenericBlockChildren(node);

  for (const child of genericChildren) {
    lines.push(...stringifyBlock(child, options).map(indent));
  }

  return {
    lines,
    renderedGenericChildren: genericChildren.length > 0,
  };
}

/**
 * stringifies the content portion of a block node
 * @param node the NativeBlockNode whose content to stringify
 * @param options StringifyOptions configuration
 * @returns the stringified content as array of lines
 */
export function stringifyBlockContent(
  node: NativeBlockNode,
  options?: StringifyOptions,
): string[] {
  switch (node.type) {
    case 'heading':
      return [
        `${'#'.repeat(node.annotations?.depth ?? 1)} ${stringifyInlineContent(node.content, options)}`,
      ];
    case 'paragraph':
      return [stringifyInlineContent(node.content, options)];
    case 'enum':
      return [`1. ${stringifyInlineContent(node.content, options)}`];
    case 'bullet':
      return [`- ${stringifyInlineContent(node.content, options)}`];

    case 'todo':
      return [
        `- [${node.annotations?.checked ? 'x' : ' '}] ${stringifyInlineContent(node.content, options)}`,
      ];

    case 'quote':
      return [`> ${stringifyInlineContent(node.content, options)}`];
    case 'divider':
      return ['---'];
    case 'equation': {
      const expr = stringifyInlineContent(node.content, options);

      return [`$$ ${expr} $$`];
    }
    case 'code':
      return stringifyCodeBlockContent(node, options);
    case 'table':
      return stringifyTable(node, options);
    case 'layout':
      return stringifyLayout({
        node,
        options,
        stringifyBlockFn: stringifyBlock,
      });
    case 'header':
    case 'column':
    case 'row':
    case 'cell':
      // these are special child block types that is handled by their parent stringifier
      // (header/cell by stringifyTable, column by stringifyLayout)
      throw new Error(
        `${node.type} is a special container children block which must be handled by their special stringifier`,
      );
    default:
      // for non-native block types, require a format callback which is handled under stringifyBlock
      throw new Error(
        // @ts-expect-error all nodes should be handled above
        `custom block type "${node.type}" requires a format callback. ` +
          `provide a format option to handle custom block types.`,
      );
  }
}

/**
 * renders a fenced code block with its optional language
 * @param node code block to stringify
 * @param options active stringification options
 * @returns fenced code block lines
 */
function stringifyCodeBlockContent(
  node: Extract<NativeBlockNode, { type: 'code' }>,
  options?: StringifyOptions,
): string[] {
  const code = stringifyInlineContent(node.content, options);
  // language is stored directly on node by parser (not in annotations)
  const language =
    (node as { language?: string }).language ??
    node.annotations?.language ??
    '';

  return `\`\`\`${language}\n${code}\n\`\`\``.split('\n');
}
