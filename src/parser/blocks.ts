/**
 * block parsing utilities for MDC documents
 *
 * provides shared utilities for block type inference and content parsing
 */

import { offsetRange } from '#parser/position';

import { inferBlockMeta } from './inference';
import { parseInlineContent } from './inline';
import { buildLayoutNode } from './layout';
import { buildTableNode } from './table';

import type { SetOptional } from 'type-fest';

import type { Token } from '#lexer/types';
import type { Annotations, NativeBlockNode, Range } from '#types';

import type { BlockMetaResult } from './inference';
import type { BlockParser } from './layout';
import type { ContentBlockContext, OnContentContext } from './types';

// TYPES //

/** result of merging quote continuation lines starting at a given position */
export interface QuoteContinuationResult {
  /** merged content value (original quote line + any continuation lines joined by `\n`) */
  value: string;
  /** combined range spanning the original token and any consumed continuations */
  range: Range;
  /** next position in the token stream after consumed continuation tokens */
  nextPosition: number;
}

interface ParseBlockContentParams {
  content: string;
  context: ContentBlockContext;
  blockParser?: BlockParser;
}

interface DistillBlockContextParams {
  inferred: BlockMetaResult;
  context: ContentBlockContext;
}

interface BuildBlockNodeParams {
  content: string;
  inferred: BlockMetaResult;
  context: ContentBlockContext;
  blockParser?: BlockParser;
}

interface OnContentMetadata {
  ref?: string;
  type?: string;
  annotations?: Annotations;
}

interface CreateOnContentContextParams {
  token: Token;
  context: OnContentMetadata;
  blockParser?: BlockParser;
}

interface CollectQuoteContinuationsParams {
  start: Token;
  tokens: Token[];
  position: number;
}

/**
 * parses content of a block into a BlockNode
 *
 * applies block type inference and creates properly typed node
 * @param params block content and parsing context
 * @param params.content the raw content string to parse
 * @param params.context the content block context with position and annotations
 * @param params.blockParser optional recursive block parser - forwarded to layout
 *   construction so nested cell content goes through the same pipeline
 *   (including any `onContent` middleware) as top-level blocks
 * @returns parsed BlockNode
 */
export function parseBlockContent(
  params: ParseBlockContentParams,
): SetOptional<NativeBlockNode, 'children'> {
  const { content, context, blockParser } = params;
  const inferred = inferBlockMeta(content);
  const distilled = distillBlockContext({ inferred, context });

  return buildBlockNode({ content, inferred, context: distilled, blockParser });
}

/**
 * combines inferred block metadata with caller-provided annotations
 * @param params inferred metadata and caller context
 * @param params.inferred inferred block metadata
 * @param params.context caller-provided block context
 * @returns normalized context for block construction
 */
function distillBlockContext(
  params: DistillBlockContextParams,
): ContentBlockContext {
  const { inferred, context } = params;
  const { ref, type, ...annotations }: Annotations = {
    type: inferred.type,
    ...inferred.annotations,
    ...context.annotations,
  } satisfies Annotations;

  return {
    type,
    ref,
    annotations,
    range: context.range,
  } satisfies ContentBlockContext;
}

/**
 * builds a block node from normalized metadata
 * @param params content, inferred metadata, and normalized context
 * @param params.content raw block content
 * @param params.inferred inferred block metadata
 * @param params.context normalized block context
 * @param params.blockParser optional recursive block parser
 * @returns parsed block node
 */
function buildBlockNode(
  params: BuildBlockNodeParams,
): SetOptional<NativeBlockNode, 'children'> {
  const { content, inferred, context, blockParser } = params;
  const { range, ref, type, annotations } = context;

  switch (type) {
    case 'table':
      return buildTableNode(content, context);
    case 'layout':
      return buildLayoutNode({ content, context, blockParser });
    case 'divider':
      return { type: 'divider', ref, annotations, range };
    case 'equation': {
      // equation delimiters are '$$' (2 characters each)
      const DELIMITER_LENGTH = 2;
      const inlineRange = offsetRange(range, DELIMITER_LENGTH);
      // content is between the $$ delimiters
      const equationContent = content
        .slice(DELIMITER_LENGTH, -DELIMITER_LENGTH)
        .trim();

      return {
        type: 'equation',
        ref,
        annotations,
        content: equationContent
          ? [{ type: 'text', text: equationContent, range: inlineRange }]
          : [],
        range,
      };
    }

    default: {
      const inlineRange = offsetRange(range, inferred.contentStart);
      const inlineContent = parseInlineContent(
        content.slice(inferred.contentStart),
        inlineRange,
      );

      // parse inline content
      return {
        type,
        ref,
        annotations,
        content: inlineContent,
        range,
      } as SetOptional<NativeBlockNode, 'children'>;
    }
  }
}

/**
 * creates BlockContext for onContent middleware
 * @param params onContent context inputs
 * @param params.token the token being processed
 * @param params.context context options including ref, type, and annotations
 * @param params.context.ref optional unique reference identifier
 * @param params.context.type inferred or explicit block type
 * @param params.context.annotations block-level annotations
 * @param params.blockParser optional recursive block parser - threaded through so
 *   middleware-invoked `parseContent` calls keep delegating cell parsing to
 *   the same pipeline that handles top-level blocks
 * @returns BlockContext for middleware
 */
export function createOnContentContext(
  params: CreateOnContentContextParams,
): OnContentContext {
  const { token, context, blockParser } = params;
  const { ref, type, annotations } = context;

  return {
    type,
    ref,
    annotations,
    range: token.range,
    parseContent: (content) =>
      parseBlockContent({
        content,
        context: { annotations, range: token.range },
        blockParser,
      }),
  };
}

/**
 * collects quote-style continuation lines starting at the given token-stream
 * position
 *
 * a CONTENT token whose inferred type is `quote` may be followed by additional
 * non-`>`-prefixed CONTENT lines that belong to the same quote (mirrors Notion's
 * quote rendering where intra-quote `\n` does not introduce a new block)
 *
 * continuation stops at any of: blank line (two NEWLINEs), end of stream, a
 * different indent level, a non-CONTENT token, or a CONTENT token whose own
 * inferred type is anything other than `paragraph` (i.e. it starts a new block)
 *
 * pure function so the AstBuilder can delegate without exposing its private
 * token-stream cursor
 * @param params quote continuation inputs
 * @param params.start the opening CONTENT token (already advanced past by the caller)
 * @param params.tokens the full token stream
 * @param params.position the next position to inspect (immediately after `start`)
 * @returns merged value, combined range, and the next position to resume at
 */
export function collectQuoteContinuations(
  params: CollectQuoteContinuationsParams,
): QuoteContinuationResult {
  const { start, tokens, position } = params;
  const inferred = inferBlockMeta(start.value);

  if (inferred.type !== 'quote') {
    return { value: start.value, range: start.range, nextPosition: position };
  }

  let cursor = position;
  let value = start.value;
  let endRange = start.range.end;

  while (cursor + 1 < tokens.length) {
    const newline = tokens[cursor] as Token | undefined;
    const lookahead = tokens[cursor + 1] as Token | undefined;

    if (newline === undefined || lookahead === undefined) {
      break;
    }

    // expect exactly one NEWLINE between the quote line and a continuation
    if (newline.type !== 'NEWLINE') {
      break;
    }

    if (lookahead.type !== 'CONTENT') {
      break;
    }

    if (lookahead.indent !== start.indent) {
      break;
    }

    // a continuation line must NOT start a new block. inference returning
    // `paragraph` means the line had no recognised block prefix and is safe
    // to merge into the open quote.
    const lookaheadInferred = inferBlockMeta(lookahead.value);

    if (lookaheadInferred.type !== 'paragraph') {
      break;
    }

    // commit: skip the NEWLINE + CONTENT and concatenate
    cursor += 2;
    value = `${value}\n${lookahead.value}`;
    endRange = lookahead.range.end;
  }

  return {
    value,
    range: { start: start.range.start, end: endRange },
    nextPosition: cursor,
  };
}
