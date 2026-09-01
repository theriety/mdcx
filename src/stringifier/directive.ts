import { stringify as stringifyYaml } from 'yaml';

import { canonicalizeAnnotationObject } from '#parser/annotation-profile';

import type { DocumentNode } from '#types';

// FUNCTIONS //

/**
 * stringifies document frontmatter/directives to YAML format
 * @param ast the DocumentNode containing directive data
 * @returns array of lines representing the directive block
 */
export function stringifyDirectives(ast: DocumentNode): string[] {
  return ast.ref || (ast.annotations && Object.keys(ast.annotations).length)
    ? [
        '---',
        stringifyYaml(
          canonicalizeAnnotationObject({
            ...ast.annotations,
            ref: ast.ref ?? ast.annotations?.ref,
          }),
          { collectionStyle: 'block' },
        ).trim(),
        '---',
        '',
      ]
    : [];
}
