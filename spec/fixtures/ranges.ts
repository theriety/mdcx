import type { Range } from '#types';

/**
 * default range for test nodes
 * represents a 10-character span at document start (columns 1-10, offsets 0-9)
 */
export const DEFAULT_RANGE: Range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};
