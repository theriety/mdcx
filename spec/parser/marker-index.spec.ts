import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';
import { buildMarkerIndex } from '#parser/marker-index';

// TEST SUITES //

describe('fn:buildMarkerIndex', () => {
  it('should index nested marker intervals in opening order', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'Child',
      '--{ ref: child }--',
      '--{ ref: parent }--',
    ].join('\n');

    const result = buildMarkerIndex(tokenize(source));

    expect(result.intervals).toMatchObject([
      {
        ref: 'parent',
        parent: undefined,
      },
      {
        ref: 'child',
        parent: { ref: 'parent' },
      },
    ]);
  });
});
