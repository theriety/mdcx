import { describe, expect, it } from 'vitest';

import { parseInlineCaption } from '#parser/inline/caption';

// TEST SUITES //

describe('fn:parseInlineCaption', () => {
  it('should parse formatted caption text', () => {
    const result = parseInlineCaption({
      content: '**bold**',
      startIndex: 0,
      endIndex: 8,
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: 'text',
        text: 'bold',
        formats: ['bold'],
      }),
    ]);
  });

  it('should stop when a caption-like value has a sparse character', () => {
    const sparse = {
      length: 1,
      startsWith: () => false,
    } as unknown as string;

    expect(
      parseInlineCaption({ content: sparse, startIndex: 0, endIndex: 1 }),
    ).toEqual([]);
  });
});
