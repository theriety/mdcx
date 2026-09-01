import { describe, expect, it, vi } from 'vitest';
import { Alias, Document, Pair, Scalar, YAMLMap } from 'yaml';

import { ParseError } from '#errors';
import { MAX_ANNOTATION_BYTES } from '#lexer/flow-mapping';
import {
  canonicalizeAnnotationObject,
  MAX_ANNOTATION_DEPTH,
  parseAnnotationMapping,
  stringifyAnnotationMapping,
} from '#parser/annotation-profile';
import { validateAnnotationValue } from '#parser/annotation-profile-runtime';
import {
  validateAnnotationNode,
  annotationPosition,
} from '#parser/annotation-profile-validation';

import type { JsonObject } from 'type-fest';
import type { Node } from 'yaml';

import type { Annotations } from '#types';

function nestedMapping(depth: number): string {
  let mapping = '{ value: true }';
  for (let level = 1; level < depth; level++) {
    mapping = `{ nested: ${mapping} }`;
  }

  return mapping;
}

function nestedObject(depth: number): Annotations {
  let value: JsonObject = { value: true };
  for (let level = 1; level < depth; level++) {
    value = { nested: value };
  }

  return value as Annotations;
}

describe('MDC Annotation Profile', () => {
  it('should accept an empty flow mapping', () => {
    expect(parseAnnotationMapping({ source: '{}' })).toEqual({});
  });

  it('should accept YAML 1.2 Core scalars and JSON-compatible nesting', () => {
    expect(
      parseAnnotationMapping({
        source:
          '{ text: hello, number: 1.5, truth: true, empty: null, nested: { z: 2, a: [false, value] } }',
      }),
    ).toEqual({
      text: 'hello',
      number: 1.5,
      truth: true,
      empty: null,
      nested: { z: 2, a: [false, 'value'] },
    });
  });

  it('should use YAML 1.2 rather than YAML 1.1 boolean resolution', () => {
    expect(parseAnnotationMapping({ source: '{ value: yes }' })).toEqual({
      value: 'yes',
    });
  });

  it.each(['null', '[1, 2, 3]', 'hello'])(
    'rejects the non-mapping root %s',
    (source) => {
      expect(() => parseAnnotationMapping({ source })).toThrow(ParseError);
    },
  );

  it.each([
    '{ a: 1, a: 2 }',
    '{ 1: value }',
    '{ value: !!str hello }',
    '{ value: &anchor hello }',
    '{ source: &anchor hello, value: *anchor }',
    '{ defaults: &defaults { a: 1 }, <<: *defaults }',
    '{ value: .nan }',
    '{ value: .inf }',
    '{ value: 1 # comment }',
    '{ value:\n  1 }',
  ])('rejects forbidden YAML/profile input %s', (source) => {
    expect(() => parseAnnotationMapping({ source })).toThrow(ParseError);
  });

  it('should reject unsafe unquoted integers', () => {
    expect(() =>
      parseAnnotationMapping({ source: '{ value: 9007199254740993 }' }),
    ).toThrow(/quote it to preserve it as a string/);
  });

  it('should accept an unsafe integer when quoted as a string', () => {
    expect(
      parseAnnotationMapping({ source: '{ value: "9007199254740993" }' }),
    ).toEqual({
      value: '9007199254740993',
    });
  });

  it.each(['{ ref: "" }', '{ ref: 42 }', '{ type: null }'])(
    'requires type and ref to be non-empty strings: %s',
    (source) => {
      expect(() => parseAnnotationMapping({ source })).toThrowError(
        expect.objectContaining({ code: 'MDC_ANNOTATION_PROFILE_VIOLATION' }),
      );
    },
  );

  it('should accept collection depth 16', () => {
    expect(() =>
      parseAnnotationMapping({ source: nestedMapping(MAX_ANNOTATION_DEPTH) }),
    ).not.toThrow();
  });

  it('should reject collection depth 17', () => {
    expect(() =>
      parseAnnotationMapping({
        source: nestedMapping(MAX_ANNOTATION_DEPTH + 1),
      }),
    ).toThrow(/depth exceeds/);
  });

  it('should enforce the same collection depth limit during serialization', () => {
    expect(() =>
      stringifyAnnotationMapping(nestedObject(MAX_ANNOTATION_DEPTH)),
    ).not.toThrow();
    expect(() =>
      stringifyAnnotationMapping(nestedObject(MAX_ANNOTATION_DEPTH + 1)),
    ).toThrow(/depth exceeds/);
  });

  it('should accept a mapping exactly 16,384 UTF-8 bytes', () => {
    const prefix = '{ value: "';
    const suffix = '" }';
    const source = `${prefix}${'a'.repeat(MAX_ANNOTATION_BYTES - prefix.length - suffix.length)}${suffix}`;

    expect(parseAnnotationMapping({ source }).value).toHaveLength(
      MAX_ANNOTATION_BYTES - prefix.length - suffix.length,
    );
  });

  it('should reject a mapping of 16,385 UTF-8 bytes', () => {
    const prefix = '{ value: "';
    const suffix = '" }';
    const source = `${prefix}${'a'.repeat(MAX_ANNOTATION_BYTES + 1 - prefix.length - suffix.length)}${suffix}`;

    expect(() => parseAnnotationMapping({ source })).toThrow(/16,384-byte/);
  });

  it('should serialize deterministic top-level and nested key order', () => {
    expect(
      stringifyAnnotationMapping({
        zeta: true,
        title: 'Title',
        details: { zeta: 1, alpha: 2 },
        ref: 'block',
        type: 'callout',
      }),
    ).toBe(
      '{ type: callout, ref: block, title: Title, details: { alpha: 2, zeta: 1 }, zeta: true }',
    );
  });

  it('should serialize escaped scalar content on one line', () => {
    const source = stringifyAnnotationMapping({
      ref: 'section with } character',
      note: 'line one\nline two',
    });

    expect(source).not.toContain('\n');
    expect(parseAnnotationMapping({ source })).toEqual({
      ref: 'section with } character',
      note: 'line one\nline two',
    });
  });

  it.each([
    [new Date(), /plain JSON objects/],
    [{ '<<': { value: true } }, /merge keys/],
    [Number.POSITIVE_INFINITY, /finite/],
    [undefined, /JSON-compatible/],
  ])(
    'rejects non-profile runtime values during serialization',
    (value, error) => {
      expect(() =>
        stringifyAnnotationMapping({ value } as unknown as Annotations),
      ).toThrow(error);
    },
  );

  it('should reject cyclic runtime values and canonicalization input', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() =>
      validateAnnotationValue({
        value: cyclic,
        context: {},
        seen: new WeakSet(),
      }),
    ).toThrow(/cyclic/);
    expect(() => canonicalizeAnnotationObject(cyclic)).toThrow(/cyclic/);
  });

  it('should validate forbidden YAML node metadata and scalar forms', () => {
    const comment = new Scalar('value');
    comment.comment = 'comment';
    const tag = new Scalar('value');
    tag.tag = 'tag:yaml.org,2002:str';
    const anchor = new Scalar('value');
    anchor.anchor = 'anchor';
    const blockScalar = new Scalar('value');
    blockScalar.type = Scalar.BLOCK_LITERAL;
    const unsupportedScalar = new Scalar(Symbol('value'));

    for (const node of [comment, tag, anchor, blockScalar, unsupportedScalar]) {
      expect(() =>
        validateAnnotationNode({ node, depth: 1, context: {} }),
      ).toThrow(ParseError);
    }
  });

  it('should validate aliases, collection style, key types, and merge keys', () => {
    const blockMap = new YAMLMap();
    blockMap.flow = false;

    const numericKeyMap = new YAMLMap();
    numericKeyMap.flow = true;
    numericKeyMap.items = [new Pair(new Scalar(1), new Scalar('value'))];

    const resolvingKey = new Scalar('true');
    resolvingKey.type = Scalar.PLAIN;
    resolvingKey.source = 'true';
    const resolvingKeyMap = new YAMLMap();
    resolvingKeyMap.flow = true;
    resolvingKeyMap.items = [new Pair(resolvingKey, new Scalar('value'))];

    const mergeKeyMap = new YAMLMap();
    mergeKeyMap.flow = true;
    mergeKeyMap.items = [new Pair(new Scalar('<<'), new Scalar('defaults'))];

    for (const node of [
      new Alias('anchor'),
      blockMap,
      numericKeyMap,
      resolvingKeyMap,
      mergeKeyMap,
      {} as Node,
    ]) {
      expect(() =>
        validateAnnotationNode({ node, depth: 1, context: {} }),
      ).toThrow(ParseError);
    }
    expect(() =>
      validateAnnotationNode({ node: null, depth: 1, context: {} }),
    ).not.toThrow();
  });

  it('should report absolute positions from annotation context', () => {
    expect(() =>
      parseAnnotationMapping({
        source: '{ value: [ }',
        context: {
          baseLine: 8,
          position: { line: 3, column: 4, offset: 20 },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        position: expect.objectContaining({ line: 8, column: 4 }),
      }),
    );
  });

  it('should keep later-line annotation columns relative to that line', () => {
    expect(
      annotationPosition({
        context: { position: { line: 5, column: 9, offset: 20 } },
        line: 2,
        column: 3,
        offset: 4,
      }),
    ).toEqual({ line: 6, column: 3, offset: 24 });
  });

  it('should defend canonical output against multiline and trailing output', () => {
    const multiline = vi
      .spyOn(Document.prototype, 'toString')
      .mockReturnValueOnce('{ value: one }\n{ value: two }');
    expect(() => stringifyAnnotationMapping({ value: 'one' })).toThrow(
      /single-line/,
    );
    multiline.mockRestore();

    const trailing = vi
      .spyOn(Document.prototype, 'toString')
      .mockReturnValueOnce('{ value: one } trailing');
    expect(() => stringifyAnnotationMapping({ value: 'one' })).toThrow(
      /one flow mapping/,
    );
    trailing.mockRestore();
  });
});
