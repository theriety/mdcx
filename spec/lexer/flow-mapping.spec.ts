import { describe, expect, it } from 'vitest';

import { ParseError } from '#errors';
import {
  findFlowMappingEnd,
  MAX_ANNOTATION_BYTES,
  scanFlowMapping,
} from '#lexer/flow-mapping';
import { Scanner } from '#lexer/scanner';

describe('flow mapping scanner', () => {
  describe('nested mapping values', () => {
    it('should find the complete mapping with nested object values', () => {
      const source = '{ style: {color: red, font: {weight: 700}} }';
      const end = findFlowMappingEnd({ source, startIndex: 0 });
      const result = scanFlowMapping({
        scanner: new Scanner(`${source}tail`),
      });

      expect(end).toBe(source.length);
      expect(result).toBe(source);
    });

    it('should find the complete mapping with nested sequence values', () => {
      const source = '{ items: [one, { nested: [two, three] }] }';
      const end = findFlowMappingEnd({ source, startIndex: 0 });
      const result = scanFlowMapping({
        scanner: new Scanner(`${source}tail`),
      });

      expect(end).toBe(source.length);
      expect(result).toBe(source);
    });
  });

  describe('quoted mapping values', () => {
    describe('single-quoted values', () => {
      it('should keep braces and sequence delimiters inside a single-quoted value balanced', () => {
        const source = "{ text: 'has } and ] characters' }";
        const end = findFlowMappingEnd({ source, startIndex: 0 });
        const result = scanFlowMapping({
          scanner: new Scanner(`${source}tail`),
        });

        expect(end).toBe(source.length);
        expect(result).toBe(source);
      });

      it('should keep doubled quotes and braces inside a single-quoted value balanced', () => {
        const source = "{ text: 'it''s still } quoted' }";
        const end = findFlowMappingEnd({ source, startIndex: 0 });
        const result = scanFlowMapping({
          scanner: new Scanner(`${source}tail`),
        });

        expect(end).toBe(source.length);
        expect(result).toBe(source);
      });
    });

    describe('double-quoted values', () => {
      it('should keep braces and sequence delimiters inside a double-quoted value balanced', () => {
        const source = '{ text: "has } and ] characters" }';
        const end = findFlowMappingEnd({ source, startIndex: 0 });
        const result = scanFlowMapping({
          scanner: new Scanner(`${source}tail`),
        });

        expect(end).toBe(source.length);
        expect(result).toBe(source);
      });

      it('should keep escaped quotes and braces inside a double-quoted value balanced', () => {
        const source = '{ text: "an escaped \\" brace } remains quoted" }';
        const end = findFlowMappingEnd({ source, startIndex: 0 });
        const result = scanFlowMapping({
          scanner: new Scanner(`${source}tail`),
        });

        expect(end).toBe(source.length);
        expect(result).toBe(source);
      });
    });
  });

  it('should return null when the mapping is not closed', () => {
    const result = findFlowMappingEnd({
      source: '{ nested: { value: 1 }',
      startIndex: 0,
    });

    expect(result).toBeNull();
  });

  it('should reject a newline before the mapping closes', () => {
    const action = () =>
      findFlowMappingEnd({ source: '{ value:\n  1 }', startIndex: 0 });

    expect(action).toThrow(ParseError);
  });

  it('should accept exactly the byte limit', () => {
    const source = `{${'a'.repeat(MAX_ANNOTATION_BYTES - 2)}}`;
    const result = findFlowMappingEnd({ source, startIndex: 0 });

    expect(result).toBe(source.length);
  });

  it('should reject one byte above the byte limit', () => {
    const source = `{${'a'.repeat(MAX_ANNOTATION_BYTES - 1)}}`;
    const action = () => findFlowMappingEnd({ source, startIndex: 0 });

    expect(action).toThrowError(
      expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
    );
  });

  describe('UTF-8 byte widths', () => {
    it.each([
      ['two-byte code points', 'é', 2],
      ['three-byte code points', '€', 3],
      ['four-byte code points', '😀', 4],
    ])(
      'should accept %s at the exact byte limit',
      (_label, character, width) => {
        const prefix = '{ value: "';
        const suffix = '" }';
        const availableBytes =
          MAX_ANNOTATION_BYTES - prefix.length - suffix.length;
        const repetitions = Math.floor(availableBytes / width);
        const padding = 'a'.repeat(availableBytes % width);
        const source = `${prefix}${character.repeat(repetitions)}${padding}${suffix}`;

        expect(new TextEncoder().encode(source)).toHaveLength(
          MAX_ANNOTATION_BYTES,
        );
        expect(findFlowMappingEnd({ source, startIndex: 0 })).toBe(
          source.length,
        );
      },
    );

    it.each([
      ['two-byte code points', 'é', 2],
      ['three-byte code points', '€', 3],
      ['four-byte code points', '😀', 4],
    ])(
      'should reject %s one byte above the limit',
      (_label, character, width) => {
        const prefix = '{ value: "';
        const suffix = '" }';
        const availableBytes =
          MAX_ANNOTATION_BYTES - prefix.length - suffix.length;
        const repetitions = Math.floor(availableBytes / width);
        const padding = 'a'.repeat((availableBytes % width) + 1);
        const source = `${prefix}${character.repeat(repetitions)}${padding}${suffix}`;

        expect(new TextEncoder().encode(source)).toHaveLength(
          MAX_ANNOTATION_BYTES + 1,
        );
        expect(() =>
          findFlowMappingEnd({ source, startIndex: 0 }),
        ).toThrowError(
          expect.objectContaining({ code: 'MDCX_ANNOTATION_INVALID' }),
        );
      },
    );
  });

  it('should reject an unmatched sequence delimiter', () => {
    const action = () =>
      findFlowMappingEnd({ source: '{ value: ] }', startIndex: 0 });

    expect(action).toThrow(/unmatched closing delimiter/);
  });
});
