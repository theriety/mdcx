import { describe, expect, it } from 'vitest';

import { parseMedia } from '#parser/inline/media';

// TEST SUITES //

describe('fn:parseMedia', () => {
  it('should parse markdown media', () => {
    const result = parseMedia({
      content: '![alt](https://example.com/image.png)',
      startIndex: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.node).toEqual({
      type: 'media',
      caption: [{ type: 'text', text: 'alt' }],
      src: 'https://example.com/image.png',
    });
  });

  it('should parse media with annotation', () => {
    const result = parseMedia({
      content: '![alt](image.png){{ ref: image1 }}',
      startIndex: 0,
    });

    expect(result!.node.annotations).toEqual({ ref: 'image1' });
  });

  it('should parse nested media annotation values', () => {
    const result = parseMedia({
      content:
        '![alt](image.png){{ style: {color: red}, sizes: [small, large] }}',
      startIndex: 0,
    });

    expect(result!.node.annotations).toEqual({
      style: { color: 'red' },
      sizes: ['small', 'large'],
    });
  });

  it('should return null if no closing bracket in media', () => {
    const result = parseMedia({
      content: '![unclosed alt text',
      startIndex: 0,
    });

    expect(result).toBeNull();
  });

  it('should return null if no closing paren in media', () => {
    const result = parseMedia({
      content: '![alt](unclosed url',
      startIndex: 0,
    });

    expect(result).toBeNull();
  });
});
