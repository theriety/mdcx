import { describe, expect, it } from 'vitest';

import { findDelimiter, parseAnnotationSpan } from '#parser/inline/delimiters';

// TEST SUITES //

describe('fn:findDelimiter', () => {
  it('should find a closing delimiter', () => {
    expect(
      findDelimiter({ content: 'text]more', startIndex: 0, delimiter: ']' }),
    ).toBe(4);
  });

  it('should stop at newlines', () => {
    expect(
      findDelimiter({
        content: 'text\n]more',
        startIndex: 0,
        delimiter: ']',
      }),
    ).toBe(-1);
  });
});

describe('fn:parseAnnotationSpan', () => {
  it('should parse the annotation span', () => {
    const content = '{{ key: true }}';
    const result = parseAnnotationSpan(content, 0);

    expect(result).toEqual({ raw: '{ key: true }', endIndex: content.length });
  });

  it('should return null when not starting with braces', () => {
    expect(parseAnnotationSpan('{ key: true }', 0)).toBeNull();
  });

  it('should reject a newline inside the mapping', () => {
    expect(() => parseAnnotationSpan('{{ key:\ntrue }}', 0)).toThrow(
      expect.objectContaining({ code: 'MDC_ANNOTATION_INVALID' }),
    );
  });
});
