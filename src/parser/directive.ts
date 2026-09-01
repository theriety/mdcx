import { isMap, parseDocument } from 'yaml';

import { ParseError } from '#errors';

import {
  assertAnnotationNamedStrings,
  validateAnnotationValue,
} from './annotation-profile-runtime';
import {
  annotationPosition,
  validateAnnotationNode,
} from './annotation-profile-validation';

import type { Token } from '#lexer/types';
import type { Annotations } from '#types';

import type { AnnotationContext } from './annotation-profile';

/** maximum UTF-8 size accepted for one front-matter mapping */
const MAX_FRONT_MATTER_BYTES = 65_536;

const FRONT_MATTER_SYNTAX = {
  allowBlockCollections: true,
  allowComments: true,
  allowMultilineScalars: true,
} as const;

interface ScanDirectiveParams {
  content: string;
  context: AnnotationContext;
}

/**
 * parses a bounded YAML directive from a token stream
 * @param tokens tokens between the directive delimiters
 * @returns validated document annotations
 */
export function parseDirective(tokens: Token[]): Annotations {
  const position = tokens[0]?.range.start;
  const context = { name: 'Front matter', position };
  const content = extractDirectiveContent(tokens);

  if (!content.trim()) {
    return {};
  }

  return scanDirective({ content, context });
}

/**
 * scans and validates one YAML directive document
 * @param params directive content and annotation context
 * @param params.content bounded YAML content
 * @param params.context source context for diagnostics
 * @returns validated document annotations
 */
function scanDirective(params: ScanDirectiveParams): Annotations {
  const { content, context } = params;
  const document = parseDocument(content, {
    version: '1.2',
    schema: 'core',
    merge: false,
    uniqueKeys: true,
    stringKeys: true,
    strict: true,
    keepSourceTokens: true,
  });
  const yamlIssue = document.errors.at(0) ?? document.warnings.at(0);
  if (yamlIssue) {
    const linePosition = yamlIssue.linePos?.[0];
    throw new ParseError(
      'MDC_ANNOTATION_INVALID',
      `Invalid front matter YAML: ${yamlIssue.message.replace(/ at line \d+, column \d+/, '')}`,
      annotationPosition({
        context,
        line: linePosition?.line,
        column: linePosition?.col,
        offset: yamlIssue.pos[0],
      }),
    );
  }
  validateAnnotationNode({
    node: document.contents,
    depth: 1,
    context,
    syntax: FRONT_MATTER_SYNTAX,
  });
  if (!isMap(document.contents)) {
    return {};
  }
  const annotations = document.toJS({ maxAliasCount: 0 }) as Annotations;
  validateAnnotationValue({
    value: annotations,
    context,
    seen: new WeakSet(),
  });
  assertAnnotationNamedStrings(annotations, context);

  return annotations;
}

/**
 * extracts bounded raw YAML content from directive tokens
 * @param tokens tokens from the directive section
 * @returns concatenated directive content
 */
export function extractDirectiveContent(tokens: Token[]): string {
  const values: string[] = [];
  let characterCount = 0;
  for (const token of tokens) {
    if (
      token.type !== 'ANNOTATION' &&
      token.type !== 'CONTENT' &&
      token.type !== 'NEWLINE'
    ) {
      continue;
    }
    characterCount += token.value.length;
    if (characterCount > MAX_FRONT_MATTER_BYTES) {
      throwFrontMatterSizeError(token);
    }
    values.push(token.value);
  }
  const content = values.join('');
  if (new TextEncoder().encode(content).byteLength > MAX_FRONT_MATTER_BYTES) {
    throwFrontMatterSizeError(tokens[0]);
  }

  return content;
}

/**
 * throws the stable error for oversized front matter
 * @param token token providing the source position for the error
 */
function throwFrontMatterSizeError(token?: Token): never {
  throw new ParseError(
    'MDC_ANNOTATION_INVALID',
    `Front matter exceeds the ${MAX_FRONT_MATTER_BYTES}-byte limit.`,
    token?.range.start,
  );
}
