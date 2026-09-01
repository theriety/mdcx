import { describe, expect, it } from 'vitest';

import { stringifyDirectives } from '#stringifier/directive';

import type { DocumentNode } from '#types';

// HELPERS //

function createDocument(
  overrides?: Partial<Pick<DocumentNode, 'ref' | 'annotations'>>,
): DocumentNode {
  return {
    type: 'document',
    children: [],
    ...overrides,
  };
}

// TEST SUITES //

describe('fn:stringifyDirectives', () => {
  describe('empty directives', () => {
    it('should return empty array for document without ref or annotations', () => {
      const ast = createDocument();

      const result = stringifyDirectives(ast);

      expect(result).toEqual([]);
    });

    it('should return empty array for document with empty annotations', () => {
      const ast = createDocument({ annotations: {} });

      const result = stringifyDirectives(ast);

      expect(result).toEqual([]);
    });
  });

  describe('ref only', () => {
    it('should output YAML frontmatter with ref', () => {
      const ast = createDocument({ ref: 'doc-123' });

      const result = stringifyDirectives(ast);

      expect(result).toEqual(['---', 'ref: doc-123', '---', '']);
    });
  });

  describe('annotations only', () => {
    it('should output YAML frontmatter with single annotation', () => {
      const ast = createDocument({ annotations: { type: 'doc' } });

      const result = stringifyDirectives(ast);

      expect(result).toEqual(['---', 'type: doc', '---', '']);
    });

    it('should output YAML frontmatter with multiple annotations', () => {
      const ast = createDocument({
        annotations: { owner: 'platform', type: 'doc' },
      });

      const result = stringifyDirectives(ast);

      expect(result).toEqual([
        '---',
        ['type: doc', 'owner: platform'].join('\n'),
        '---',
        '',
      ]);
    });

    it('should order top-level type and ref before alphabetical fields and sort nested objects alphabetically', () => {
      const ast = createDocument({
        annotations: {
          owner: 'platform',
          ref: 'annotation-ref',
          type: 'doc',
          details: {
            type: 'nested',
            zeta: 'last',
            ref: 'nested-ref',
            alpha: 'first',
          },
        },
      });

      const result = stringifyDirectives(ast);

      expect(result).toEqual([
        '---',
        [
          'type: doc',
          'ref: annotation-ref',
          'details:',
          '  alpha: first',
          '  ref: nested-ref',
          '  type: nested',
          '  zeta: last',
          'owner: platform',
        ].join('\n'),
        '---',
        '',
      ]);
    });
  });

  describe('ref and annotations', () => {
    it('should combine ref with annotations in frontmatter', () => {
      const ast = createDocument({
        ref: 'main-doc',
        annotations: { type: 'spec' },
      });

      const result = stringifyDirectives(ast);
      const yamlContent = result.join('\n');

      expect(result[0]).toBe('---');
      expect(yamlContent).toContain('type: spec');
      expect(yamlContent).toContain('ref: main-doc');
      expect(result[result.length - 2]).toBe('---');
      expect(result[result.length - 1]).toBe('');
    });

    it('should prefer document ref over annotation ref', () => {
      const ast = createDocument({
        ref: 'doc-ref',
        annotations: { ref: 'annotation-ref', type: 'doc' },
      });

      const result = stringifyDirectives(ast);
      const yamlContent = result.join('\n');

      expect(result[0]).toBe('---');
      expect(yamlContent).toContain('type: doc');
      expect(yamlContent).toContain('ref: doc-ref');
      expect(yamlContent).not.toContain('ref: annotation-ref');
      expect(result[result.length - 2]).toBe('---');
      expect(result[result.length - 1]).toBe('');
    });

    it('should use annotation ref when document ref is undefined', () => {
      const ast = createDocument({
        annotations: { ref: 'annotation-ref', type: 'doc' },
      });

      const result = stringifyDirectives(ast);
      const yamlContent = result.join('\n');

      expect(result[0]).toBe('---');
      expect(yamlContent).toContain('ref: annotation-ref');
      expect(yamlContent).toContain('type: doc');
      expect(result[result.length - 2]).toBe('---');
      expect(result[result.length - 1]).toBe('');
    });
  });
});
