import { stringifyAnnotationMapping } from '#parser/annotation-profile';

import { INFERRABLE_BLOCK_TYPES } from './inference';

import type { Annotations, NativeBlockType } from '#types';

// TYPES //

/** options for annotation stringification */
export interface StringifyAnnotationsOptions {
  /** property keys to exclude from output */
  excludes?: string[];

  /** retain an otherwise inferrable native type in canonical output */
  preserveType?: boolean;
}

// CONSTANTS //

// FUNCTIONS //

/**
 * stringifies an annotations object to YAML-like format
 * @param annotations the Annotations object to stringify
 * @param options StringifyAnnotationsOptions configuration
 * @returns the stringified annotations
 */
export function stringifyAnnotations(
  annotations?: Annotations,
  options?: StringifyAnnotationsOptions,
): string {
  const filtered = Object.fromEntries(
    Object.entries({ ...annotations }).filter(([key, value]) =>
      key === 'type'
        ? options?.preserveType === true ||
          !INFERRABLE_BLOCK_TYPES.has(value as NativeBlockType)
        : value !== undefined && !options?.excludes?.includes(key),
    ),
  ) as Annotations;

  return Object.keys(filtered).length > 0
    ? `{${stringifyAnnotationMapping(filtered)}}`
    : '';
}
