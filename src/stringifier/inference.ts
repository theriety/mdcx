import type { IsEqual } from 'type-fest';

import type { Annotations, NativeBlockNode, NativeBlockType } from '#types';

/** set of native block types that do not require explicit type annotation */
export const INFERRABLE_BLOCK_TYPES = new Set<NativeBlockType>([
  'heading',
  'paragraph',
  'enum',
  'bullet',
  'todo',
  'quote',
  'code',
  'table',
  //  NOTE: we need to specify layout & column type otherwise it will be mistreated as a table
  // 'layout',
  // 'column',
  'header',
  'row',
  'cell',
  'divider',
  'equation',
]);

/** properties embedded in block annotations (excluded from type directive output) */
export const EMBEDDED_PATTERNS = {
  heading: ['depth'],
  code: ['language'],
  column: ['ratio'],
  header: ['alignment'],
  todo: ['checked'],
} as const satisfies {
  [T in NativeBlockType as IsEqual<
    Array<
      keyof NonNullable<Extract<NativeBlockNode, { type: T }>['annotations']>
    >,
    Array<keyof Annotations>
  > extends true
    ? never
    : T]: Array<
    keyof NonNullable<Extract<NativeBlockNode, { type: T }>['annotations']>
  >;
};
