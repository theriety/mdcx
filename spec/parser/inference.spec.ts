import { describe, expect, it } from 'vitest';

import { inferBlockMeta } from '#parser/inference';

// TEST SUITES //

describe('fn:inferBlockType', () => {
  describe('headings', () => {
    it('should infer h1 heading from # prefix', () => {
      const result = inferBlockMeta('# Title');

      expect(result).toMatchObject({
        type: 'heading',
        annotations: { depth: 1 },
      });
    });
  });

  describe('list items', () => {
    it('should infer unordered list from - prefix', () => {
      const result = inferBlockMeta('- Item');

      expect(result).toMatchObject({
        type: 'bullet',
        annotations: {},
      });
    });

    it('should infer ordered list from number prefix', () => {
      const result = inferBlockMeta('1. First');

      expect(result).toMatchObject({
        type: 'enum',
        annotations: {},
      });
    });
  });

  describe('todos', () => {
    it('should infer unchecked todo from - [ ] prefix', () => {
      const result = inferBlockMeta('- [ ] Unchecked');

      expect(result).toMatchObject({
        type: 'todo',
        annotations: { checked: false },
      });
    });

    it('should infer checked todo from - [x] prefix (lowercase)', () => {
      const result = inferBlockMeta('- [x] Checked');

      expect(result).toMatchObject({
        type: 'todo',
        annotations: { checked: true },
      });
    });
  });

  describe('quotes', () => {
    it('should infer quote from > prefix', () => {
      const result = inferBlockMeta('> Quote text');

      expect(result.type).toBe('quote');
    });
  });

  describe('tables and layouts', () => {
    it('should infer table from separator line', () => {
      const result = inferBlockMeta(['|A|B|', '|---|---|'].join('\n'));

      expect(result.type).toBe('table');
    });

    it('should infer table from separator line with alignment', () => {
      const result = inferBlockMeta(
        ['|A|B|C|', '|:---|:---:|---:|'].join('\n'),
      );

      expect(result.type).toBe('table');
    });

    it('should infer table from separator line with spaces', () => {
      const result = inferBlockMeta(
        ['| A | B | C |', '| :--- | :---: | ---: |'].join('\n'),
      );

      expect(result.type).toBe('table');
    });

    it('should infer table from pipe content without separator when no type annotation', () => {
      const result = inferBlockMeta('| A | B |\n| C | D |');

      expect(result.type).toBe('table');
    });
  });

  describe('dividers', () => {
    it('should infer divider from three hyphens', () => {
      const result = inferBlockMeta('---');

      expect(result).toMatchObject({
        type: 'divider',
        annotations: {},
      });
    });

    it('should infer divider from four hyphens', () => {
      const result = inferBlockMeta('----');

      expect(result.type).toBe('divider');
    });

    it('should infer divider from five hyphens', () => {
      const result = inferBlockMeta('-----');

      expect(result.type).toBe('divider');
    });

    it('should not infer divider from two hyphens', () => {
      const result = inferBlockMeta('--');

      expect(result.type).toBe('paragraph');
    });

    it('should not infer divider when hyphens have trailing content', () => {
      const result = inferBlockMeta('--- text');

      expect(result.type).toBe('paragraph');
    });
  });

  describe('equations', () => {
    it('should infer equation from double dollar signs', () => {
      const result = inferBlockMeta('$$ E = mc^2 $$');

      expect(result).toMatchObject({
        type: 'equation',
        annotations: {},
      });
    });

    it('should infer equation with LaTeX content', () => {
      const result = inferBlockMeta('$$ x = \\frac{-b}{2a} $$');

      expect(result.type).toBe('equation');
    });

    it('should not infer equation without closing delimiter', () => {
      const unclosedEquation = '$$ E = mc^2';

      const result = inferBlockMeta(unclosedEquation);

      expect(result.type).toBe('paragraph');
    });

    it('should not infer equation without opening delimiter', () => {
      const equationWithoutOpeningDelimiter = 'E = mc^2 $$';

      const result = inferBlockMeta(equationWithoutOpeningDelimiter);

      expect(result.type).toBe('paragraph');
    });

    it('should not infer equation with single dollar signs', () => {
      const singleDollarEquation = '$ E = mc^2 $';

      const result = inferBlockMeta(singleDollarEquation);

      expect(result.type).toBe('paragraph');
    });
  });

  describe('paragraphs', () => {
    it('should default to paragraph for plain text', () => {
      const result = inferBlockMeta('Plain text');

      expect(result.type).toBe('paragraph');
    });
  });

  describe('contentStart offset', () => {
    it('should return correct contentStart for todo', () => {
      const result = inferBlockMeta('- [ ] Task');

      expect(result.contentStart).toBe(6);
    });
  });
});
