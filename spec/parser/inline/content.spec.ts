import { describe, expect, it } from 'vitest';

import { parseInlineContent } from '#parser/inline/content';

import { START_RANGE } from '../../fixtures/positions';

// TEST SUITES //

describe('fn:parseInlineContent', () => {
  describe('plain text', () => {
    it('should parse plain text', () => {
      const nodes = parseInlineContent('Hello world', START_RANGE);

      expect(nodes).toEqual([
        expect.objectContaining({ type: 'text', text: 'Hello world' }),
      ]);
    });

    it('should handle empty string', () => {
      const nodes = parseInlineContent('', START_RANGE);

      expect(nodes).toHaveLength(0);
    });

    it('should stop when a string-like value has a sparse character', () => {
      const sparse = {
        length: 1,
        startsWith: () => false,
      } as unknown as string;

      expect(parseInlineContent(sparse)).toEqual([]);
    });
  });

  describe('formatted text', () => {
    it('should parse bold text', () => {
      const nodes = parseInlineContent('**bold**', START_RANGE);

      expect(nodes).toEqual([
        expect.objectContaining({
          type: 'text',
          text: 'bold',
          formats: ['bold'],
        }),
      ]);
    });
  });

  describe('mixed content', () => {
    it('should parse mixed plain and formatted text', () => {
      const nodes = parseInlineContent('Plain **bold** text', START_RANGE);

      expect(nodes.length).toBeGreaterThan(1);
      expect(nodes.some((n) => n.type === 'text' && n.text === 'Plain ')).toBe(
        true,
      );
    });

    it('should parse multiple formatted sections', () => {
      const nodes = parseInlineContent('**bold** and *italic*', START_RANGE);
      const boldNode = nodes.find(
        (n) =>
          n.type === 'text' && 'formats' in n && n.formats?.includes('bold'),
      );
      const italicNode = nodes.find(
        (n) =>
          n.type === 'text' && 'formats' in n && n.formats?.includes('italic'),
      );

      expect(boldNode).toBeDefined();
      expect(italicNode).toBeDefined();
    });

    it('should offset inline positions from the base position', () => {
      const baseRange = {
        start: { line: 2, column: 5, offset: 10 },
        end: { line: 2, column: 5, offset: 10 },
      };
      const nodes = parseInlineContent('Hi **bold**', baseRange);

      expect(nodes).toMatchObject([
        {
          range: {
            start: { line: 2, column: 5, offset: 10 },
            end: { line: 2, column: 8, offset: 13 },
          },
        },
        {
          range: {
            start: { line: 2, column: 8, offset: 13 },
            end: { line: 2, column: 16, offset: 21 },
          },
        },
      ]);
    });
  });

  describe('inline annotations', () => {
    it('should parse inline annotations', () => {
      const nodes = parseInlineContent('[+12%]{{ type: delta }}', START_RANGE);
      const meta = nodes.find((n) => n.type === 'meta');

      expect(meta).toMatchObject({
        type: 'meta',
        caption: [{ type: 'text', text: '+12%' }],
      });
      expect(meta?.caption).toEqual([
        expect.objectContaining({ type: 'text', text: '+12%' }),
      ]);
      expect(meta?.annotations).toEqual({ type: 'delta' });
    });

    it('should parse inline annotation with text before', () => {
      const nodes = parseInlineContent(
        'Value is [+12%]{{ type: delta }}',
        START_RANGE,
      );

      expect(
        nodes.some((n) => n.type === 'text' && n.text.includes('Value is')),
      ).toBe(true);
      expect(nodes.some((n) => n.type === 'meta')).toBe(true);
    });
  });

  describe('links', () => {
    it('should parse markdown links', () => {
      const nodes = parseInlineContent(
        '[text](https://example.com)',
        START_RANGE,
      );
      const link = nodes.find((n) => n.type === 'link');

      expect(link).toMatchObject({
        type: 'link',
        caption: [{ type: 'text', text: 'text' }],
        link: 'https://example.com',
      });
    });

    it('should parse link with annotation', () => {
      const nodes = parseInlineContent(
        '[text](url){{ ref: link1 }}',
        START_RANGE,
      );
      const link = nodes.find((n) => n.type === 'link');

      expect(link?.annotations).toEqual({ ref: 'link1' });
    });
  });

  describe('media', () => {
    it('should parse markdown media', () => {
      const nodes = parseInlineContent(
        '![alt](https://example.com/image.png)',
        START_RANGE,
      );
      const media = nodes.find((n) => n.type === 'media');

      expect(media).toMatchObject({
        type: 'media',
        caption: [{ type: 'text', text: 'alt' }],
        src: 'https://example.com/image.png',
      });
    });

    it('should parse media with annotation', () => {
      const nodes = parseInlineContent(
        '![alt](image.png){{ ref: image1 }}',
        START_RANGE,
      );
      const media = nodes.find((n) => n.type === 'media');

      expect(media?.annotations).toEqual({ ref: 'image1' });
    });
  });
});
