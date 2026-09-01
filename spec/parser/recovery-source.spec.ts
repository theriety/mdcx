import { describe, expect, it } from 'vitest';

import { translatedRange } from '#parser/recovery-source';

import type { Range } from '#types';

const UNKNOWN_LINE_RANGE: Range = {
  start: { line: 2, column: 1, offset: 4 },
  end: { line: 2, column: 1, offset: 4 },
};

describe('fn:translatedRange', () => {
  it('should reject a normalized range whose source line is not mapped', () => {
    expect(() => translatedRange(UNKNOWN_LINE_RANGE, [])).toThrow(
      new RangeError('Missing recovery source line 2.'),
    );
  });
});
