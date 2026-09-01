import { Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { ParseError } from '#errors';
import { findFlowMappingEnd } from '#lexer/flow-mapping';

import {
  assertAnnotationNamedStrings,
  validateAnnotationValue,
} from './annotation-profile-runtime';
import {
  annotationPosition,
  annotationProfileError,
  MAX_ANNOTATION_DEPTH,
  validateAnnotationNode,
} from './annotation-profile-validation';

import type { Node, Pair } from 'yaml';

import type { Position, Annotations } from '#types';

/** maximum nested collection depth accepted by the MDC Annotation Profile */
export { MAX_ANNOTATION_DEPTH };

/** source context for annotation-profile errors */
export interface AnnotationContext {
  baseLine?: number;
  name?: string;
  position?: Position;
}

/** parameters for parsing one MDC Annotation Profile flow mapping */
export interface ParseAnnotationMappingParams {
  source: string;
  context?: AnnotationContext;
}

interface CanonicalizeValueParams {
  value: unknown;
  topLevel: boolean;
  context: AnnotationContext;
  seen: WeakSet<object>;
}

const TOP_LEVEL_KEY_PRIORITY: Readonly<Record<string, number>> = {
  type: 0,
  ref: 1,
  title: 2,
};

const DEFAULT_TOP_LEVEL_PRIORITY = Object.keys(TOP_LEVEL_KEY_PRIORITY).length;

/**
 * parses one MDC Annotation Profile flow mapping
 * @param params annotation source and error context
 * @param params.source complete YAML flow mapping including braces
 * @param params.context annotation source and error context
 * @returns validated JSON-compatible annotations
 */
export function parseAnnotationMapping(
  params: ParseAnnotationMappingParams,
): Annotations {
  const { source, context = {} } = params;
  const mapping = source.trim();
  const end = findFlowMappingEnd({
    source: mapping,
    startIndex: 0,
    options: {
      context: context.name ?? 'Annotation',
      position: context.position,
    },
  });
  if (end === null || end !== mapping.length) {
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      `${context.name ?? 'Annotation'} must be exactly one complete flow mapping.`,
      annotationPosition({ context }),
    );
  }

  const document = parseDocument(mapping, {
    version: '1.2',
    schema: 'core',
    merge: false,
    uniqueKeys: true,
    stringKeys: true,
    strict: true,
    keepSourceTokens: true,
  });
  const yamlIssue = document.errors.at(0) ?? document.warnings.at(0);
  if (yamlIssue) {
    const linePosition = yamlIssue.linePos?.[0];
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      `${context.name ?? 'Annotation'} is invalid YAML 1.2 Core: ${yamlIssue.message.replace(/ at line \d+, column \d+/, '')}`,
      annotationPosition({
        context,
        line: linePosition?.line,
        column: linePosition?.col,
        offset: yamlIssue.pos[0],
      }),
    );
  }
  validateAnnotationNode({ node: document.contents, depth: 1, context });
  const annotations = document.toJS({ maxAliasCount: 0 }) as Annotations;
  validateAnnotationValue({ value: annotations, context, seen: new WeakSet() });
  assertAnnotationNamedStrings(annotations, context);

  return annotations;
}

/**
 * compares top-level annotation keys by canonical priority
 * @param left first key
 * @param right second key
 * @returns sort order
 */
function compareTopLevelKeys(left: string, right: string): number {
  const leftPriority =
    TOP_LEVEL_KEY_PRIORITY[left] ?? DEFAULT_TOP_LEVEL_PRIORITY;
  const rightPriority =
    TOP_LEVEL_KEY_PRIORITY[right] ?? DEFAULT_TOP_LEVEL_PRIORITY;

  return leftPriority === rightPriority
    ? left.localeCompare(right)
    : leftPriority - rightPriority;
}

/**
 * recursively sorts object keys without changing array order
 * @param params canonicalization state
 * @param params.value value to canonicalize
 * @param params.topLevel whether preferred top-level ordering applies
 * @param params.context annotation error context
 * @param params.seen active object ancestry
 * @returns canonicalized value
 */
function canonicalizeValue(params: CanonicalizeValueParams): unknown {
  const { value, topLevel, context, seen } = params;

  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    throw annotationProfileError({
      message: 'cyclic values are not allowed.',
      context,
    });
  }
  seen.add(value);

  const canonical = Array.isArray(value)
    ? value.map((item) =>
        canonicalizeValue({
          value: item,
          topLevel: false,
          context,
          seen,
        }),
      )
    : Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) =>
            topLevel
              ? compareTopLevelKeys(left, right)
              : left.localeCompare(right),
          )
          .map(([key, item]) => [
            key,
            canonicalizeValue({
              value: item,
              topLevel: false,
              context,
              seen,
            }),
          ]),
      );
  seen.delete(value);

  return canonical;
}

/**
 * canonicalizes an annotation object using the profile's deterministic key order
 * @param annotations annotation object to canonicalize
 * @returns canonicalized annotation object
 */
export function canonicalizeAnnotationObject(
  annotations: Record<string, unknown>,
): Record<string, unknown> {
  return canonicalizeValue({
    value: annotations,
    topLevel: true,
    context: { name: 'Annotation' },
    seen: new WeakSet(),
  }) as Record<string, unknown>;
}

/**
 * serializes one canonical MDC Annotation Profile flow mapping
 * @param annotations semantic annotation object
 * @returns one single-line YAML flow mapping
 */
export function stringifyAnnotationMapping(annotations: Annotations): string {
  const context: AnnotationContext = { name: 'Annotation' };
  validateAnnotationValue({ value: annotations, context, seen: new WeakSet() });
  assertAnnotationNamedStrings(annotations, context);
  const canonical = canonicalizeAnnotationObject(annotations);
  const document = new Document(undefined, { version: '1.2', schema: 'core' });
  document.contents = document.createNode(canonical, { flow: true });
  const forceFlowAndQuoteMultilineStrings = (node: Node | null): void => {
    if (isMap(node) || isSeq(node)) {
      node.flow = true;
      for (const item of node.items) {
        if (isMap(node)) {
          const pair = item as Pair;
          forceFlowAndQuoteMultilineStrings(pair.key as Node);
          forceFlowAndQuoteMultilineStrings(pair.value as Node | null);
        } else {
          forceFlowAndQuoteMultilineStrings(item as Node | null);
        }
      }
    } else if (
      isScalar(node) &&
      typeof node.value === 'string' &&
      node.value.includes('\n')
    ) {
      node.type = 'QUOTE_DOUBLE';
    }
  };
  forceFlowAndQuoteMultilineStrings(document.contents);
  const source = document
    .toString({
      lineWidth: 0,
      defaultKeyType: 'PLAIN',
      defaultStringType: 'PLAIN',
      doubleQuotedAsJSON: true,
    })
    .trimEnd();

  if (source.includes('\n')) {
    throw annotationProfileError({
      message: 'canonical output must be single-line.',
      context,
    });
  }
  const end = findFlowMappingEnd({
    source,
    startIndex: 0,
    options: { context: 'Annotation' },
  });
  if (end !== source.length) {
    throw annotationProfileError({
      message: 'canonical output must be one flow mapping.',
      context,
    });
  }

  return source;
}
