import { describe, expect, it } from 'vitest';

import {
  parseInlineAnnotation,
  parseTrailingAnnotation,
} from '#parser/inline/annotation';

// TEST SUITES //

describe('fn:parseInlineAnnotation', () => {
  it('should parse annotation at start of string', () => {
    const result = parseInlineAnnotation({
      content: '[value]{{ key: true }}',
      startIndex: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.node).toMatchObject({
      type: 'meta',
      annotations: { key: true },
      caption: [{ type: 'text', text: 'value' }],
    });
  });

  it('should return null for unsupported inline annotation forms', () => {
    const results = [
      parseInlineAnnotation({ content: 'plain text', startIndex: 0 }),
      parseInlineAnnotation({ content: '[text](url)', startIndex: 0 }),
      parseInlineAnnotation({ content: '[unclosed', startIndex: 0 }),
      parseInlineAnnotation({
        content: '[value\nhere]{{ key: true }}',
        startIndex: 0,
      }),
    ];

    expect(results).toEqual([null, null, null, null]);
  });

  it('should throw if no closing brace', () => {
    expect(() =>
      parseInlineAnnotation({ content: '[value]{{ unclosed', startIndex: 0 }),
    ).toThrow();
  });

  it('should throw if newline in brace content', () => {
    expect(() =>
      parseInlineAnnotation({
        content: '[value]{{ key\n: true }}',
        startIndex: 0,
      }),
    ).toThrow();
  });

  it('should handle complex annotation values', () => {
    const result = parseInlineAnnotation({
      content: '[cell]{{ row: 1, style: {color: red}, values: [one, two] }}',
      startIndex: 0,
    });

    expect(result!.node.annotations).toEqual({
      row: 1,
      style: { color: 'red' },
      values: ['one', 'two'],
    });
  });

  it('should handle invalid YAML', () => {
    const baseRange = {
      start: { line: 99, column: 1, offset: 0 },
      end: { line: 99, column: 24, offset: 23 },
    };

    expect(() =>
      parseInlineAnnotation({
        content: '[value]{{ invalid: : }}',
        startIndex: 0,
        baseRange,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
    );
  });

  it('should return correct nextIndex', () => {
    const result = parseInlineAnnotation({
      content: '[value]{{ key: true }}',
      startIndex: 0,
    });

    expect(result!.nextIndex).toBe(22);
  });
});

describe('fn:parseTrailingAnnotation', () => {
  it('should parse trailing annotation content', () => {
    const content = '{{ key: true }}';
    const result = parseTrailingAnnotation(content, { startIndex: 0 });

    expect(result).toEqual({
      annotations: { key: true },
      endIndex: content.length,
    });
  });

  it('should reject invalid annotation YAML', () => {
    expect(() =>
      parseTrailingAnnotation('{{ invalid: : }}', { startIndex: 0 }),
    ).toThrow(expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }));
  });
});
