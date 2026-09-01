import { isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { ParseError } from '#errors';

import type { Node, Scalar, YAMLMap, YAMLSeq } from 'yaml';

import type { Position } from '#types';

import type { AnnotationContext } from './annotation-profile';

interface AnnotationPositionParams {
  context: AnnotationContext;
  line?: number;
  column?: number;
  offset?: number;
}

interface AnnotationProfileErrorParams {
  message: string;
  context: AnnotationContext;
  position?: Position;
}

interface AnnotationNodeValidationParams {
  node: Node | null;
  depth: number;
  context: AnnotationContext;
  syntax?: AnnotationSyntaxPolicy;
}

interface AnnotationCollectionValidationParams {
  node: YAMLMap | YAMLSeq;
  depth: number;
  context: AnnotationContext;
  syntax: AnnotationSyntaxPolicy;
}

interface AnnotationMappingValidationParams extends Omit<
  AnnotationCollectionValidationParams,
  'node'
> {
  node: YAMLMap;
}

interface AnnotationSequenceValidationParams extends Omit<
  AnnotationCollectionValidationParams,
  'node'
> {
  node: YAMLSeq;
}

interface AnnotationScalarValidationParams {
  node: Scalar;
  context: AnnotationContext;
  syntax: AnnotationSyntaxPolicy;
}

interface AnnotationNodeMetadataParams {
  node: Node;
  context: AnnotationContext;
  syntax: AnnotationSyntaxPolicy;
}

/** syntax allowances layered over the shared safe YAML profile */
export interface AnnotationSyntaxPolicy {
  allowBlockCollections?: boolean;
  allowComments?: boolean;
  allowMultilineScalars?: boolean;
}

/** maximum nested collection depth accepted by the annotation profile */
export const MAX_ANNOTATION_DEPTH = 16;

/**
 * converts YAML-relative coordinates to a document position
 * @param params annotation source context and relative coordinates
 * @param params.context annotation source context
 * @param params.line one-based relative line
 * @param params.column one-based relative column
 * @param params.offset relative source offset
 * @returns absolute document position
 */
export function annotationPosition(params: AnnotationPositionParams): Position {
  const { context, line = 1, column = 1, offset = 0 } = params;
  const baseLine =
    context.baseLine !== undefined && context.baseLine > 0
      ? context.baseLine
      : (context.position?.line ?? 1);

  return {
    line: baseLine + line - 1,
    column: line === 1 ? (context.position?.column ?? 1) + column - 1 : column,
    offset: (context.position?.offset ?? 0) + offset,
  };
}

/**
 * creates a profile-violation error
 * @param params profile error details
 * @param params.message explanation of the violated rule
 * @param params.context annotation source context
 * @param params.position source position of the violation
 * @returns classified parse error
 */
export function annotationProfileError(
  params: AnnotationProfileErrorParams,
): ParseError {
  const {
    message,
    context,
    position = annotationPosition({ context }),
  } = params;

  return new ParseError(
    'MDC_ANNOTATION_PROFILE_VIOLATION',
    `${context.name ?? 'Annotation'} ${message}`,
    position,
  );
}

/**
 * recursively validates the parsed YAML node graph
 * @param params annotation node validation arguments
 * @param params.node YAML node to validate
 * @param params.depth current collection depth
 * @param params.context annotation source context
 */
export function validateAnnotationNode(
  params: AnnotationNodeValidationParams,
): void {
  const { node, depth, context, syntax = {} } = params;
  if (node === null) {
    return;
  }
  if (isAlias(node)) {
    throw annotationProfileError({
      message: 'YAML aliases are not allowed.',
      context,
    });
  }
  if (isScalar(node)) {
    assertScalar({ node, context, syntax });

    return;
  }
  if (isSeq(node)) {
    validateSequence({ node, depth, context, syntax });

    return;
  }
  if (isMap(node)) {
    validateMapping({ node, depth, context, syntax });

    return;
  }

  throw annotationProfileError({
    message: 'contains an unsupported YAML node.',
    context,
  });
}

/**
 * validates a YAML sequence and its values
 * @param params sequence node, depth, context, and syntax policy
 */
function validateSequence(params: AnnotationSequenceValidationParams): void {
  const { node, depth, context, syntax } = params;
  assertCollection(params);
  for (const item of node.items) {
    validateAnnotationNode({
      node: item as Node,
      depth: depth + 1,
      context,
      syntax,
    });
  }
}

/**
 * validates a YAML mapping and its key-value pairs
 * @param params mapping node, depth, context, and syntax policy
 */
function validateMapping(params: AnnotationMappingValidationParams): void {
  const { node, depth, context, syntax } = params;
  assertCollection(params);
  for (const pair of node.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
      throw annotationProfileError({
        message: 'mapping keys must be strings.',
        context,
      });
    }
    assertScalar({ node: pair.key, context, syntax });
    if (!plainKeyResolvesToString(pair.key)) {
      throw annotationProfileError({
        message: 'mapping keys must resolve to strings.',
        context,
      });
    }
    if (pair.key.value === '<<') {
      throw annotationProfileError({
        message: 'YAML merge keys are not allowed.',
        context,
      });
    }
    validateAnnotationNode({
      node: pair.value as Node | null,
      depth: depth + 1,
      context,
      syntax,
    });
  }
}

/**
 * rejects YAML metadata not supported by the semantic AST
 * @param params YAML node, annotation context, and syntax policy
 */
function assertNoNodeMetadata(params: AnnotationNodeMetadataParams): void {
  const { node, context, syntax } = params;
  if (!syntax.allowComments && (node.comment || node.commentBefore)) {
    throw annotationProfileError({
      message: 'comments are not allowed.',
      context,
    });
  }
  if (node.tag) {
    throw annotationProfileError({
      message: 'explicit YAML tags are not allowed.',
      context,
    });
  }
  if ('anchor' in node && node.anchor) {
    throw annotationProfileError({
      message: 'YAML anchors are not allowed.',
      context,
    });
  }
}

/**
 * validates one YAML scalar
 * @param params scalar node, annotation context, and syntax policy
 */
function assertScalar(params: AnnotationScalarValidationParams): void {
  const { node, context, syntax } = params;
  assertNoNodeMetadata({ node, context, syntax });
  const { value } = node;

  if (
    value !== null &&
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw annotationProfileError({
      message: 'contains a non-JSON scalar value.',
      context,
    });
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw annotationProfileError({
      message: 'numbers must be finite.',
      context,
    });
  }
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value) &&
    node.type === 'PLAIN'
  ) {
    throw annotationProfileError({
      message:
        'contains an unsafe unquoted integer; quote it to preserve it as a string.',
      context,
    });
  }
  if (
    !syntax.allowMultilineScalars &&
    (node.type === 'BLOCK_FOLDED' || node.type === 'BLOCK_LITERAL')
  ) {
    throw annotationProfileError({
      message: 'multiline scalar syntax is not allowed.',
      context,
    });
  }
}

/**
 * validates flow style and nesting for one collection
 * @param params collection node, depth, annotation context, and syntax policy
 */
function assertCollection(params: AnnotationCollectionValidationParams): void {
  const { node, depth, context, syntax } = params;
  assertNoNodeMetadata({ node, context, syntax });
  if (!syntax.allowBlockCollections && !node.flow) {
    throw annotationProfileError({
      message: 'only flow-style collections are allowed.',
      context,
    });
  }
  if (depth > MAX_ANNOTATION_DEPTH) {
    throw annotationProfileError({
      message: `collection depth exceeds the limit of ${MAX_ANNOTATION_DEPTH}.`,
      context,
    });
  }
}

/**
 * checks whether a plain YAML key resolves to a string under Core schema
 * @param key scalar mapping key
 * @returns whether the key resolves to a string
 */
function plainKeyResolvesToString(key: Scalar): boolean {
  if (key.type !== 'PLAIN' || key.source === undefined) {
    return true;
  }
  const document = parseDocument(key.source, {
    version: '1.2',
    schema: 'core',
    merge: false,
    uniqueKeys: true,
  });

  return (
    isScalar(document.contents) && typeof document.contents.value === 'string'
  );
}
