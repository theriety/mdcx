import type { BlockNode } from '#types';

// TYPES //

/** named closing-marker emission policy */
export type ClosingMarkerPolicy = 'auto' | 'all' | 'none';

/** configuration options for converting AST back to MDC or Markdown */
export interface StringifyOptions {
  /** remove all block and inline annotations, producing annotation-free Markdown output */
  omitAnnotations?: boolean;

  /**
   * suppresses only the leading block-level annotation row (`{{ type: ..., ref: ... }}`)
   * without affecting inline annotations (mentions, equations, links). use this
   * when re-stringifying child blocks under a parent that already emitted the ref
   */
  omitBlockAnnotations?: boolean;

  /**
   * controls named closing-marker emission
   * @default 'auto'
   */
  closingMarkers?: ClosingMarkerPolicy;

  /** custom formatter for block nodes */
  format?: (
    node: BlockNode,
    stringifyBlock: (node: BlockNode) => string,
  ) => string;
}
