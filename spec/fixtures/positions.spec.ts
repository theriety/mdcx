import { describe, expect, it } from 'vitest';

import { getEofRange, getRange } from './positions';

import type { Range } from '#types';

// TEST SUITES //

describe('fn:getRange', () => {
  describe('single-line matches', () => {
    it('should compute position for match at document start', () => {
      const source = 'hello world';

      const result = getRange(source, 'hello');

      expect(result).toEqual({
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 6, offset: 5 },
      } satisfies Range);
    });

    it('should compute position for match in middle of line', () => {
      const source = 'hello world';

      const result = getRange(source, 'world');

      expect(result).toEqual({
        start: { line: 1, column: 7, offset: 6 },
        end: { line: 1, column: 12, offset: 11 },
      } satisfies Range);
    });

    it('should compute position for match on second line', () => {
      const source = 'first\nsecond';

      const result = getRange(source, 'second');

      expect(result).toEqual({
        start: { line: 2, column: 1, offset: 6 },
        end: { line: 2, column: 7, offset: 12 },
      } satisfies Range);
    });

    it('should compute position for match with column offset', () => {
      const source = 'line one\n  indented';

      const result = getRange(source, 'indented');

      expect(result).toEqual({
        start: { line: 2, column: 3, offset: 11 },
        end: { line: 2, column: 11, offset: 19 },
      } satisfies Range);
    });
  });

  describe('multi-line matches', () => {
    it('should compute position for match spanning multiple lines', () => {
      const source = 'start\nmulti\nline\nend';
      const match = 'multi\nline';

      const result = getRange(source, match);

      expect(result).toEqual({
        start: { line: 2, column: 1, offset: 6 },
        end: { line: 3, column: 5, offset: 16 },
      } satisfies Range);
    });

    it('should compute position for match starting mid-line spanning lines', () => {
      const source = 'prefix multi\nline suffix';
      const match = 'multi\nline';

      const result = getRange(source, match);

      expect(result).toEqual({
        start: { line: 1, column: 8, offset: 7 },
        end: { line: 2, column: 5, offset: 17 },
      } satisfies Range);
    });
  });

  describe('startOffset parameter', () => {
    it('should find second occurrence using startOffset', () => {
      const source = 'test test';

      const result = getRange(source, 'test', 1);

      expect(result).toEqual({
        start: { line: 1, column: 6, offset: 5 },
        end: { line: 1, column: 10, offset: 9 },
      } satisfies Range);
    });

    it('should find occurrence on later line using startOffset', () => {
      const source = 'abc\nabc\nabc';

      const result = getRange(source, 'abc', 4);

      expect(result).toEqual({
        start: { line: 2, column: 1, offset: 4 },
        end: { line: 2, column: 4, offset: 7 },
      } satisfies Range);
    });

    it('should find third occurrence using startOffset past second', () => {
      const source = 'abc\nabc\nabc';

      const result = getRange(source, 'abc', 8);

      expect(result).toEqual({
        start: { line: 3, column: 1, offset: 8 },
        end: { line: 3, column: 4, offset: 11 },
      } satisfies Range);
    });
  });

  describe('edge cases', () => {
    it('should throw error when match is not found', () => {
      const source = 'hello world';

      expect(() => getRange(source, 'missing')).toThrow(
        "match 'missing' not found in source",
      );
    });

    it('should throw error when match is not found after startOffset', () => {
      const source = 'hello world';

      expect(() => getRange(source, 'hello', 5)).toThrow(
        "match 'hello' not found in source starting from offset 5",
      );
    });

    it('should handle empty source with not found error', () => {
      const source = '';

      expect(() => getRange(source, 'any')).toThrow(
        "match 'any' not found in source",
      );
    });

    it('should compute position for newline character', () => {
      const source = 'line1\nline2';

      const result = getRange(source, '\n');

      expect(result).toEqual({
        start: { line: 1, column: 6, offset: 5 },
        end: { line: 2, column: 1, offset: 6 },
      } satisfies Range);
    });

    it('should compute position for single character', () => {
      const source = 'abc';

      const result = getRange(source, 'b');

      expect(result).toEqual({
        start: { line: 1, column: 2, offset: 1 },
        end: { line: 1, column: 3, offset: 2 },
      } satisfies Range);
    });
  });
});

describe('fn:getEofRange', () => {
  it('should compute EOF position for empty source', () => {
    const source = '';

    const result = getEofRange(source);

    expect(result).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    } satisfies Range);
  });

  it('should compute EOF position for single-line source', () => {
    const source = 'hello';

    const result = getEofRange(source);

    expect(result).toEqual({
      start: { line: 1, column: 6, offset: 5 },
      end: { line: 1, column: 6, offset: 5 },
    } satisfies Range);
  });

  it('should compute EOF position for source ending with newline', () => {
    const source = 'hello\n';

    const result = getEofRange(source);

    expect(result).toEqual({
      start: { line: 2, column: 1, offset: 6 },
      end: { line: 2, column: 1, offset: 6 },
    } satisfies Range);
  });

  it('should compute EOF position for multi-line source', () => {
    const source = 'line1\nline2\nline3';

    const result = getEofRange(source);

    expect(result).toEqual({
      start: { line: 3, column: 6, offset: 17 },
      end: { line: 3, column: 6, offset: 17 },
    } satisfies Range);
  });

  it('should compute EOF position for source with only newlines', () => {
    const source = '\n\n';

    const result = getEofRange(source);

    expect(result).toEqual({
      start: { line: 3, column: 1, offset: 2 },
      end: { line: 3, column: 1, offset: 2 },
    } satisfies Range);
  });
});
