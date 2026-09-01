# MDCX examples

These examples use the public `mdc` entry point. Source ranges are omitted from assertions so the examples focus on semantic structure.

## Parse a document

```ts
import { parse } from 'mdcx';

const ast = parse(`---
ref: task-001
tags: [guide, reference]
---
{{ ref: section-1 }}
# Introduction

This is **important**.`);

expect(ast).toMatchObject({
  type: 'document',
  annotations: {
    ref: 'task-001',
    tags: ['guide', 'reference'],
  },
  children: [
    {
      type: 'heading',
      ref: 'section-1',
      annotations: { depth: 1 },
      content: [{ type: 'text', text: 'Introduction' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'important', formats: ['bold'] },
        { type: 'text', text: '.' },
      ],
    },
  ],
});
```

Front matter is a bounded YAML 1.2 Core mapping. It supports block mappings, sequences, comments, and multiline string scalars, while rejecting aliases, anchors, explicit tags, merge keys, duplicate or non-string keys, unsafe values, depth above 16, and content above 65,536 UTF-8 bytes.

## Transform a custom block

`callout` is an application-defined block type. The callback reads the reserved discriminator from `context.type`; `context.annotations` excludes `type` and `ref`.

```ts
import { parse } from 'mdcx';

const ast = parse(
  `{{ type: callout, icon: 💡 }}
Important note
  Supporting detail`,
  {
    onContent: (content, context) => {
      const block = context.parseContent(content);

      return context.type === 'callout' ? { ...block, type: 'callout' } : block;
    },
  },
);

expect(ast.children[0]).toMatchObject({
  type: 'callout',
  annotations: { icon: '💡' },
  content: [{ type: 'text', text: 'Important note' }],
  children: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Supporting detail' }],
    },
  ],
});
```

## Parse and stringify inline content

Links, media, and metadata store formatted captions as `InlineTextNode[]`.

```ts
import { parseInlineContent, stringifyInlineContent } from 'mdcx';

const nodes = parseInlineContent(
  '[**Guide**](https://example.com) and [risk]{{ level: high }}',
);

expect(nodes[0]).toMatchObject({
  type: 'link',
  link: 'https://example.com',
  caption: [{ type: 'text', text: 'Guide', formats: ['bold'] }],
});
expect(nodes[2]).toMatchObject({
  type: 'meta',
  caption: [{ type: 'text', text: 'risk' }],
  annotations: { level: 'high' },
});

const source = stringifyInlineContent(nodes);
```

## Lists are direct nodes

MDCX does not create `list` or `item` wrappers. Consecutive items are sibling `bullet` or `enum` nodes, and indentation places nested items in `children`.

```ts
import { parse } from 'mdcx';

const ast = parse(`- Parent
  - Child
    1. Grandchild`);

expect(ast.children).toMatchObject([
  {
    type: 'bullet',
    children: [
      {
        type: 'bullet',
        children: [{ type: 'enum' }],
      },
    ],
  },
]);
```

## Canonical stringification

Annotations must be adjacent to their targets. A named closing marker aligns with the block it closes; it asserts an already-visible boundary rather than creating hierarchy.

```ts
import { parse, stringify } from 'mdcx';

const ast = parse(`{{ ref: parent }}
- Parent
  {{ ref: child }}
  - Child
--{ ref: parent }--`);

const canonical = stringify(ast);
const markdown = stringify(ast, { omitAnnotations: true });
const transport = stringify(ast, { closingMarkers: 'all' });
```

The semantic contract is `parse(stringify(ast)) ≡ normalize(ast)`. Canonical output may change whitespace, annotation ordering and quoting, table padding, ordered-list markers, and optional closing-marker placement.

## Semantic diff and virtual refs

```ts
import { diff, parse } from 'mdcx';

const before = parse('# Introduction\n\nHello world.');
const after = parse('# Introduction\n\nHello universe.');
const result = diff(before, after);

expect(result.summary.updates).toBe(1);
expect(result.operations[0]).toMatchObject({ type: 'update' });

const operation = result.operations[0];
if (operation?.type === 'update') {
  expect(result.virtuals[operation.ref]).toBeDefined();
}
```

Ancestry fields may also contain generated refs. `parentRefs`, `fromParentRefs`, and `toParentRefs` describe ancestors; `afterRef` and `toAfterRef` identify the immediately preceding sibling and are omitted only for the first child. Generated refs used by operations or ancestry resolve through `result.virtuals`.

## Strict indentation and explicit recovery

Strict parsing rejects odd indentation, skipped levels, and tabs outside fenced code:

```ts
import { parse } from 'mdcx';

expect(() => parse('Parent\n   Child')).toThrow(
  expect.objectContaining({ code: 'MDCX_INDENTATION_INVALID' }),
);
```

Recovery is explicit and reports every deterministic normalization:

```ts
import { parse, type ParseDiagnostic } from 'mdcx';

const diagnostics: ParseDiagnostic[] = [];
const ast = parse(
  [
    '{{ ref: parent }}',
    'Parent',
    '{{ ref: child }}',
    'Child',
    '--{ ref: child }--',
    '--{ ref: parent }--',
  ].join('\n'),
  {
    mode: 'recover',
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  },
);

expect(diagnostics[0]?.code).toBe('MDCX_MARKER_SCOPE_RECOVERED');
expect(ast.children[0]?.children?.[0]?.ref).toBe('child');
```

## Typed empty blocks

An annotation-only declaration must include `type`:

```ts
import { parse, stringify } from 'mdcx';

const ast = parse('{{ type: paragraph, ref: empty }}');

expect(ast.children[0]).toMatchObject({
  type: 'paragraph',
  ref: 'empty',
  content: [],
  children: [],
});
expect(stringify(ast)).toBe('{{ type: paragraph, ref: empty }}');
```
