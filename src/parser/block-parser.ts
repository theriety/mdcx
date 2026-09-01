import { ParseError } from '#errors';

import { parseAnnotationMapping } from './annotation-profile';
import {
  collectQuoteContinuations,
  createOnContentContext,
  parseBlockContent,
} from './blocks';
import { buildLayoutNode } from './layout';
import { buildTableNode, isTableSeparatorLine } from './table';

import type { SetOptional } from 'type-fest';

import type { Token } from '#lexer/types';
import type { Annotations, BlockNode, NativeBlockNode, Range } from '#types';

import type { BlockParser } from './layout';
import type { TokenCursor } from './token-cursor';
import type { ContentBlockContext, ParseOptions } from './types';

interface AnnotationPrefix {
  annotations: Annotations;
  separated: boolean;
  token: Token;
}

interface ParseContentBlockParams {
  cursor: TokenCursor;
  token: Token;
  annotations: Annotations;
  options: ParseOptions;
  blockParser: BlockParser;
}

interface ParseTargetBlockParams {
  cursor: TokenCursor;
  target: Token;
  annotations: Annotations;
  options: ParseOptions;
  blockParser: BlockParser;
}

type ParseCodeBlockParams = Pick<
  ParseContentBlockParams,
  'cursor' | 'token' | 'annotations'
>;

type ParseBoundingBlockParams = Pick<
  ParseContentBlockParams,
  'cursor' | 'token' | 'annotations' | 'blockParser'
>;

type ParseAnnotatedBlockParams = Omit<ParseTargetBlockParams, 'annotations'> & {
  prefix: AnnotationPrefix;
};

/** one parsed source block before indentation-owned children are attached */
export interface ParsedBlock {
  block: SetOptional<BlockNode, 'children'> | null;
  indent: number;
}

/** parameters for parsing one block without assigning structural children */
export interface ParseOneBlockParams {
  cursor: TokenCursor;
  options: ParseOptions;
  blockParser: BlockParser;
}

/**
 * reads and validates one complete block annotation prefix
 * @param cursor token cursor positioned at ANNOTATION_START
 * @returns parsed annotation and adjacency metadata
 */
function parseAnnotationPrefix(cursor: TokenCursor): AnnotationPrefix {
  const token = cursor.advance()!;
  const content = cursor.advance();
  const end = cursor.advance();
  if (content?.type !== 'ANNOTATION' || end?.type !== 'ANNOTATION_END') {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'Block annotation token sequence is incomplete.',
      token.range.start,
    );
  }
  if (cursor.peek()?.type === 'NEWLINE') {
    cursor.advance();
  }

  return {
    annotations: parseAnnotationMapping({
      source: content.value,
      context: {
        baseLine: content.range.start.line,
        name: 'Block annotation',
        position: content.range.start,
      },
    }),
    separated: cursor.peek()?.type === 'NEWLINE',
    token,
  };
}

/**
 * creates an explicit typed annotation-only block
 * @param prefix parsed annotation prefix
 * @returns empty semantic block
 */
function createEmptyBlock(prefix: AnnotationPrefix): NativeBlockNode {
  const { ref, type, ...annotations } = prefix.annotations;
  if (typeof type !== 'string') {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      'An annotation-only block requires a non-empty "type" property.',
      prefix.token.range.start,
    );
  }

  return {
    type,
    ref,
    annotations: { ...annotations, type },
    content: [],
    children: [],
    range: prefix.token.range,
  } as NativeBlockNode;
}

/**
 * creates a native layout or column whose body is expressed by child blocks
 * @param prefix parsed annotation prefix
 * @returns empty intrinsic container awaiting child attachment
 */
function createAnnotationContainer(prefix: AnnotationPrefix): NativeBlockNode {
  const { ref, type, ...annotations } = prefix.annotations;
  const annotationType = type === 'layout' ? 'column_list' : type;

  return {
    type,
    ref,
    annotations: { ...annotations, type: annotationType },
    children: [],
    range: prefix.token.range,
  } as NativeBlockNode;
}

/**
 * parses one code fence and its opaque contents
 * @param params code-block parsing inputs
 * @param params.cursor active token cursor
 * @param params.token opening code fence
 * @param params.annotations annotation properties for the block
 * @returns parsed native code block
 */
function parseCodeBlock(params: ParseCodeBlockParams): NativeBlockNode {
  const { cursor, token, annotations } = params;

  cursor.advance();
  const languageCode =
    cursor.peek()?.type === 'CODE_TYPE'
      ? cursor.advance()?.value.trim()
      : undefined;
  const language = languageCode === '' ? undefined : languageCode;
  while (cursor.peek()?.type === 'CODE' && cursor.peek()?.value === '\n') {
    cursor.advance();
  }

  const rawParts: string[] = [];
  while (!cursor.isAtEnd()) {
    const next = cursor.advance();
    if (next?.type === 'CODE_END') {
      cursor.skipNewlines();
      break;
    }
    if (next?.type === 'CODE') {
      rawParts.push(next.value);
    }
  }
  const raw = rawParts.join('');
  const value = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  const { ref, ...distilled } = annotations;

  return {
    type: 'code',
    ref,
    language,
    annotations: distilled,
    content: value ? [{ type: 'text', text: value, range: token.range }] : [],
    children: [],
    range: token.range,
  } as NativeBlockNode;
}

/**
 * collects a contiguous intrinsic table or layout block
 * @param params bounding-block parsing inputs
 * @param params.cursor active token cursor
 * @param params.token first bounding row
 * @param params.annotations annotation properties for the block
 * @param params.blockParser recursive parser for layout cells
 * @returns table or layout block
 */
function parseBoundingBlock(params: ParseBoundingBlockParams): NativeBlockNode {
  const { cursor, token, annotations, blockParser } = params;

  const lines = [token.value];
  let end = token.range.end;
  cursor.advance();
  while (!cursor.isAtEnd()) {
    const next = cursor.peek();
    if (next?.type === 'NEWLINE') {
      const following = cursor.peek(1);
      if (following?.type === 'BOUNDING' && following.indent === token.indent) {
        cursor.advance();
        continue;
      }
      break;
    }
    if (next?.type !== 'BOUNDING' || next.indent !== token.indent) {
      break;
    }
    cursor.advance();
    lines.push(next.value);
    end = next.range.end;
  }

  const { ref, type, ...distilled } = annotations;
  const isTable = lines.some((line) => isTableSeparatorLine(line));
  const context: ContentBlockContext = {
    type: type ?? (isTable ? 'table' : 'layout'),
    ref,
    annotations: distilled,
    range: { start: token.range.start, end },
  };

  return isTable
    ? buildTableNode(lines.join('\n'), context)
    : buildLayoutNode({
        content: lines.join('\n'),
        context,
        blockParser,
      });
}

/**
 * parses one ordinary content token
 * @param params content-block parsing inputs
 * @param params.cursor active token cursor
 * @param params.token source content item
 * @param params.annotations annotation properties for the block
 * @param params.options parser configuration
 * @param params.blockParser recursive parser for intrinsic cell content
 * @returns parsed or middleware-filtered block
 */
function parseContentBlock(
  params: ParseContentBlockParams,
): SetOptional<BlockNode, 'children'> | null {
  const { cursor, token, annotations, options, blockParser } = params;

  cursor.advance();
  const collected = collectQuoteContinuations({
    start: token,
    tokens: cursor.tokens,
    position: cursor.position,
  });
  cursor.position = collected.nextPosition;
  if (options.onContent) {
    const { type, ref, ...distilled } = annotations;
    const range: Range = collected.range;
    const context = createOnContentContext({
      token: { ...token, value: collected.value, range },
      context: { type, ref, annotations: distilled },
      blockParser,
    });

    return options.onContent(collected.value, context);
  }

  return parseBlockContent({
    content: collected.value,
    context: { annotations, range: collected.range },
    blockParser,
  });
}

/**
 * parses a source token using its already-validated annotation mapping
 * @param params target dispatch inputs
 * @param params.cursor active token cursor
 * @param params.target block-body token
 * @param params.annotations semantic block annotations
 * @param params.options parser configuration
 * @param params.blockParser recursive parser for intrinsic cell content
 * @returns parsed block body
 */
function parseTargetBlock(
  params: ParseTargetBlockParams,
): SetOptional<BlockNode, 'children'> | null {
  const { cursor, target, annotations, options, blockParser } = params;

  switch (target.type) {
    case 'BOUNDING':
      return parseBoundingBlock({
        cursor,
        token: target,
        annotations,
        blockParser,
      });
    case 'CODE_START':
      return parseCodeBlock({ cursor, token: target, annotations });
    case 'CONTENT':
      return parseContentBlock({
        cursor,
        token: target,
        annotations,
        options,
        blockParser,
      });
    default:
      throw new ParseError(
        'MDC_ANNOTATION_INVALID',
        `Unexpected token ${target.type} while parsing a block.`,
        target.range.start,
      );
  }
}

/**
 * resolves an annotation prefix against its adjacent structural target
 * @param params annotated-block parsing inputs
 * @param params.cursor active token cursor
 * @param params.prefix parsed annotation prefix
 * @param params.target next source token
 * @param params.options parser configuration
 * @param params.blockParser recursive parser for intrinsic cell content
 * @returns parsed annotated block
 */
function parseAnnotatedBlock(
  params: ParseAnnotatedBlockParams,
): SetOptional<BlockNode, 'children'> | null {
  const { cursor, prefix, target, options, blockParser } = params;

  if (
    prefix.separated ||
    target.type === 'EOF' ||
    target.type === 'CLOSING_MARKER'
  ) {
    return createEmptyBlock(prefix);
  }

  if (
    (prefix.annotations.type === 'layout' ||
      prefix.annotations.type === 'column') &&
    target.indent > prefix.token.indent
  ) {
    return createAnnotationContainer(prefix);
  }

  if (target.indent !== prefix.token.indent) {
    throw new ParseError(
      'MDC_INDENTATION_INVALID',
      `Block annotation at indentation level ${prefix.token.indent} must target a block at the same level; found level ${target.indent}.`,
      target.range.start,
    );
  }

  return parseTargetBlock({
    cursor,
    target,
    annotations: prefix.annotations,
    options,
    blockParser,
  });
}

/**
 * parses one block at the cursor without assigning structural children
 * @param params block parsing inputs
 * @returns parsed block and its visible indentation
 */
export function parseOneBlock(params: ParseOneBlockParams): ParsedBlock {
  const { cursor, options, blockParser } = params;
  const prefix =
    cursor.peek()?.type === 'ANNOTATION_START'
      ? parseAnnotationPrefix(cursor)
      : undefined;
  const target = cursor.peek();
  const indent = prefix?.token.indent ?? target?.indent ?? 0;
  if (!target) {
    return { block: prefix ? createEmptyBlock(prefix) : null, indent };
  }

  return {
    block: prefix
      ? parseAnnotatedBlock({ cursor, prefix, target, options, blockParser })
      : parseTargetBlock({
          cursor,
          target,
          annotations: {},
          options,
          blockParser,
        }),
    indent,
  };
}
