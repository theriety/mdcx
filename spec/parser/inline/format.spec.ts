import { describe, expect, it } from 'vitest';

import { parseFormattedText } from '#parser/inline/format';

// TEST SUITES //

describe('fn:parseFormattedText', () => {
  describe('bold', () => {
    it('should parse bold text', () => {
      const result = parseFormattedText({ content: '**bold**', startIndex: 0 });

      expect(result!.node).toMatchObject({ text: 'bold', formats: ['bold'] });
    });

    it('should return correct nextIndex for bold', () => {
      const result = parseFormattedText({ content: '**bold**', startIndex: 0 });

      expect(result!.nextIndex).toBe(8);
    });
  });

  describe('nested formats', () => {
    it('should unwrap bold wrapping code into ordered formats', () => {
      const result = parseFormattedText({
        content: '**`control`**',
        startIndex: 0,
      });

      expect(result!.node).toMatchObject({
        text: 'control',
        formats: ['bold', 'code'],
      });
    });

    it('should unwrap code wrapping bold into ordered formats', () => {
      const result = parseFormattedText({
        content: '`**control**`',
        startIndex: 0,
      });

      expect(result!.node).toMatchObject({
        text: 'control',
        formats: ['code', 'bold'],
      });
    });

    it('should return nextIndex spanning the full outer delimiter', () => {
      const result = parseFormattedText({
        content: '**`control`**',
        startIndex: 0,
      });

      expect(result!.nextIndex).toBe('**`control`**'.length);
    });

    it('should keep inner markup literal when not a single nested span', () => {
      const result = parseFormattedText({
        content: '**a `b` c**',
        startIndex: 0,
      });

      expect(result!.node).toMatchObject({
        text: 'a `b` c',
        formats: ['bold'],
      });
    });

    it('should unwrap three levels of nesting', () => {
      const result = parseFormattedText({
        content: '**__`x`__**',
        startIndex: 0,
      });

      expect(result!.node).toMatchObject({
        text: 'x',
        formats: ['bold', 'underline', 'code'],
      });
    });
  });

  describe('edge cases', () => {
    it('should return null for unsupported formatted text', () => {
      const results = [
        parseFormattedText({ content: 'plain', startIndex: 0 }),
        parseFormattedText({ content: '**unclosed', startIndex: 0 }),
        parseFormattedText({ content: '****', startIndex: 0 }),
        parseFormattedText({ content: '**bold\ntext**', startIndex: 0 }),
      ];

      expect(results).toEqual([null, null, null, null]);
    });

    it('should return null when endIndexLimit cuts off closing delimiter', () => {
      const content = '**bold** more';
      const endIndexLimit = 6;

      const result = parseFormattedText({
        content,
        startIndex: 0,
        endIndexLimit,
      });

      expect(result).toBeNull();
    });
  });
});
