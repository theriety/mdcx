import {
  annotationProfileError,
  MAX_ANNOTATION_DEPTH,
} from './annotation-profile-validation';

import type { Annotations } from '#types';

import type { AnnotationContext } from './annotation-profile';

interface AnnotationValueValidationParams {
  value: unknown;
  context: AnnotationContext;
  seen: WeakSet<object>;
  depth?: number;
}

interface AnnotationCollectionValidationParams {
  context: AnnotationContext;
  seen: WeakSet<object>;
  depth: number;
}

interface AnnotationArrayValidationParams extends AnnotationCollectionValidationParams {
  value: unknown[];
}

interface AnnotationObjectValidationParams extends AnnotationCollectionValidationParams {
  value: object;
}

/**
 * validates a runtime annotation value as bounded, acyclic JSON data
 * @param params runtime annotation validation arguments
 * @param params.value value to validate
 * @param params.context annotation error context
 * @param params.seen active object ancestry
 * @param params.depth current collection depth
 */
export function validateAnnotationValue(
  params: AnnotationValueValidationParams,
): void {
  const { value, context, seen, depth = 1 } = params;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw annotationProfileError({
        message: 'numbers must be finite.',
        context,
      });
    }

    return;
  }
  if (typeof value !== 'object') {
    throw annotationProfileError({
      message: 'values must be JSON-compatible.',
      context,
    });
  }
  if (depth > MAX_ANNOTATION_DEPTH) {
    throw annotationProfileError({
      message: `collection depth exceeds the limit of ${MAX_ANNOTATION_DEPTH}.`,
      context,
    });
  }
  if (seen.has(value)) {
    throw annotationProfileError({
      message: 'cyclic values are not allowed.',
      context,
    });
  }
  seen.add(value);
  if (Array.isArray(value)) {
    validateArray({ value, context, seen, depth });
  } else {
    validateObject({ value, context, seen, depth });
  }
  seen.delete(value);
}

/**
 * enforces semantic constraints on reserved annotation properties
 * @param annotations annotation mapping to validate
 * @param context annotation error context
 */
export function assertAnnotationNamedStrings(
  annotations: Annotations,
  context: AnnotationContext,
): void {
  for (const key of ['type', 'ref'] as const) {
    const value = annotations[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || value.trim() === '')
    ) {
      throw annotationProfileError({
        message: `property "${key}" must be a non-empty string.`,
        context,
      });
    }
  }
}

/**
 * validates one nested array value
 * @param params array validation parameters
 * @param params.value array to validate
 * @param params.context annotation error context
 * @param params.seen active object ancestry
 * @param params.depth current collection depth
 */
function validateArray({
  value,
  context,
  seen,
  depth,
}: AnnotationArrayValidationParams): void {
  for (const item of value) {
    validateAnnotationValue({ value: item, context, seen, depth: depth + 1 });
  }
}

/**
 * validates one nested object value
 * @param params object validation parameters
 * @param params.value object to validate
 * @param params.context annotation error context
 * @param params.seen active object ancestry
 * @param params.depth current collection depth
 */
function validateObject({
  value,
  context,
  seen,
  depth,
}: AnnotationObjectValidationParams): void {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw annotationProfileError({
      message: 'objects must be plain JSON objects.',
      context,
    });
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === '<<') {
      throw annotationProfileError({
        message: 'merge keys are not allowed.',
        context,
      });
    }
    validateAnnotationValue({ value: item, context, seen, depth: depth + 1 });
  }
}
