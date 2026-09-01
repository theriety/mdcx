import { describe, expect, it } from 'vitest';

import { parseLink } from '#parser/inline/link';

// TEST SUITES //

describe('fn:parseLink', () => {
  it('should parse markdown link', () => {
    const result = parseLink({
      content: '[text](https://example.com)',
      startIndex: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.node).toMatchObject({
      type: 'link',
      caption: [{ type: 'text', text: 'text' }],
      link: 'https://example.com',
    });
  });

  it('should parse link with annotation', () => {
    const result = parseLink({
      content: '[text](url){{ ref: link1 }}',
      startIndex: 0,
    });

    expect(result!.node.annotations).toEqual({ ref: 'link1' });
    expect(result!.nextIndex).toBe(27);
  });

  it('should parse formatted caption into caption nodes', () => {
    const result = parseLink({
      content: '[**bold** and *italic*](url){{ ref: link1 }}',
      startIndex: 0,
    });

    expect(result!.node).toMatchObject({
      type: 'link',
      annotations: { ref: 'link1' },
      caption: [
        { type: 'text', text: 'bold', formats: ['bold'] },
        { type: 'text', text: ' and ' },
        {
          type: 'text',
          text: 'italic',
          formats: ['italic'],
        },
      ],
    });
  });

  it('should return null for unsupported link forms', () => {
    const results = [
      parseLink({ content: 'plain text', startIndex: 0 }),
      parseLink({ content: '[text]', startIndex: 0 }),
      parseLink({ content: '[unclosed', startIndex: 0 }),
      parseLink({ content: '[text](unclosed', startIndex: 0 }),
      parseLink({ content: '[text](url\nhere)', startIndex: 0 }),
    ];

    expect(results).toEqual([null, null, null, null, null]);
  });

  it('should handle link with empty text', () => {
    const result = parseLink({ content: '[](url)', startIndex: 0 });

    expect(result!.node).toEqual({
      type: 'link',
      caption: [],
      link: 'url',
    });
  });

  it('should handle link with empty url', () => {
    const result = parseLink({ content: '[text]()', startIndex: 0 });

    expect(result!.node).toMatchObject({ type: 'link', link: '' });
  });

  it('should reject an unmistakable invalid trailing annotation', () => {
    expect(() =>
      parseLink({
        content: '[text](url){{ invalid: : }}',
        startIndex: 0,
      }),
    ).toThrow();
  });

  it('should reject an unclosed annotation after a link', () => {
    expect(() =>
      parseLink({ content: '[text](url){{ ref: link', startIndex: 0 }),
    ).toThrow();
  });

  it('should parse nested trailing annotation values', () => {
    const result = parseLink({
      content: '[text](url){{ style: {color: red}, values: [one, two] }}',
      startIndex: 0,
    });

    expect(result!.node.annotations).toEqual({
      style: { color: 'red' },
      values: ['one', 'two'],
    });
  });
});
