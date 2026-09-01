import { describe, expect, it } from 'vitest';

import { indent, measureVisibleWidth, padCell } from '#stringifier/utilities';

import { createLinkNode, createTextNode } from '../fixtures/inline';

import type { InlineNode } from '#types';

// TEST SUITES //

describe('fn:indent', () => {
  it('should indent non-blank line by two spaces', () => {
    const line = 'some content';

    const result = indent(line);

    expect(result).toBe('  some content');
  });

  it('should return empty string for blank line', () => {
    const line = '';

    const result = indent(line);

    expect(result).toBe('');
  });
});

describe('fn:measureVisibleWidth', () => {
  it('should return zero for empty content', () => {
    const content: InlineNode[] = [];

    const result = measureVisibleWidth(content);

    expect(result).toBe(0);
  });

  it('should return sum of text lengths for multiple nodes', () => {
    const content = [createTextNode('Hello'), createTextNode(' World')];

    const result = measureVisibleWidth(content);

    expect(result).toBe(11);
  });

  it('should use caption text for non-text nodes', () => {
    const link = createLinkNode('bold', 'https://example.com', {
      caption: [createTextNode('bold', { formats: ['bold'] })],
    });

    const result = measureVisibleWidth([link]);

    expect(result).toBe(4);
  });
});

describe('fn:padCell', () => {
  it('should return content unchanged when width is less than or equal to content length', () => {
    const content = 'test';

    const result = padCell(content, 3);

    expect(result).toBe('test');
  });

  describe('left alignment', () => {
    it('should pad content on the right', () => {
      const content = 'test';

      const result = padCell(content, 8, 'left');

      expect(result).toBe('test    ');
    });
  });

  describe('right alignment', () => {
    it('should pad content on the left', () => {
      const content = 'test';

      const result = padCell(content, 8, 'right');

      expect(result).toBe('    test');
    });
  });

  describe('center alignment', () => {
    it('should pad content on both sides', () => {
      const content = 'test';

      const result = padCell(content, 8, 'center');

      expect(result).toBe('  test  ');
    });
  });

  it('should handle odd padding for center alignment', () => {
    const content = 'test';

    const result = padCell(content, 9, 'center');

    // padding = 5, leftPad = 2, rightPad = 3
    expect(result).toBe('  test   ');
  });
});
