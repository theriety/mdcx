import { describe, expect, it } from 'vitest';

import { stringifyTable, stringifyTableRow } from '#stringifier/table';

import { DEFAULT_RANGE } from '../fixtures/ranges';
import {
  createCell,
  createHeader,
  createRow,
  createTable,
} from '../fixtures/table';

import type { CellNode, RowNode, TableNode } from '#types';

// TEST SUITES //

describe('fn:stringifyTableRow', () => {
  it('should stringify single cell row', () => {
    const row = createRow(['Value']);

    const result = stringifyTableRow(row);

    expect(result).toBe('| Value |');
  });

  it('should stringify multi-cell row', () => {
    const row = createRow(['A', 'B', 'C']);

    const result = stringifyTableRow(row);

    expect(result).toBe('| A | B | C |');
  });

  it('should stringify row with empty cells', () => {
    const row = createRow(['', 'Data', '']);

    const result = stringifyTableRow(row);

    expect(result).toBe('|  | Data |  |');
  });
});

describe('fn:stringifyTable', () => {
  describe('basic tables', () => {
    it('should stringify table with header and single data row', () => {
      const table = createTable(
        [createHeader('A'), createHeader('B')],
        [createRow(['1', '2'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| A   | B   |',
        '| --- | --- |',
        '| 1   | 2   |',
      ]);
    });

    it('should stringify table with multiple data rows', () => {
      const table = createTable(
        [createHeader('Name'), createHeader('Age')],
        [createRow(['Alice', '30']), createRow(['Bob', '25'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Name  | Age |',
        '| ----- | --- |',
        '| Alice | 30  |',
        '| Bob   | 25  |',
      ]);
    });

    it('should stringify table with no data rows', () => {
      const table = createTable(
        [createHeader('Col1'), createHeader('Col2')],
        [],
      );

      const result = stringifyTable(table);

      expect(result).toEqual(['| Col1 | Col2 |', '| ---- | ---- |']);
    });

    it('should stringify table with no headers (data rows only)', () => {
      const table: TableNode = {
        type: 'table',
        children: [createRow(['A', 'B']), createRow(['C', 'D'])],
        range: DEFAULT_RANGE,
      };

      const result = stringifyTable(table);

      expect(result).toEqual(['| A | B |', '| C | D |']);
    });

    it('should stringify table with empty headers array (data rows only)', () => {
      const table: TableNode = {
        type: 'table',
        headers: [],
        children: [createRow(['1', '2'])],
        range: DEFAULT_RANGE,
      };

      const result = stringifyTable(table);

      expect(result).toEqual(['| 1 | 2 |']);
    });
  });

  describe('alignment', () => {
    it('should stringify left-aligned column', () => {
      const table = createTable(
        [createHeader('Left', 'left')],
        [createRow(['A'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual(['| Left |', '| :--- |', '| A    |']);
    });

    it('should stringify right-aligned column', () => {
      const table = createTable(
        [createHeader('Right', 'right')],
        [createRow(['A'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual(['| Right |', '| ----: |', '|     A |']);
    });

    it('should stringify center-aligned column', () => {
      const table = createTable(
        [createHeader('Center', 'center')],
        [createRow(['A'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual(['| Center |', '| :----: |', '|   A    |']);
    });

    it('should stringify mixed alignments', () => {
      const table = createTable(
        [
          createHeader('Left', 'left'),
          createHeader('Center', 'center'),
          createHeader('Right', 'right'),
        ],
        [createRow(['A', 'B', 'C'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Left | Center | Right |',
        '| :--- | :----: | ----: |',
        '| A    |   B    |     C |',
      ]);
    });
  });

  describe('omitAnnotations option', () => {
    it('should pass option through to cell content stringification', () => {
      const cell: CellNode = {
        type: 'cell',
        content: [
          {
            type: 'text',
            text: 'Value',
            annotations: { type: 'highlight' },
            range: DEFAULT_RANGE,
          },
        ],
        range: DEFAULT_RANGE,
      };
      const table = createTable(
        [createHeader('Col')],
        [{ type: 'row', children: [cell], range: DEFAULT_RANGE }],
      );

      const result = stringifyTable(table, { omitAnnotations: true });

      expect(result).toEqual(['| Col   |', '| ----- |', '| Value |']);
    });
  });

  describe('column width formatting', () => {
    it('should pad cells to match widest content in each column', () => {
      const table = createTable(
        [createHeader('Name'), createHeader('Age')],
        [createRow(['Alice', '30']), createRow(['Bob', '25'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Name  | Age |',
        '| ----- | --- |',
        '| Alice | 30  |',
        '| Bob   | 25  |',
      ]);
    });

    it('should extend separator dashes to match column width', () => {
      const table = createTable(
        [createHeader('LongHeader')],
        [createRow(['A'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| LongHeader |',
        '| ---------- |',
        '| A          |',
      ]);
    });

    it('should apply left alignment padding correctly', () => {
      const table = createTable(
        [createHeader('Name', 'left')],
        [createRow(['Alice']), createRow(['Bob'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Name  |',
        '| :---- |',
        '| Alice |',
        '| Bob   |',
      ]);
    });

    it('should apply right alignment padding correctly', () => {
      const table = createTable(
        [createHeader('Price', 'right')],
        [createRow(['100']), createRow(['5'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Price |',
        '| ----: |',
        '|   100 |',
        '|     5 |',
      ]);
    });

    it('should apply center alignment padding correctly', () => {
      const table = createTable(
        [createHeader('Status', 'center')],
        [createRow(['OK']), createRow(['Error'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| Status |',
        '| :----: |',
        '|   OK   |',
        '| Error  |',
      ]);
    });

    it('should handle empty cells with proper padding', () => {
      const table = createTable(
        [createHeader('A'), createHeader('B')],
        [createRow(['Value', '']), createRow(['', 'Data'])],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| A     | B    |',
        '| ----- | ---- |',
        '| Value |      |',
        '|       | Data |',
      ]);
    });

    it('should measure visible width excluding formatting markers', () => {
      const boldCell: CellNode = {
        type: 'cell',
        content: [
          {
            type: 'text',
            text: 'Bold',
            formats: ['bold'],
            range: DEFAULT_RANGE,
          },
        ],
        range: DEFAULT_RANGE,
      };
      const table = createTable(
        [createHeader('Header')],
        [
          { type: 'row', children: [boldCell], range: DEFAULT_RANGE },
          createRow(['Normal']),
        ],
      );

      const result = stringifyTable(table);

      // "Bold" has visible width 4, "Normal" has visible width 6, "Header" has visible width 6
      // column width should be 6 (max of all)
      expect(result).toEqual([
        '| Header |',
        '| ------ |',
        '| **Bold** |',
        '| Normal |',
      ]);
    });

    it('should handle data row with fewer cells than headers', () => {
      const incompleteRow: RowNode = {
        type: 'row',
        children: [createCell('Only')],
        range: DEFAULT_RANGE,
      };
      const table = createTable(
        [createHeader('A'), createHeader('B'), createHeader('C')],
        [incompleteRow],
      );

      const result = stringifyTable(table);

      expect(result).toEqual([
        '| A    | B   | C   |',
        '| ---- | --- | --- |',
        '| Only |     |     |',
      ]);
    });

    it('should defensively render an empty header when a header disappears', () => {
      const headers: NonNullable<TableNode['headers']> = [];
      const header = createHeader('Header');
      let reads = 0;
      Object.defineProperty(headers, 0, {
        configurable: true,
        get: () => (reads++ === 0 ? header : undefined),
      });
      const table: TableNode = {
        type: 'table',
        headers,
        children: [createRow(['Value'])],
        range: DEFAULT_RANGE,
      };

      expect(stringifyTable(table)).toEqual([
        '|        |',
        '| ------ |',
        '| Value  |',
      ]);
    });
  });
});
