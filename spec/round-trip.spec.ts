import { describe, expect, it } from 'vitest';

import { parse } from '#parse';
import { stringify } from '#stringify';

import { normalizeAst } from './fixtures/normalize';

import type { ParseOptions } from '#parser/types';
import type { StringifyOptions } from '#stringifier/types';

interface RoundTripFixture {
  name: string;
  source: string;
  parseOptions?: ParseOptions;
  stringifyOptions?: StringifyOptions;
}

const customParseOptions = {
  onContent: (content, { type, ref, annotations, parseContent }) => ({
    ...parseContent(content),
    type: type === 'callout' ? 'callout' : 'paragraph',
    ref,
    annotations,
  }),
} satisfies ParseOptions;

const customStringifyOptions = {
  format: (node, stringifyBlock) =>
    stringifyBlock(
      node.type === 'callout' ? { ...node, type: 'paragraph' } : node,
    ),
} satisfies StringifyOptions;

const FIXTURES: RoundTripFixture[] = [
  {
    name: 'referenced leaf',
    source: '{{ ref: intro }}\n# Introduction',
  },
  {
    name: 'nested paragraphs',
    source: [
      '{{ ref: parent }}',
      'Parent',
      '  {{ ref: child }}',
      '  Child',
      '--{ ref: parent }--',
    ].join('\n'),
  },
  {
    name: 'nested lists',
    source: [
      '{{ ref: list }}',
      '- Parent',
      '  {{ ref: child-item }}',
      '  - Child',
      '--{ ref: list }--',
    ].join('\n'),
  },
  {
    name: 'custom block with generic children',
    source: [
      '{{ type: callout, ref: notice }}',
      'Important',
      '  Details',
      '--{ ref: notice }--',
    ].join('\n'),
    parseOptions: customParseOptions,
    stringifyOptions: customStringifyOptions,
  },
  {
    name: 'table',
    source: [
      '{{ ref: scores }}',
      '| Name | Score |',
      '| ---- | ----- |',
      '| Alice | 95 |',
      '| Bob | 87 |',
    ].join('\n'),
  },
  {
    name: 'layout',
    source: ['{{ ref: columns }}', '| Left | Right |'].join('\n'),
  },
  {
    name: 'typed empty block',
    source: '{{ type: paragraph, ref: empty-paragraph }}',
  },
  {
    name: 'typed empty native block',
    source: '{{ type: heading, ref: empty-heading }}',
  },
  {
    name: 'typed empty intrinsic block',
    source: '{{ type: table, ref: empty-table }}',
  },
  {
    name: 'typed empty custom block',
    source: '{{ type: callout, ref: empty-callout }}',
  },
  {
    name: 'quoted ref with delimiter punctuation',
    source: [
      '{{ ref: "section with } character" }}',
      'Content',
      '--{ ref: "section with } character" }--',
    ].join('\n'),
  },
  {
    name: 'nested annotation values',
    source:
      '{{ ref: styled, style: {color: red, font: {weight: 700}}, tags: [one, two] }}\nStyled',
  },
  {
    name: 'redundant manually-authored leaf marker',
    source: ['{{ ref: manual }}', 'Leaf', '--{ ref: manual }--'].join('\n'),
  },
];

describe('round-trip contracts', () => {
  describe('semantic AST law', () => {
    it.each(FIXTURES)(
      'should preserve semantic equivalence for $name',
      ({ source, parseOptions, stringifyOptions }) => {
        const ast = parse(source, parseOptions);
        const reparsed = parse(stringify(ast, stringifyOptions), parseOptions);

        expect(normalizeAst(reparsed)).toEqual(normalizeAst(ast));
      },
    );
  });

  describe('canonical source law', () => {
    it.each(FIXTURES)(
      'should produce idempotent canonical source for $name',
      ({ source, parseOptions, stringifyOptions }) => {
        const canonical = stringify(
          parse(source, parseOptions),
          stringifyOptions,
        );

        expect(
          stringify(parse(canonical, parseOptions), stringifyOptions),
        ).toBe(canonical);
      },
    );
  });

  describe.each(['auto', 'all', 'none'] as const)(
    '%s marker policy',
    (closingMarkers) => {
      it.each(FIXTURES.filter(({ parseOptions }) => !parseOptions))(
        'should preserve both laws for $name',
        ({ source }) => {
          const options = { closingMarkers } satisfies StringifyOptions;
          const ast = parse(source);
          const canonical = stringify(ast, options);
          const reparsed = parse(canonical);

          expect(normalizeAst(reparsed)).toEqual(normalizeAst(ast));
          expect(stringify(reparsed, options)).toBe(canonical);
        },
      );
    },
  );
});
