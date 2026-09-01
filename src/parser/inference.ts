import type {
  NativeBlockNode,
  Annotations,
  HeadingDepth,
  NativeBlockType,
} from '#types';

// TYPES //

/** result of inferring block metadata from content */
export interface BlockMetaResult {
  /** inferred block type */
  type: NativeBlockType;
  /** type-specific annotation properties extracted from the match */
  annotations?: Annotations;
  /** character offset where actual content starts (after the markdown prefix) */
  contentStart: number;
}

/** block type inference pattern definition */
interface BlockPattern<T extends NativeBlockType = NativeBlockType> {
  /** regex pattern to match against content */
  pattern: RegExp;
  /** block type to assign on match */
  type: T;
  /** function to extract properties from match */
  extract: (
    match: RegExpMatchArray,
  ) => Extract<NativeBlockNode, { type: T }>['annotations'];
}

/**
 * block type inference patterns
 *
 * maps content prefixes to block types
 * order matters - more specific patterns (like checkbox) must come before general ones (like item)
 */
const BLOCK_PATTERNS: BlockPattern[] = [
  {
    pattern: /^(#{1,3})\s/,
    type: 'heading',
    extract: ([, hash = '']) => ({ depth: hash.length as HeadingDepth }),
  } satisfies BlockPattern<'heading'>,
  {
    pattern: /^-\s\[x\]\s/i,
    type: 'todo',
    extract: () => ({ checked: true }),
  } satisfies BlockPattern<'todo'>,
  {
    pattern: /^-\s\[\s\]\s/,
    type: 'todo',
    extract: () => ({ checked: false }),
  } satisfies BlockPattern<'todo'>,
  {
    pattern: /^[-*]\s/,
    type: 'bullet',
    extract: () => ({}),
  } satisfies BlockPattern<'bullet'>,
  {
    pattern: /^\d+\.\s/,
    type: 'enum',
    extract: () => ({}),
  } satisfies BlockPattern<'enum'>,
  {
    pattern: /^>\s/,
    type: 'quote',
    extract: () => ({}),
  } satisfies BlockPattern<'quote'>,
  // equation pattern - $$ at start and end of line with content between
  {
    pattern: /^\$\$(.+)\$\$$/,
    type: 'equation',
    extract: () => ({}),
  } satisfies BlockPattern<'equation'>,
  // divider pattern - 3 or more hyphens on their own line
  {
    pattern: /^-{3,}$/,
    type: 'divider',
    extract: () => ({}),
  } satisfies BlockPattern<'divider'>,
  // pipe-delimited content (tables and layouts)
  // default to 'table' - use type annotation to override to 'layout'
  // note: separator line detection moved to buildTableNode for header handling
  // pattern checks if first line starts with | and contains | (no $ anchor needed)
  {
    pattern: /^\|.*\|/,
    type: 'table',
    extract: () => ({}),
  } satisfies BlockPattern<'table'>,
];

/**
 * infers block type from content string
 *
 * this is where markdown syntax is interpreted
 * @param content raw content string from token
 * @returns block metadata with inferred type, annotations, and content offset
 */
export function inferBlockMeta(content: string): BlockMetaResult {
  for (const { pattern, type, extract } of BLOCK_PATTERNS) {
    const match = pattern.exec(content);

    if (match) {
      return {
        type,
        annotations: extract(match),
        contentStart: match[0].length,
      };
    }
  }

  // default to paragraph
  return { type: 'paragraph', annotations: {}, contentStart: 0 };
}
