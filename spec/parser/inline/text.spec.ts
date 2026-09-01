import { describe, expect, it } from 'vitest';

import { createTextNode } from '#parser/inline/text';

import { START_RANGE } from '../../fixtures/positions';

// TEST SUITES //

describe('fn:createTextNode', () => {
  it('should create a text node with range offsets', () => {
    const node = createTextNode({
      text: 'Hi',
      baseRange: START_RANGE,
      startOffset: 0,
      endOffset: 2,
    });

    expect(node).toMatchObject({
      type: 'text',
      text: 'Hi',
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 3, offset: 2 },
      },
    });
  });
});
