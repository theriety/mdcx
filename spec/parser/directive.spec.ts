import { describe, expect, it } from 'vitest';

import { ParseError } from '#errors';
import { extractDirectiveContent, parseDirective } from '#parser/directive';

import { createAnnotationToken, createToken } from '../fixtures/tokens';

import type { Token } from '#lexer/types';
import type { Position } from '#types';

describe('fn:parseDirective', () => {
  it('should parse simple YAML', () => {
    const tokens = [createAnnotationToken('type: doc')];

    const result = parseDirective(tokens);

    expect(result).toEqual({ type: 'doc' });
  });

  it('should parse multiple properties', () => {
    const tokens = [createAnnotationToken('type: doc\nauthor: Jane')];

    const result = parseDirective(tokens);

    expect(result).toEqual({ type: 'doc', author: 'Jane' });
  });

  it('should parse nested YAML objects', () => {
    const tokens = [
      createAnnotationToken(
        ['meta:', '  author: Jane', '  version: 1.0'].join('\n'),
      ),
    ];

    const result = parseDirective(tokens);

    expect(result.meta).toEqual({ author: 'Jane', version: 1.0 });
  });

  it('should handle empty directive', () => {
    const result = parseDirective([]);

    expect(result).toEqual({});
  });

  it('should throw ParseError for invalid YAML', () => {
    const tokens = [createAnnotationToken('invalid: yaml: content:')];

    expect(() => parseDirective(tokens)).toThrow(ParseError);
  });

  it('should return empty object for non-object YAML', () => {
    const tokens = [createAnnotationToken('just a string')];

    const result = parseDirective(tokens);

    expect(result).toEqual({});
  });

  it.each([
    ['aliases', 'shared: &shared value\ncopy: *shared'],
    ['explicit tags', 'value: !!str text'],
    ['merge keys', 'base: &base { value: one }\nmerged: { <<: *base }'],
    ['duplicate keys', 'value: one\nvalue: two'],
    ['non-string keys', '1: value'],
  ])('should reject %s', (_label, content) => {
    const tokens = [createAnnotationToken(content)];

    expect(() => parseDirective(tokens)).toThrow(ParseError);
  });

  it('should reject front matter deeper than the annotation limit', () => {
    const content = Array.from(
      { length: 17 },
      (_value, index) => `${'  '.repeat(index)}level${index}:`,
    ).join('\n');
    const tokens = [
      createAnnotationToken(`${content}\n${'  '.repeat(17)}value`),
    ];

    expect(() => parseDirective(tokens)).toThrow(ParseError);
  });

  it('should reject front matter above the byte limit', () => {
    const tokens = [createAnnotationToken(`value: ${'a'.repeat(65_530)}`)];

    expect(() => parseDirective(tokens)).toThrow(ParseError);
  });

  it('should accept front matter at the exact byte limit', () => {
    const prefix = 'value: ';
    const value = 'a'.repeat(65_536 - prefix.length);
    const tokens = [createAnnotationToken(`${prefix}${value}`)];

    expect(parseDirective(tokens)).toMatchObject({ value });
  });

  it('should measure the front-matter limit in UTF-8 bytes', () => {
    const tokens = [createAnnotationToken(`value: ${'é'.repeat(32_765)}`)];

    expect(() => parseDirective(tokens)).toThrow(ParseError);
  });
});

describe('fn:extractDirectiveContent', () => {
  it('should concatenate token values', () => {
    const tokens = [createAnnotationToken('type: doc\nauthor: Jane')];

    const content = extractDirectiveContent(tokens);

    expect(content).toBe('type: doc\nauthor: Jane');
  });

  it('should filter out non-content tokens', () => {
    const tokens: Token[] = [
      createAnnotationToken('type: doc\n'),
      createToken('{{', { type: 'ANNOTATION_START' }),
      createAnnotationToken('author: Jane'),
    ];

    const content = extractDirectiveContent(tokens);

    expect(content).toBe('type: doc\nauthor: Jane');
  });

  it('should handle empty token array', () => {
    const content = extractDirectiveContent([]);

    expect(content).toBe('');
  });
});

describe('cl:ParseError', () => {
  it('should create error with message', () => {
    const error = new ParseError('MDC_ANNOTATION_INVALID', 'test error');

    expect(error.message).toBe('test error');
    expect(error.name).toBe('ParseError');
  });

  it('should store position information', () => {
    const position: Position = { line: 5, column: 10, offset: 50 };
    const error = new ParseError(
      'MDC_ANNOTATION_INVALID',
      'test error',
      position,
    );

    expect(error.position).toEqual(position);
  });

  it('should allow undefined position', () => {
    const error = new ParseError('MDC_ANNOTATION_INVALID', 'test error');

    expect(error.position).toBeUndefined();
  });
});
