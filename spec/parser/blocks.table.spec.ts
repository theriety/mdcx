import { describe, expect, it } from 'vitest';

import { parseBlockContent } from '#parser/blocks';
import { offsetRange } from '#parser/position';
import {
  buildTableNode,
  isBoundingLine,
  isTableSeparatorLine,
  parseAlignments,
  parseCellAlignment,
  splitTableRow,
} from '#parser/table';

import { getRange } from '../fixtures/positions';

import type { LayoutNode, TableNode } from '#types';

// TEST SUITES //

describe('fn:isTableLine', () => {
  it('should return true for valid table row', () => {
    const result = isBoundingLine('| A | B |');

    expect(result).toBe(true);
  });

  it('should return true for table row with whitespace', () => {
    const result = isBoundingLine('  | A | B |  ');

    expect(result).toBe(true);
  });

  it('should return false for non-table content', () => {
    const result = isBoundingLine('This is not a table');

    expect(result).toBe(false);
  });

  it('should return false for partial pipe content', () => {
    const result = isBoundingLine('| A | B');

    expect(result).toBe(false);
  });
});

describe('fn:isTableSeparatorLine', () => {
  it('should return true for valid separator', () => {
    const result = isTableSeparatorLine('|---|---|');

    expect(result).toBe(true);
  });

  it('should return true for separator with alignment colons', () => {
    const result = isTableSeparatorLine('|:---|---:|:---:|');

    expect(result).toBe(true);
  });

  it('should return false for non-table content', () => {
    const nonTableContent = 'This is not a table';

    const result = isTableSeparatorLine(nonTableContent);

    expect(result).toBe(false);
  });

  it('should return false for regular table row', () => {
    const regularTableRow = '| A | B |';

    const result = isTableSeparatorLine(regularTableRow);

    expect(result).toBe(false);
  });

  it('should return false for separator with insufficient dashes', () => {
    const shortSeparator = '|--|--|';

    const result = isTableSeparatorLine(shortSeparator);

    expect(result).toBe(false);
  });
});

describe('fn:splitTableRow', () => {
  it('should split row with surrounding pipes', () => {
    const rowWithSurroundingPipes = '| A | B | C |';

    const result = splitTableRow(rowWithSurroundingPipes);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should split row without leading pipe', () => {
    const rowWithoutLeadingPipe = 'A | B | C |';

    const result = splitTableRow(rowWithoutLeadingPipe);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should split row without trailing pipe', () => {
    const rowWithoutTrailingPipe = '| A | B | C';

    const result = splitTableRow(rowWithoutTrailingPipe);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should split row without any surrounding pipes', () => {
    const rowWithoutSurroundingPipes = 'A | B | C';

    const result = splitTableRow(rowWithoutSurroundingPipes);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should preserve leading whitespace when preserveLeading is true', () => {
    const result = splitTableRow('|  A  |  B  |', true);

    expect(result).toEqual(['  A', '  B']);
  });
});

describe('fn:parseCellAlignment', () => {
  it('should return left for colon at start', () => {
    expect(parseCellAlignment(':---')).toBe('left');
  });

  it('should return left for colon at start with many dashes', () => {
    expect(parseCellAlignment(':------')).toBe('left');
  });

  it('should return right for colon at end', () => {
    expect(parseCellAlignment('---:')).toBe('right');
  });

  it('should return right for colon at end with many dashes', () => {
    expect(parseCellAlignment('------:')).toBe('right');
  });

  it('should return center for colons at both ends', () => {
    expect(parseCellAlignment(':---:')).toBe('center');
  });

  it('should return center for colons at both ends with many dashes', () => {
    expect(parseCellAlignment(':------:')).toBe('center');
  });

  it('should return undefined for no colons (default)', () => {
    expect(parseCellAlignment('---')).toBeUndefined();
  });

  it('should handle whitespace around separator', () => {
    expect(parseCellAlignment('  :---  ')).toBe('left');
    expect(parseCellAlignment('  ---:  ')).toBe('right');
    expect(parseCellAlignment('  :---:  ')).toBe('center');
  });
});

describe('fn:parseAlignments', () => {
  it('should parse alignments from separator line', () => {
    const result = parseAlignments('|:---|:---:|---:|');

    expect(result).toEqual(['left', 'center', 'right']);
  });

  it('should handle mixed alignments with default', () => {
    const result = parseAlignments('|---|:---:|---:|');

    expect(result).toEqual([undefined, 'center', 'right']);
  });

  it('should handle all default alignments', () => {
    const result = parseAlignments('|---|---|---|');

    expect(result).toEqual([undefined, undefined, undefined]);
  });

  it('should handle single column', () => {
    const result = parseAlignments('|:---:|');

    expect(result).toEqual(['center']);
  });
});

describe('fn:buildTableNode', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 10, offset: 9 },
  };

  it('should build table from header and data rows', () => {
    const content = ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toHaveLength(2);
    expect(result.children).toHaveLength(1);
  });

  it('should handle table row without leading pipe (no headers)', () => {
    // separator without leading pipe is not detected as valid separator
    const rowsWithoutLeadingPipe = ['A | B |', '---|---|', '1 | 2 |'];
    const content = rowsWithoutLeadingPipe.join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toBeUndefined();
    expect(result.children).toHaveLength(3);
  });

  it('should handle table row without trailing pipe (no headers)', () => {
    // separator without trailing pipe is not detected as valid separator
    const rowsWithoutTrailingPipe = ['| A | B', '|---|---', '| 1 | 2'];
    const content = rowsWithoutTrailingPipe.join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toBeUndefined();
    expect(result.children).toHaveLength(3);
  });

  it('should handle table row without any pipes at edges (no headers)', () => {
    // separator without pipes at edges is not detected as valid separator
    const rowsWithoutEdgePipes = ['A | B', '---|---', '1 | 2'];
    const content = rowsWithoutEdgePipes.join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toBeUndefined();
    expect(result.children).toHaveLength(3);
  });

  it('should skip separator lines in data rows', () => {
    const content = [
      '| Col1 | Col2 |',
      '|------|------|',
      '| Val1 | Val2 |',
      '| Val3 | Val4 |',
    ].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.children).toHaveLength(2);
  });

  it('should handle empty cells', () => {
    const content = ['| A |  |', '|---|---|', '|  | B |'].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result).toMatchObject({
      headers: [expect.anything(), { content: [] }],
      children: [{ children: [{ content: [] }, expect.anything()] }],
    });
  });

  it('should parse inline content in cells', () => {
    const content = [
      '| **Bold** | *Italic* |',
      '|----------|----------|',
      '| Normal | `Code` |',
    ].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result).toMatchObject({
      headers: [
        {
          content: [
            expect.objectContaining({ type: 'text', formats: ['bold'] }),
          ],
        },
        expect.anything(),
      ],
    });
  });

  it('should parse alignment from separator and apply to header cells', () => {
    const content = [
      '| Left | Center | Right |',
      '|:-----|:------:|------:|',
      '| A | B | C |',
    ].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result).toMatchObject({
      headers: [
        { alignment: 'left' },
        { alignment: 'center' },
        { alignment: 'right' },
      ],
    });
  });

  it('should handle default alignment (no colons)', () => {
    const content = ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.headers![0]).not.toHaveProperty('alignment');
    expect(result.headers![1]).not.toHaveProperty('alignment');
  });

  it('should handle mixed alignment with defaults', () => {
    const content = [
      '| Default | Right |',
      '|---------|------:|',
      '| A | B |',
    ].join('\n');

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.headers![0]).not.toHaveProperty('alignment');
    expect(result).toMatchObject({
      headers: [expect.anything(), { alignment: 'right' }],
    });
  });

  it('should build table without headers when no separator line exists', () => {
    const content = '| A | B |\n| C | D |';

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toBeUndefined();
    expect(result.children).toHaveLength(2);
  });

  it('should build table with headers when separator line exists', () => {
    const content = '| A | B |\n|---|---|\n| C | D |';

    const result = buildTableNode(content, { range: defaultRange });

    expect(result.type).toBe('table');
    expect(result.headers).toHaveLength(2);
    expect(result.children).toHaveLength(1);
  });
});

describe('fn:parseBlockContent with pipe content', () => {
  const defaultRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 10, offset: 9 },
  };

  it('should create table node from single pipe line (no headers)', () => {
    const content = '| A | B |';

    const node = parseBlockContent({
      content,
      context: { range: defaultRange },
    }) as TableNode;

    // single line without separator becomes table with undefined headers
    expect(node.type).toBe('table');
    expect(node.headers).toBeUndefined();
    expect(node.children).toHaveLength(1);
  });

  it('should attach annotations to table node', () => {
    const content = '| A | B |';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { ref: 'my-table' },
      },
    }) as TableNode;

    // ref is extracted from annotations and placed at top level
    expect(node.annotations).toEqual({});
    expect(node.ref).toBe('my-table');
  });

  it('should attach annotations without ref when ref is non-string', () => {
    const content = '| A | B |';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { highlight: true },
      },
    }) as TableNode;

    expect(node.annotations).toEqual({ highlight: true });
    expect(node.ref).toBeUndefined();
  });

  it('should respect type annotation override to layout', () => {
    const content = '| A | B |\n| C | D |';

    const node = parseBlockContent({
      content,
      context: {
        range: defaultRange,
        annotations: { type: 'layout' },
      },
    }) as LayoutNode;

    expect(node.type).toBe('layout');
  });
});

describe('buildTableNode position accuracy', () => {
  it('should compute accurate header cell positions', () => {
    const source = '| A | B |\n|---|---|\n| 1 | 2 |';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    expect(result.headers?.[0]?.range).toEqual(getRange(source, 'A'));
    expect(result.headers?.[1]?.range).toEqual(getRange(source, 'B'));
  });

  it('should compute accurate row positions', () => {
    const source = '| A | B |\n|---|---|\n| 1 | 2 |';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    expect(result.children[0]?.range).toEqual(getRange(source, '| 1 | 2 |'));
  });

  it('should compute accurate cell positions', () => {
    const source = '| A | B |\n|---|---|\n| 1 | 2 |';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    expect(result.children[0]?.children[0]?.range).toEqual(
      getRange(source, '1'),
    );
    expect(result.children[0]?.children[1]?.range).toEqual(
      getRange(source, '2'),
    );
  });

  it('should compute positions for multi-character cells', () => {
    const source = '| Header1 | Header2 |\n|---------|---------|';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    expect(result.headers?.[0]?.range).toEqual(getRange(source, 'Header1'));
    expect(result.headers?.[1]?.range).toEqual(getRange(source, 'Header2'));
  });

  it('should handle empty cells with zero-width positions', () => {
    const source = '| A |  |\n|---|---|\n|  | B |';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    // empty header cell: position after standard leading space padding
    // find '|  |' cell delimiter, offset by 2 for content area start
    const emptyHeaderCellDelimiter = getRange(source, '|  |');
    const emptyHeaderRange = offsetRange(emptyHeaderCellDelimiter, 2);
    expect(result.headers?.[1]?.range).toEqual({
      start: emptyHeaderRange.start,
      end: emptyHeaderRange.start,
    });

    // empty data cell: position after standard leading space padding
    // find second '|  |' occurrence (on line 3), offset by 2 for content area
    const emptyDataCellDelimiter = getRange(
      source,
      '|  |',
      source.indexOf('|  |') + 1,
    );
    const emptyDataRange = offsetRange(emptyDataCellDelimiter, 2);
    expect(result.children[0]?.children[0]?.range).toEqual({
      start: emptyDataRange.start,
      end: emptyDataRange.start,
    });
  });

  it('should compute positions for multiple data rows', () => {
    const source = '| H |\n|---|\n| R1 |\n| R2 |';

    const result = buildTableNode(source, {
      range: getRange(source, source),
    });

    expect(result.children[0]?.children[0]?.range).toEqual(
      getRange(source, 'R1'),
    );
    expect(result.children[1]?.children[0]?.range).toEqual(
      getRange(source, 'R2'),
    );
  });
});
