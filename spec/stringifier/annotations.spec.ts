import { describe, expect, it } from 'vitest';

import { stringifyAnnotations } from '#stringifier/annotations';

// TEST SUITES //

describe('fn:stringifyAnnotations', () => {
  describe('empty annotations', () => {
    it('should return empty string for undefined annotations', () => {
      const result = stringifyAnnotations(undefined);

      expect(result).toBe('');
    });

    it('should return empty string for empty annotations object', () => {
      const result = stringifyAnnotations({});

      expect(result).toBe('');
    });

    it('should return empty string when only native block type is present', () => {
      const result = stringifyAnnotations({ type: 'paragraph' });

      expect(result).toBe('');
    });
  });

  describe('basic annotations', () => {
    it('should stringify simple key-value annotation', () => {
      const result = stringifyAnnotations({ ref: 'intro' });

      expect(result).toBe('{{ ref: intro }}');
    });

    it('should stringify multiple annotations', () => {
      const result = stringifyAnnotations({ ref: 'link1', verified: true });

      expect(result).toBe('{{ ref: link1, verified: true }}');
    });

    it('should include non-native type in output', () => {
      const result = stringifyAnnotations({ type: 'callout' });

      expect(result).toBe('{{ type: callout }}');
    });

    it('should include custom type with other annotations', () => {
      const result = stringifyAnnotations({
        type: 'delta',
        color: 'green',
      });

      expect(result).toBe('{{ type: delta, color: green }}');
    });

    it('should order top-level type, ref, and title before alphabetical fields', () => {
      const result = stringifyAnnotations({
        icon: '📚',
        color: 'gray_background',
        title: 'Welcome',
        ref: 'block-123',
        type: 'callout',
      });

      expect(result).toBe(
        '{{ type: callout, ref: block-123, title: Welcome, color: gray_background, icon: 📚 }}',
      );
    });

    it('should stringify equivalent annotations identically regardless of insertion order', () => {
      const first = stringifyAnnotations({
        type: 'callout',
        ref: 'block-123',
        title: 'Welcome',
        icon: '📚',
        color: 'gray_background',
      });
      const second = stringifyAnnotations({
        icon: '📚',
        color: 'gray_background',
        title: 'Welcome',
        ref: 'block-123',
        type: 'callout',
      });

      expect(second).toBe(first);
      expect(first).toBe(
        '{{ type: callout, ref: block-123, title: Welcome, color: gray_background, icon: 📚 }}',
      );
    });

    it('should order type, ref, and title before remaining alphabetical fields', () => {
      const result = stringifyAnnotations({
        b: 1,
        title: 't',
        a: 2,
        ref: 'r',
        type: 'p',
      });

      expect(result).toBe('{{ type: p, ref: r, title: t, a: 2, b: 1 }}');
    });

    it('should order ref before other top-level fields when type is absent', () => {
      const result = stringifyAnnotations({
        zeta: 'last',
        alpha: 'first',
        ref: 'block-123',
      });

      expect(result).toBe('{{ ref: block-123, alpha: first, zeta: last }}');
    });

    it('should sort nested object fields alphabetically without special type or ref handling', () => {
      const result = stringifyAnnotations({
        type: 'meta',
        ref: 'block-123',
        details: {
          type: 'nested',
          zeta: 'last',
          ref: 'nested-ref',
          alpha: 'first',
        },
      });

      expect(result).toBe(
        '{{ type: meta, ref: block-123, details: { alpha: first, ref: nested-ref, type: nested, zeta: last } }}',
      );
    });

    it('should preserve array order while sorting object items recursively', () => {
      const result = stringifyAnnotations({
        type: 'meta',
        ref: 'block-123',
        items: [
          { type: 'first', zeta: 'last', alpha: 'first' },
          { type: 'second', beta: 'second', alpha: 'first' },
        ],
      });

      expect(result).toBe(
        '{{ type: meta, ref: block-123, items: [ { alpha: first, type: first, zeta: last }, { alpha: first, beta: second, type: second } ] }}',
      );
    });
  });

  describe('excludes option', () => {
    it('should exclude specified properties', () => {
      const result = stringifyAnnotations(
        { ref: 'test', depth: 2, language: 'ts' },
        { excludes: ['depth', 'language'] },
      );

      expect(result).toBe('{{ ref: test }}');
    });

    it('should return empty string if all properties excluded', () => {
      const result = stringifyAnnotations(
        { depth: 2 },
        { excludes: ['depth'] },
      );

      expect(result).toBe('');
    });
  });

  describe('native type filtering', () => {
    it('should filter out heading type', () => {
      const result = stringifyAnnotations({ type: 'heading', depth: 2 });

      expect(result).toBe('{{ depth: 2 }}');
    });

    it('should filter out bullet type', () => {
      const result = stringifyAnnotations({ type: 'bullet', ref: 'item' });

      expect(result).toBe('{{ ref: item }}');
    });

    it('should filter out table type', () => {
      const result = stringifyAnnotations({ type: 'table' });

      expect(result).toBe('');
    });
  });

  describe('special characters', () => {
    it('should handle string values with special characters', () => {
      const result = stringifyAnnotations({ url: 'https://example.com/path' });

      // YAML PLAIN style doesn't require quotes for URLs
      expect(result).toBe('{{ url: https://example.com/path }}');
    });

    it('should quote a #-prefixed ref so it survives YAML re-parsing', () => {
      // a virtual ref minted by notion-sync (#<column_list_id>.<n>) starts with
      // `#`, a YAML reserved indicator. emitting it unquoted produces invalid
      // YAML (the `#` begins a comment that swallows the closing brace), so it
      // must be double-quoted to round-trip.
      const result = stringifyAnnotations({
        type: 'column',
        ref: '#4fc370fe-e485-400b-88d8-7f0d224648d7.1',
        ratio: 1,
      });

      expect(result).toBe(
        '{{ type: column, ref: "#4fc370fe-e485-400b-88d8-7f0d224648d7.1", ratio: 1 }}',
      );
    });

    it('should leave plain ref values unquoted', () => {
      const result = stringifyAnnotations({ ref: 'col1' });

      expect(result).toBe('{{ ref: col1 }}');
    });

    it('should handle newlines in values', () => {
      const result = stringifyAnnotations({ note: 'line1\nline2' });

      expect(result).toBe('{{ note: "line1\\nline2" }}');
      expect(result).not.toContain('\n');
    });
  });
});
