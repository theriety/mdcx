import { describe, expect, it } from 'vitest';

import {
  stringifyInlineContent,
  stringifyInlineNode,
} from '#stringifier/inline';

import {
  createLinkNode,
  createMediaNode,
  createTextNode,
} from '../fixtures/inline';

import type { InlineNode } from '#types';

// TEST SUITES //

describe('fn:stringifyInlineNode', () => {
  describe('plain text', () => {
    it('should stringify plain text node', () => {
      const node = createTextNode('Hello world');

      const result = stringifyInlineNode(node);

      expect(result).toBe('Hello world');
    });

    it('should stringify text with annotation', () => {
      const node = createTextNode('Important', {
        annotations: { type: 'highlight' },
      });

      const result = stringifyInlineNode(node);

      expect(result).toBe('[Important]{{ type: highlight }}');
    });
  });

  describe('formatting', () => {
    it('should stringify bold text', () => {
      const node = createTextNode('bold', { formats: ['bold'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('**bold**');
    });

    it('should stringify italic text', () => {
      const node = createTextNode('italic', { formats: ['italic'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('*italic*');
    });

    it('should stringify strikethrough text', () => {
      const node = createTextNode('deleted', { formats: ['strikethrough'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('~~deleted~~');
    });

    it('should stringify inline code', () => {
      const node = createTextNode('code', { formats: ['code'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('`code`');
    });

    it('should stringify underline text', () => {
      const node = createTextNode('underlined', { formats: ['underline'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('__underlined__');
    });

    it('should apply multiple formats in order', () => {
      const node = createTextNode('text', { formats: ['bold', 'italic'] });

      const result = stringifyInlineNode(node);

      expect(result).toBe('***text***');
    });

    it('should pass through unknown format types unchanged', () => {
      const node = createTextNode('text', {
        formats: ['unknown_format' as 'bold'],
      });

      const result = stringifyInlineNode(node);

      expect(result).toBe('text');
    });
  });

  describe('links', () => {
    it('should stringify link node', () => {
      const node = createLinkNode('text', 'https://example.com');

      const result = stringifyInlineNode(node);

      expect(result).toBe('[text](https://example.com)');
    });

    it('should stringify link with annotation', () => {
      const node = createLinkNode('docs', 'https://example.com/docs', {
        annotations: { ref: 'link1' },
      });

      const result = stringifyInlineNode(node);

      expect(result).toBe('[docs](https://example.com/docs){{ ref: link1 }}');
    });

    it('should stringify link with formatting', () => {
      const node = createLinkNode('bold link', 'https://example.com', {
        caption: [createTextNode('bold link', { formats: ['bold'] })],
      });

      const result = stringifyInlineNode(node);

      expect(result).toBe('[**bold link**](https://example.com)');
    });

    it('should stringify link with empty href', () => {
      const node = createLinkNode('broken', '');

      const result = stringifyInlineNode(node);

      expect(result).toBe('[broken]()');
    });
  });

  describe('media', () => {
    it('should stringify media node', () => {
      const node = createMediaNode('alt text', 'https://example.com/image.png');

      const result = stringifyInlineNode(node);

      expect(result).toBe('![alt text](https://example.com/image.png)');
    });

    it('should stringify media with annotation', () => {
      const node = createMediaNode('photo', 'https://example.com/photo.jpg', {
        annotations: { width: 800 },
      });

      const result = stringifyInlineNode(node);

      expect(result).toBe(
        '![photo](https://example.com/photo.jpg){{ width: 800 }}',
      );
    });
  });

  describe('omitAnnotations option', () => {
    it('should omit annotation from text node when flag is set', () => {
      const node = createTextNode('+12%', {
        annotations: { type: 'delta' },
      });

      const result = stringifyInlineNode(node, { omitAnnotations: true });

      expect(result).toBe('+12%');
    });

    it('should omit annotation from link node when flag is set', () => {
      const node = createLinkNode('text', 'https://example.com', {
        annotations: { ref: 'link1' },
      });

      const result = stringifyInlineNode(node, { omitAnnotations: true });

      expect(result).toBe('[text](https://example.com)');
    });
  });
});

describe('fn:stringifyInlineContent', () => {
  it('should return empty string for undefined content', () => {
    const result = stringifyInlineContent(undefined);

    expect(result).toBe('');
  });

  it('should stringify empty content array', () => {
    const content: InlineNode[] = [];

    const result = stringifyInlineContent(content);

    expect(result).toBe('');
  });

  it('should stringify single node', () => {
    const content: InlineNode[] = [createTextNode('Hello')];

    const result = stringifyInlineContent(content);

    expect(result).toBe('Hello');
  });

  it('should concatenate multiple nodes', () => {
    const content: InlineNode[] = [
      createTextNode('Hello '),
      createTextNode('world', { formats: ['bold'] }),
      createTextNode('!'),
    ];

    const result = stringifyInlineContent(content);

    expect(result).toBe('Hello **world**!');
  });

  it('should handle mixed node types', () => {
    const content: InlineNode[] = [
      createTextNode('Check out '),
      createLinkNode('this link', 'https://example.com'),
      createTextNode(' and '),
      createMediaNode('image', 'https://example.com/img.png'),
    ];

    const result = stringifyInlineContent(content);

    expect(result).toBe(
      'Check out [this link](https://example.com) and ![image](https://example.com/img.png)',
    );
  });

  it('should apply omitAnnotations to all nodes', () => {
    const content: InlineNode[] = [
      createTextNode('Value: ', {}),
      createTextNode('+10%', { annotations: { type: 'delta' } }),
    ];

    const result = stringifyInlineContent(content, { omitAnnotations: true });

    expect(result).toBe('Value: +10%');
  });
});
