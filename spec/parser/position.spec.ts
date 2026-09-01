import { describe, expect, it } from 'vitest';

import {
  computeLineOffsets,
  createLineRange,
  splitTableRowWithRanges,
} from '#parser/position';

import type { Range } from '#types';

// CONSTANTS //

const BASE_RANGE: Range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

// TEST SUITES //

describe('fn:computeLineOffsets', () => {
  it('should return offsets for each line shape', () => {
    const cases = [
      { content: 'single line', offsets: [0] },
      { content: 'line1\nline2\nline3', offsets: [0, 6, 12] },
      { content: '', offsets: [0] },
      { content: 'line1\nline2\n', offsets: [0, 6, 12] },
      { content: 'line1\n\nline3', offsets: [0, 6, 7] },
    ];

    for (const { content, offsets } of cases) {
      const result = computeLineOffsets(content);

      expect(result).toEqual(offsets);
    }
  });
});

describe('fn:createLineRange', () => {
  it('should create position for first line content', () => {
    const result = createLineRange({
      baseRange: BASE_RANGE,
      lineIndex: 0,
      lineStartOffset: 0,
      columnOffset: 2,
      length: 5,
    });

    expect(result).toEqual({
      start: { line: 1, column: 3, offset: 2 },
      end: { line: 1, column: 8, offset: 7 },
    } satisfies Range);
  });

  it('should create position for second line content', () => {
    const result = createLineRange({
      baseRange: BASE_RANGE,
      lineIndex: 1,
      lineStartOffset: 6,
      columnOffset: 2,
      length: 4,
    });

    expect(result).toEqual({
      start: { line: 2, column: 3, offset: 8 },
      end: { line: 2, column: 7, offset: 12 },
    } satisfies Range);
  });

  it('should create position for content at line start', () => {
    const result = createLineRange({
      baseRange: BASE_RANGE,
      lineIndex: 0,
      lineStartOffset: 0,
      columnOffset: 0,
      length: 3,
    });

    expect(result).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 4, offset: 3 },
    } satisfies Range);
  });

  it('should create zero-width position for empty content', () => {
    const result = createLineRange({
      baseRange: BASE_RANGE,
      lineIndex: 0,
      lineStartOffset: 0,
      columnOffset: 5,
      length: 0,
    });

    expect(result).toEqual({
      start: { line: 1, column: 6, offset: 5 },
      end: { line: 1, column: 6, offset: 5 },
    } satisfies Range);
  });

  it('should handle base position with non-zero start', () => {
    const baseWithOffset: Range = {
      start: { line: 5, column: 10, offset: 100 },
      end: { line: 5, column: 20, offset: 110 },
    };

    const result = createLineRange({
      baseRange: baseWithOffset,
      lineIndex: 2,
      lineStartOffset: 20,
      columnOffset: 5,
      length: 3,
    });

    expect(result).toEqual({
      start: { line: 7, column: 6, offset: 125 },
      end: { line: 7, column: 9, offset: 128 },
    } satisfies Range);
  });
});

describe('fn:splitTableRowWithRanges', () => {
  it('should split simple table row with positions', () => {
    const row = '| A | B |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'A', columnOffset: 2, length: 1 },
      { content: 'B', columnOffset: 6, length: 1 },
    ]);
  });

  it('should handle cells with extra whitespace', () => {
    const row = '|  Cell1  |  Cell2  |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'Cell1', columnOffset: 3, length: 5 },
      { content: 'Cell2', columnOffset: 13, length: 5 },
    ]);
  });

  it('should handle empty cells', () => {
    const row = '| A |  | C |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'A', columnOffset: 2, length: 1 },
      { content: '', columnOffset: 6, length: 0 },
      { content: 'C', columnOffset: 9, length: 1 },
    ]);
  });

  it('should handle row without leading pipe', () => {
    const row = 'A | B |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'A', columnOffset: 0, length: 1 },
      { content: 'B', columnOffset: 4, length: 1 },
    ]);
  });

  it('should handle row without trailing pipe', () => {
    const row = '| A | B';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'A', columnOffset: 2, length: 1 },
      { content: 'B', columnOffset: 6, length: 1 },
    ]);
  });

  it('should handle single-cell table', () => {
    const row = '| Only |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([{ content: 'Only', columnOffset: 2, length: 4 }]);
  });

  it('should handle complex content in cells', () => {
    const row = '| **bold** | `code` |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: '**bold**', columnOffset: 2, length: 8 },
      { content: '`code`', columnOffset: 13, length: 6 },
    ]);
  });

  it('should handle leading whitespace on row', () => {
    const row = '  | A | B |';

    const result = splitTableRowWithRanges(row);

    expect(result).toEqual([
      { content: 'A', columnOffset: 4, length: 1 },
      { content: 'B', columnOffset: 8, length: 1 },
    ]);
  });
});
