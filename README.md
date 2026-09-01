<div align="center">

<img src="./logo.svg" alt="MDCX logo" width="220" />

# mdcx

[![npm](https://img.shields.io/npm/v/mdcx?style=flat-square)](https://www.npmjs.com/package/mdcx)
[![downloads](https://img.shields.io/npm/dm/mdcx?style=flat-square)](https://www.npmjs.com/package/mdcx)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.10-339933?style=flat-square&logo=nodedotjs&logoColor=white)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-typed-3178C6?style=flat-square&logo=typescript&logoColor=white)](./src/index.ts)

**Give Markdown context** — stable identity, structured annotations, and semantic diffs for TypeScript.

_Parse, transform, and stringify human/LLM-readable prose while preserving document structure and application-level metadata._

</div>

<br/>
<div align="center">

💡 [Core Concept](#-core-concept)&emsp;&emsp;•&emsp;&emsp;📋 [Supported Syntax](#-supported-syntax)&emsp;&emsp;•&emsp;&emsp;📖 [Usage](#-usage)&emsp;&emsp;•&emsp;&emsp;📚 [API Reference](#-api-reference)

</div>
<br/>

---

## ⚡ Quick Start

Install the package with your preferred package manager. Requires Node.js 22.10 or later.

```bash
# npm
npm install mdcx
# pnpm
pnpm add mdcx
# yarn
yarn add mdcx
```

Parse two versions of a document, inspect the changes, and write canonical MDCX:

```ts
import { diff, parse, stringify } from 'mdcx';

const before = parse('{{ ref: welcome }}\n# Hello');
const after = parse('{{ ref: welcome }}\n# Hello, world!');

const changes = diff(before, after);
console.log(changes.summary);
// { inserts: 0, deletes: 0, updates: 1, moves: 0 }

console.log(stringify(after));
// {{ ref: welcome }}
// # Hello, world!
```

The shared `ref` identifies the heading across edits. Your application chooses the identifier; MDCX preserves it for matching and diffing.

---

## ✨ Why MDCX?

### 😩 The Problem

Plain Markdown is easy to read and edit, but applications need more context to transform and synchronize documents:

- **Stable identity**: A heading or paragraph needs an identifier that survives text edits and moves.
- **Structured metadata**: Block types, application fields, and inline annotations need a representation alongside the prose.
- **Meaningful changes**: Line diffs alone do not describe block updates, moves, or their parent relationships.

### 💡 The Solution

MDCX is a CommonMark syntax extension designed for prose that remains equally readable to humans and LLMs, while adding stable identity, explicit context, and deterministic transformation semantics.

The mdcx toolkit parses, stringifies, and diffs MDCX documents against an application-level semantic AST, with support for constrained annotations, precise structural indentation, optional closing assertions, canonical stringification, and semantic differencing.

---

## 🚀 Key Features

| Feature                       | What it provides                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **Stable node identity**      | Application-defined `ref` values for matching blocks across document versions                      |
| **Structured annotations**    | JSON-compatible block and inline metadata through a constrained YAML 1.2 Core flow-mapping profile |
| **Typed semantic AST**        | Document, block, and inline nodes for programmatic transformations                                 |
| **Deterministic structure**   | Exact two-space indentation, with optional closing markers that assert block boundaries            |
| **Canonical stringification** | Consistent MDCX output with `auto`, `all`, or `none` closing-marker policies                       |
| **Semantic diffs**            | Insert, delete, update, and move operations with ancestry and sibling context                      |
| **Explicit recovery**         | Opt-in recovery mode with diagnostics for deterministic repairs                                    |
| **Custom content handling**   | Parsing middleware and stringifier formatting hooks for application-specific content               |

**Core Benefits:**

- **📝 Keep prose editable**: Store context alongside content in a text format people and LLMs can read.
- **🔗 Preserve identity across edits**: Connect document nodes to the identifiers your application already owns.
- **🔍 Inspect structural changes**: Consume typed operations instead of reconstructing document meaning from changed lines.
- **🔄 Transform predictably**: Round-trip semantic structure through canonical MDCX; original whitespace and source bytes are not preserved.

---

## 💡 Core Concept

Every capability in mdcx hangs off a single abstraction: **MDCX documents are CommonMark-style prose with a constrained annotation layer** that attaches JSON-compatible metadata to blocks and inline content.

`ref` is an **application-level stable identifier for the annotated node's type**. It is not a Notion-only identifier: the application that owns the type chooses the unique identifier, and MDCX preserves it as an opaque string for identity matching, diffing, and linking.

### Annotation Syntax

**Block annotations** attach to the immediately following block:

```markdown
{{ ref: intro, type: callout }}

# Welcome

{{ icon: 💡 }}
This paragraph becomes annotated.
```

**Inline annotations** wrap specific content within a line:

```markdown
The revenue grew by [+15%]{{ trend: positive, delta: 0.15 }}.
See [API docs](https://example.com){{ verified: true }} for details.
```

**Front matter directives** provide document-level metadata:

```markdown
---
type: document
author: Jane Doe
tags: [guide, reference]
---

# Document content starts here
```

### Processing Pipeline

The library processes MDCX documents in three phases:

1. **Tokenize** (via `tokenize()` in `src/lexer/`): Scans the input string for MDCX-specific delimiters (`{{`, `}}`, `---`, ` ``` `), producing a flat token stream. Block type inference happens later — the lexer only identifies structural markers.

2. **Build AST** (via `buildAst()` in `src/parser/`): Recursively constructs a typed AST from the token stream. Exact two-space indentation establishes parent-child relationships. A shared flow-mapping scanner and MDCX Annotation Profile validate annotation mappings before conversion.

3. **Diff** (via `diff()` in `src/diff.ts`): Compares two AST trees using a **3-phase matching pipeline**:
   - **Phase 1 (Ref Matching)**: Identity matching via explicit `ref` attributes
   - **Phase 2 (Inference)**: 4 strategies for unmatched nodes — positional (highest confidence), content similarity, structural uniqueness, fingerprint context (lowest confidence)
   - **Phase 3 (Fallback)**: Greedy similarity matching for remaining nodes using weighted scoring (30% Jaccard + 40% Levenshtein + 30% N-gram)

   Produces `insert`/`delete`/`update`/`move` operations with ancestry context (`parentRefs`, `afterRef`).

Treat the AST as the canonical representation of document structure so that transformations, diffing, and validation operate on typed nodes rather than raw text. MDCX defines two precise contracts: `parse(stringify(ast)) ≡ normalize(ast)` for semantic AST equality and `stringify(parse(source)) = canonicalize(source)` for canonical source. The pipeline is not byte-for-byte source-lossless.

---

## 📋 Supported Syntax

Quick reference for all natively supported MDCX syntax patterns and their corresponding AST node types.

### Block-Level Elements

| Syntax           | Example            | Node Type   | Key Properties                  |
| ---------------- | ------------------ | ----------- | ------------------------------- |
| Heading          | `# Title`          | `heading`   | `annotations.depth: 1\|2\|3`    |
| Paragraph        | `Plain text`       | `paragraph` | `content: InlineNode[]`         |
| Bullet list      | `- Item`           | `bullet`    | `content: InlineNode[]`         |
| Numbered list    | `1. Item`          | `enum`      | `content: InlineNode[]`         |
| Todo (unchecked) | `- [ ] Task`       | `todo`      | `annotations.checked: false`    |
| Todo (checked)   | `- [x] Done`       | `todo`      | `annotations.checked: true`     |
| Blockquote       | `> Quote`          | `quote`     | `content: InlineNode[]`         |
| Code fence       | ` ```ts `          | `code`      | `annotations.language?: string` |
| Table            | `\| A \| B \|`     | `table`     | `headers?: HeaderNode[]`        |
| Layout           | `\| Col \| Col \|` | `layout`    | `children: ColumnNode[]`        |
| Divider          | `---`              | `divider`   | N/A                             |
| Equation block   | `$$E=mc^2$$`       | `equation`  | `content: InlineNode[]`         |

### Inline-Level Elements

| Syntax          | Example                | Node Type | Key Properties               |
| --------------- | ---------------------- | --------- | ---------------------------- |
| Plain text      | `Hello`                | `text`    | `text: string`               |
| Bold            | `**bold**`             | `text`    | `formats: ['bold']`          |
| Italic          | `*italic*`             | `text`    | `formats: ['italic']`        |
| Code            | `` `code` ``           | `text`    | `formats: ['code']`          |
| Strikethrough   | `~~strike~~`           | `text`    | `formats: ['strikethrough']` |
| Link            | `[text](url)`          | `link`    | `link: string`               |
| Image           | `![alt](src)`          | `media`   | `src: string`                |
| Meta annotation | `[text]{{ key: val }}` | `meta`    | `annotations: {...}`         |

---

## 📐 Architecture

### File Structure

```plain
src/
├── lexer/               # delimiter-focused tokenizer
│   ├── flow-mapping.ts  # balanced, quote-aware annotation scanner
│   ├── scanner.ts       # character-level scanning with position tracking
│   ├── tokenize-annotations.ts # annotation and marker tokenization
│   ├── tokenize.ts      # main tokenization
│   └── types.ts         # token type definitions
├── parser/              # recursive descent AST builder
│   ├── annotation-profile.ts # constrained YAML mapping entry point
│   ├── block-parser.ts  # exact-indentation block recursion
│   ├── build.ts         # token → AST orchestration
│   ├── blocks.ts        # block type inference from markdown patterns
│   ├── inline.ts        # inline content parsing (links, media, formatting)
│   ├── directive.ts     # front matter parsing
│   ├── closing.ts       # local closing-marker assertions
│   ├── diagnostics.ts   # recovery diagnostics
│   ├── marker-index.ts  # recovery-only marker pairing
│   ├── recovery.ts      # deterministic recovery orchestration
│   ├── inference.ts     # block type inference logic
│   ├── layout.ts        # layout and column parsing
│   ├── position.ts      # position tracking utilities
│   ├── table.ts         # table structure parsing
│   └── types.ts         # parser type definitions (ParseOptions, OnContentContext)
├── stringifier/         # AST to MDCX string conversion
│   ├── blocks.ts        # block node stringification
│   ├── inline.ts        # inline node stringification
│   ├── annotations.ts   # annotation stringification
│   ├── directive.ts     # front matter directive output
│   ├── inference.ts     # type inference for output
│   ├── layout.ts        # layout structure output
│   ├── table.ts         # table structure output
│   ├── utilities.ts     # stringifier helpers
│   └── types.ts         # stringifier type definitions
├── differ/              # semantic diff engine
│   ├── matcher.ts       # TreeMatcher for 3-phase matching pipeline
│   ├── operations.ts    # generates insert/delete/update/move operations
│   ├── similarity.ts    # Jaccard + Levenshtein + N-gram scoring
│   ├── delta.ts         # computes property deltas for update operations
│   ├── ref.ts           # generates virtual refs for unmatched nodes
│   ├── traversal.ts     # AST traversal for diff operations
│   ├── utilities.ts     # comparison and equality helpers
│   └── inference/       # 4 matching strategies
│       ├── index.ts     # strategy orchestration
│       ├── positional.ts    # position-based matching (highest confidence)
│       ├── content.ts       # text similarity matching
│       ├── structural.ts    # type-based matching
│       ├── fingerprint.ts   # context pattern matching (lowest confidence)
│       ├── utilities.ts     # inference helpers
│       └── types.ts         # inference type definitions
├── types/               # AST and Diff type definitions
│   ├── ast.ts           # DocumentNode, BlockNode, InlineNode types
│   ├── diff.ts          # Diff, DiffOperation types
│   └── index.ts         # re-exports
├── parse.ts             # main parse() entry point
├── stringify.ts         # main stringify() entry point
├── diff.ts              # main diff() entry point
├── errors.ts            # ParseError and error handling
└── index.ts             # public exports
```

### Main Components

- **Lexer** (`src/lexer/`): Delimiter-focused tokenizer with one balanced, quote-aware flow-mapping scanner for every annotation context. It validates indentation outside opaque fenced code and does not infer Markdown block types.

- **Parser** (`src/parser/`): Recursive descent AST builder that transforms tokens into a hierarchical tree using exact two-space structural levels. It parses annotations through the MDCX Annotation Profile and validates closing markers only after the owning block and children are built.

- **Stringify** (`src/stringify.ts`): Converts AST back to canonical MDCX. It supports structural `auto | all | none` closing-marker policies, annotation suppression, and custom `format` callbacks for domain-specific block types.

- **Differ** (`src/differ/`): Semantic diff engine that computes insert/delete/update/move operations between two AST trees. Prioritizes ref-based matching for stable identity tracking, then uses content similarity for unmatched nodes.

For internal implementation details, the 4-phase matching pipeline, and virtual reference documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 📖 Usage

### Strict Parsing and the MDCX Annotation Profile

`parse(source)` is strict by default. MDCX structural children use exactly two spaces per level; tabs outside opaque fenced code, odd indentation, and skipped levels are errors. An annotation and its target must be adjacent and equally indented. A closing marker can only assert an already-built local boundary—it never creates children, repairs indentation, merges Markdown blocks, or changes a block type.

Block, inline, link/media, and closing-marker annotations share the **MDCX Annotation Profile**: YAML 1.2 Core, one single-line flow mapping, string keys, JSON-compatible values, at most 16,384 UTF-8 bytes, and collection depth at most 16. Tags, anchors, aliases, merge keys, cycles, duplicate or non-string keys, comments, non-finite numbers, unsafe unquoted integers, multiline syntax, and non-mapping roots are rejected.

Front matter accepts block-style YAML 1.2 Core mappings up to 65,536 UTF-8 bytes and the same depth limit. Comments and multiline string scalars are allowed there; aliases, anchors, explicit tags, merge keys, duplicate or non-string keys, unsafe numeric values, and non-object results are rejected or ignored as documented by `parse()`.

### Parsing MDCX Documents

```ts
import { parse, type ParseDiagnostic } from 'mdcx';

// basic parsing
const ast = parse('# Hello World\n\nThis is a paragraph.');

// with document type and default annotations
const ast = parse(mdcxString, {
  type: 'notion',
  annotations: { author: 'system', version: '1.0' },
});

// with middleware for custom block handling
const ast = parse(mdcxString, {
  onContent: (content, context) => {
    if (context.type === 'callout') {
      return { ...context.parseContent(content), type: 'callout' };
    }
    return context.parseContent(content);
  },
});

// explicit deterministic recovery with mandatory diagnostics
const diagnostics: ParseDiagnostic[] = [];
const recovered = parse(mdcxString, {
  mode: 'recover',
  onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
});
```

Recovery reports every normalization. It may replace leading indentation tabs, round odd leading spaces down, clamp a skipped level, or promote a uniquely paired referenced child inside unambiguous marker boundaries. It never repairs malformed annotations, ambiguous markers, ordinary unreferenced siblings, or non-leading tabs.

### Stringifying AST to MDCX

```ts
import { stringify, type HeadingNode } from 'mdcx';

// round-trip: AST back to MDCX string
const output = stringify(ast);

// transport/debug output: marker on every referenced external block
const transport = stringify(ast, { closingMarkers: 'all' });

// marker-free output
const markerFree = stringify(ast, { closingMarkers: 'none' });

// pure Markdown output (strips all annotations)
const markdown = stringify(ast, { omitAnnotations: true });

// custom block formatting
const custom = stringify(ast, {
  format: (node, stringifyBlock) => {
    if (
      node.type === 'heading' &&
      (node as HeadingNode).annotations?.depth === 1
    ) {
      return `<!-- H1 -->\n${stringifyBlock(node)}`;
    }
    return stringifyBlock(node);
  },
});
```

### Closing Marker Robustness

Closing markers are optional boundary assertions. In strict mode, visible block syntax and exact indentation determine hierarchy before a marker is checked. An under-indented declared child remains a sibling and a later marker cannot repair it:

```markdown
{{ ref: parent }}

- Parent
  {{ ref: child }}
- Child
  --{ ref: parent }--
```

```txt
document
├─ parent
└─ child
```

The valid form visibly indents the child by exactly one level. Canonical `auto` output marks the referenced parent because it owns a generic indentation-rendered child; the leaf child receives no marker:

```markdown
{{ ref: parent }}

- Parent
  {{ ref: child }}
  - Child
    --{ ref: parent }--
```

```txt
document
└─ parent
   └─ child
```

Referenced leaves, tables, and layouts receive no marker under the default `auto` policy. `all` marks every referenced external block; `none` emits no markers. Typed empty blocks use a marker-free annotation-only declaration such as `{{ type: paragraph, ref: empty }}`.

### Round-Trip Contracts

MDCX defines semantic rather than byte-for-byte source preservation:

```text
parse(stringify(ast)) ≡ normalize(ast)
stringify(parse(source)) = canonicalize(source)
canonicalize(source) := stringify(parse(source))
```

Semantic normalization ignores source ranges, materializes parser defaults, normalizes inferred native types and absent versus empty annotations, and preserves type, `ref`, content, semantic annotations, hierarchy, and intrinsic table/layout structure. Canonicalization may change annotation key order and quoting, whitespace, table padding, ordered-list markers, optional leaf markers, and automatic parent-marker placement. Original quote style, comments, arbitrary whitespace, table padding, and canonicalized ordered-list numbering are not preserved.

### Computing Semantic Diffs

```ts
import { parse, diff } from 'mdcx';

const astA = parse('# Hello\n\nWorld');
const astB = parse('# Hello\n\nUniverse');

const changes = diff(astA, astB);
// changes.operations = [
//   {
//     type: 'update',
//     ref: '#k5f8x2p9a3m1',  // virtual ref (auto-generated for positional matches)
//     path: ['children', 1],
//     old: {...},
//     new: {...},
//     from: { content: [...] },  // what changed (old values)
//     to: { content: [...] },    // what changed (new values)
//     parentRefs: []             // empty since at document root
//   }
// ]
// changes.summary = { inserts: 0, deletes: 0, updates: 1, moves: 0 }
```

**Virtual Refs:** When nodes without explicit `ref` attributes are matched positionally, the diff algorithm generates a virtual local ref (prefixed with `#`) to track identity across operations.

_Why are virtual refs needed?_

- **Ancestry context correlation**: Operations include `parentRefs` and `afterRef` fields that reference other nodes. If a parent node doesn't have an explicit `ref`, a virtual ref is generated so children can reference it in their `parentRefs` chain.
- **Identity tracking for positional matches**: When nodes are matched by position rather than explicit ref, they still need an identifier so other operations can reference them consistently.
- **Sibling relationships**: When inserting node B after node A, the `afterRef` field needs to reference A. If A has no explicit ref, a virtual ref is generated to establish this relationship.

_Key scenarios requiring virtual refs:_

- **Nested inserts**: When a parent and child are both inserted, the child's `parentRefs` must reference the parent—requiring the parent to have a (virtual) ref.
- **Sequential inserts**: When multiple siblings are inserted, each subsequent sibling's `afterRef` references the previous sibling's virtual ref.
- **Update operations**: Positionally-matched nodes receive virtual refs so they can be identified across the operation set.

**Delta Fields:** Update operations include `from` and `to` fields showing only the properties that changed, excluding `range` since position is captured by `path`.

**Ancestry Context:** All operations include `parentRefs` (chain of ancestor refs) and `insert`/`move` operations include `afterRef`/`toAfterRef` (ref of preceding sibling). This enables consumers to understand the structural context of each change without re-traversing the AST.

### Example: Document Transformation Pipeline

Process MDCX documents through a transformation pipeline that extracts metadata, transforms content, and tracks changes.

```ts
import { parse, stringify, diff } from 'mdcx';

// parse source document
const original = parse(`---
type: article
---

{{ ref: intro }}
# Introduction

Welcome to the guide.
`);

// transform: update heading content
const modified = {
  ...original,
  children: original.children.map((node) => {
    if (node.type === 'heading' && node.ref === 'intro') {
      return { ...node, content: [{ type: 'text', text: 'Getting Started' }] };
    }
    return node;
  }),
};

// compute what changed
const changes = diff(original, modified);
console.log(`${changes.summary.updates} update(s)`);

// serialize back to MDCX
const output = stringify(modified);
```

---

## 📚 API Reference

The package root is the only published entry point.

| Category          | Root exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime           | `parse`, `parseInlineContent`, `stringify`, `stringifyInlineContent`, `diff`, `ParseError`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Parser types      | `ParseErrorCode`, `ParseMode`, `ParseDiagnosticCode`, `ParseDiagnostic`, `BaseParseOptions`, `ParseOptions`, `ParseResult`, `OnContentContext`, `ContentBlockContext`                                                                                                                                                                                                                                                                                                                                        |
| Stringifier types | `ClosingMarkerPolicy`, `StringifyOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AST types         | `Annotations`, `Range`, `Position`, `DocumentNode`, `HeadingDepth`, `CustomNode`, `ContainerNode`, `ContentNode`, `HeadingNode`, `ParagraphNode`, `BulletNode`, `EnumNode`, `QuoteNode`, `CodeNode`, `TableNode`, `HeaderNode`, `LayoutNode`, `ColumnNode`, `RowNode`, `CellNode`, `TodoNode`, `DividerNode`, `EquationNode`, `NativeBlockType`, `NativeBlockNode`, `BlockNode`, `InlineNodeBase`, `InlineTextFormat`, `InlineTextNode`, `InlineLinkNode`, `InlineMediaNode`, `InlineMetaNode`, `InlineNode` |
| Diff types        | `Path`, `DiffOperation`, `DeleteOperation`, `InsertOperation`, `UpdateOperation`, `MoveOperation`, `Diff`                                                                                                                                                                                                                                                                                                                                                                                                    |

### Core Functions

<details>
<summary><code>parse(mdcx: string, options?: ParseOptions): DocumentNode</code></summary>

**Description:**
Parses an MDCX document string into a typed Abstract Syntax Tree. Handles front matter directives, block annotations, and inline annotations.

**Parameters:**

- `mdcx` (`string`): The MDCX document string to parse
- `options` (`ParseOptions`): Optional configuration object
  - `type` (`string`): Default document type (e.g., 'notion', 'document')
  - `annotations` (`Annotations`): Default annotations merged after the directive (option values take precedence)
  - `onContent` (`(content: string, context: OnContentContext) => SetOptional<BlockNode, 'annotations' | 'children' | 'content'> | null`): Middleware to transform or filter blocks during parsing
  - `mode` (`'strict' | 'recover'`): Strict by default; recovery is explicit
  - `onDiagnostic` (`(diagnostic: ParseDiagnostic) => void`): Required when `mode` is `'recover'` and forbidden in strict mode

**Returns:**

- `DocumentNode`: The root document node containing all parsed content

**Throws:**

- `ParseError`: When syntax, annotation-profile, marker, indentation, or recovery configuration validation fails

**Example:**

```ts
import { parse, ParseError } from 'mdcx';

try {
  const ast = parse('{{ ref: intro }}\n# Hello');
  // ast.children[0].ref === 'intro'
  // ast.children[0].type === 'heading'
} catch (error) {
  if (error instanceof ParseError) {
    console.error(`${error.code}: ${error.message}`);
  }
}
```

</details>

<details>
<summary><code>stringify(ast: DocumentNode, options?: StringifyOptions): string</code></summary>

**Description:**
Converts an MDCX AST into canonical MDCX text. It preserves the semantic round-trip contract `parse(stringify(ast)) ≡ normalize(ast)` and can also produce annotation-free Markdown output.

**Parameters:**

- `ast` (`DocumentNode`): The MDCX AST to stringify
- `options` (`StringifyOptions`): Optional configuration object
  - `omitAnnotations` (`boolean`): Remove all annotations, producing pure Markdown
  - `omitBlockAnnotations` (`boolean`): Suppress leading block annotations and their closing markers while retaining inline annotations
  - `closingMarkers` (`'auto' | 'all' | 'none'`): Control named closing markers; defaults to `'auto'`
  - `format` (`(node: BlockNode, stringifyBlock: (node: BlockNode) => string) => string`): Custom formatter for block nodes

**Returns:**

- `string`: The MDCX document string

**Throws:**

- `Error`: When encountering custom block types without a `format` callback

**Example:**

```ts
import { stringify } from 'mdcx';

const mdcx = stringify(ast);
const markdown = stringify(ast, { omitAnnotations: true });
const transport = stringify(ast, { closingMarkers: 'all' });
const withoutClosingMarkers = stringify(ast, { closingMarkers: 'none' });
```

</details>

<details>
<summary><code>parseInlineContent(content: string, baseRange?: Range): InlineNode[]</code></summary>

Parses standalone inline MDCX into the same inline-node schema used by block parsing. When `baseRange` is omitted, returned nodes do not include source ranges.

```ts
import { parseInlineContent } from 'mdcx';

const nodes = parseInlineContent('Read [the guide](https://example.com).');
```

</details>

<details>
<summary><code>stringifyInlineContent(content?: InlineNode[], options?: StringifyOptions): string</code></summary>

Serializes inline nodes without creating a document or block wrapper. `omitAnnotations` has the same meaning as it does for `stringify()`.

```ts
import { stringifyInlineContent } from 'mdcx';

const source = stringifyInlineContent(nodes);
```

</details>

<details>
<summary><code>diff(astA: DocumentNode, astB: DocumentNode): Diff</code></summary>

**Description:**
Computes semantic differences between two MDCX AST trees. Uses a 3-phase matching pipeline: ref-based identity matching first, then inference strategies (positional, content, structural, fingerprint), then fallback similarity scoring.

**Parameters:**

- `astA` (`DocumentNode`): Source AST (the "before" state)
- `astB` (`DocumentNode`): Target AST (the "after" state)

**Returns:**

- `Diff`: Object containing:
  - `sourceAst` (`DocumentNode`): Reconciled source AST used for the diff
  - `targetAst` (`DocumentNode`): Reconciled target AST used for the diff
  - `operations` (`DiffOperation[]`): Ordered list of insert/delete/update/move operations
  - `summary` (`{ inserts, deletes, updates, moves }`): Aggregate counts

**Example:**

```ts
import { parse, diff } from 'mdcx';

const before = parse('# Title\n\nParagraph one.');
const after = parse('# Title\n\nParagraph two.');

const result = diff(before, after);
// result.operations[0].type === 'update'
// result.summary.updates === 1
```

</details>

### Type Definitions

<details>
<summary><code>DocumentNode</code></summary>

**Description:**
Root AST node representing the entire MDCX document.

```ts
interface DocumentNode {
  type: string; // document type identifier (e.g., 'notion', 'markdown')
  ref?: string; // optional application-level stable identifier for this document type
  annotations?: Annotations; // document-level annotations from directive
  children: BlockNode[]; // top-level block nodes in the document
}
```

</details>

<details>
<summary><code>BlockNode</code></summary>

**Description:**
Union type of all block-level nodes. Each node includes `type` (discriminator), `range` (source location), optional `ref`, `annotations`, `content`, and `children`.

```ts
type BlockNode =
  | HeadingNode // { type: 'heading', annotations: { depth: 1|2|3 }, content: InlineNode[] }
  | ParagraphNode // { type: 'paragraph', content: InlineNode[] }
  | BulletNode // { type: 'bullet', content: InlineNode[] } (unordered list item)
  | EnumNode // { type: 'enum', content: InlineNode[] } (ordered/numbered list item)
  | QuoteNode // { type: 'quote', content: InlineNode[] }
  | CodeNode // { type: 'code', annotations: { language?: string }, content: InlineNode[] }
  | TableNode // { type: 'table', headers?: HeaderNode[], children: RowNode[] }
  | HeaderNode // { type: 'header', annotations: { alignment?: 'left'|'center'|'right' }, content: InlineNode[] }
  | RowNode // { type: 'row', children: CellNode[] }
  | CellNode // { type: 'cell', content: InlineNode[] }
  | LayoutNode // { type: 'layout', children: ColumnNode[] }
  | ColumnNode // { type: 'column', annotations: { ratio?: number }, children: BlockNode[] }
  | TodoNode // { type: 'todo', annotations: { checked?: boolean }, content: InlineNode[] }
  | DividerNode // { type: 'divider' }
  | EquationNode // { type: 'equation', content: InlineNode[] }
  | CustomNode; // extensible base for domain-specific blocks
```

**Note:** Properties like `depth`, `language`, `alignment`, `ratio`, and `checked` are stored in the `annotations` object, not as direct node properties. This design keeps all metadata in a consistent location.

</details>

<details>
<summary><code>InlineNode</code></summary>

**Description:**
Union type of all inline-level nodes. Every node has `type`, optional `range`, `ref`, and `annotations`. Links, media, and metadata contain a `caption` array of formatted text nodes.

```ts
type InlineNode =
  | InlineTextNode // { type: 'text', text: string, formats?: InlineTextFormat[] }
  | InlineLinkNode // { type: 'link', caption: InlineTextNode[], link: string }
  | InlineMediaNode // { type: 'media', caption: InlineTextNode[], src: string }
  | InlineMetaNode; // { type: 'meta', caption: InlineTextNode[], annotations?: Annotations }
```

**InlineMetaNode:** Created by `[text]{{ annotations }}`. Inline `type` remains annotation data; it does not create an arbitrary inline discriminator.

</details>

<details>
<summary><code>Diff</code></summary>

**Description:**
Result of comparing two AST documents.

```ts
interface Diff {
  sourceAst: DocumentNode; // reconciled source AST used for operation generation
  targetAst: DocumentNode; // reconciled target AST used for operation generation
  operations: DiffOperation[]; // ordered list of change operations to transform source to target
  virtuals: Record<string, BlockNode>; // virtual refs to source-side nodes
  summary: {
    inserts: number; // number of nodes added
    deletes: number; // number of nodes removed
    updates: number; // number of nodes modified in place
    moves: number; // number of nodes moved to different positions
  };
}
```

</details>

<details>
<summary><code>DiffOperation</code></summary>

**Description:**
Discriminated union representing a single diff operation. Each operation includes ancestry context to help consumers understand the structural location of changes.

```ts
type DiffOperation =
  | {
      type: 'insert';
      ref?: string; // ref from the added node
      path: Path; // path to node in target AST
      node: BlockNode; // the added node
      parentRefs: string[]; // chain of ancestor refs from root to parent
      afterRef?: string; // ref of preceding sibling (if any)
    }
  | {
      type: 'delete';
      ref?: string; // ref from the removed node
      path: Path; // path to node in source AST
      node: BlockNode; // the removed node
      parentRefs: string[]; // chain of ancestor refs in source AST
    }
  | {
      type: 'update';
      ref: string; // explicit ref or virtual ref (#...)
      path: Path;
      old: BlockNode; // full original node
      new: BlockNode; // full updated node
      from: PartialDeep<BlockNode>; // properties that changed (old values)
      to: PartialDeep<BlockNode>; // properties that changed (new values)
      parentRefs: string[]; // chain of ancestor refs (from target AST)
    }
  | {
      type: 'move';
      ref?: string; // ref from the moved node
      from: Path; // original path in source AST
      to: Path; // new path in target AST
      node: BlockNode; // the moved node
      fromParentRefs: string[]; // chain of ancestor refs in source AST
      toParentRefs: string[]; // chain of ancestor refs in target AST
      toAfterRef?: string; // ref of preceding sibling in target position
    };

type Path = Array<string | number>; // e.g., ['children', 1, 'children', 0]
```

**Ancestry Context:**

- `parentRefs`, `fromParentRefs`, and `toParentRefs`: Chain of explicit or generated virtual refs from the document root to the parent. The chain is empty only at the document root.
- `afterRef` / `toAfterRef`: Explicit or generated virtual ref of the immediately preceding sibling. Omitted only when the node is the first child.
- `virtuals`: Resolves generated refs used by operations or ancestry to their source-side nodes.
- **Important:** If a node is removed and subsequent siblings shift positions, NO move operation is generated for those siblings — their `afterRef` simply reflects the new preceding sibling.

**Update Operation Details:**

- `ref`: Uses the node's explicit `ref` if available; otherwise generates a virtual ref (e.g., `#k5f8x2`) for positionally-matched nodes
- `from`/`to`: Show only the properties that differ between `old` and `new`, excluding `range`
- Example: If only content changed, `from: { content: [...old] }` and `to: { content: [...new] }`

</details>

<details>
<summary><code>Annotations</code></summary>

**Description:**
JSON-compatible annotation object for block and inline metadata. Source annotations use the MDCX Annotation Profile: one single-line YAML 1.2 Core flow mapping with string keys and explicit safety limits. Reserved keys `type` and `ref` must be non-empty strings.

```ts
type Annotations = {
  type?: string; // explicit block/inline type override
  ref?: string; // application-level stable identifier for the annotated type
  [key: string]: JsonValue | undefined;
};
// JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
```

</details>

<details>
<summary><code>Range</code> and <code>Position</code></summary>

**Description:**
Source document location types for error reporting and editing.

```ts
interface Range {
  start: Position; // starting position in source
  end: Position; // ending position in source
}

interface Position {
  line: number; // 1-indexed line number
  column: number; // 1-indexed column number
  offset: number; // 0-indexed character offset from start of document
}
```

</details>

<details>
<summary><code>ParseError</code></summary>

**Description:**
Custom error class with a stable machine-readable category and optional source position.

```ts
class ParseError extends Error {
  readonly code: ParseErrorCode;
  position?: Position; // source position where the error occurred

  constructor(code: ParseErrorCode, message: string, position?: Position);
}
```

**Example:**

```ts
import { parse, ParseError } from 'mdcx';

try {
  const ast = parse('{{ value: .nan }}\n# Hello');
} catch (error) {
  if (error instanceof ParseError) {
    console.error(`Parse error: ${error.message}`);
    if (error.position) {
      console.error(
        `  at line ${error.position.line}, column ${error.position.column}`,
      );
    }
  }
}
```

</details>

<details>
<summary><code>OnContentContext</code></summary>

**Description:**
Context object passed to the `onContent` middleware during parsing. Extends `ContentBlockContext` with a helper function to parse content.

```ts
import type { SetOptional } from 'type-fest';

interface OnContentContext extends ContentBlockContext {
  parseContent: (
    content: string,
  ) => SetOptional<BlockNode, 'annotations' | 'children' | 'content'>;
}

interface ContentBlockContext {
  type?: string; // inferred or explicit block type
  ref?: string; // optional application-level stable identifier for this block type
  annotations?: Annotations; // block-level annotations (excluding ref and type)
  range: Range; // source position for error reporting
}
```

**Example:**

```ts
const ast = parse(mdcxString, {
  onContent: (content, context) => {
    // Custom callout block type
    if (context.type === 'callout') {
      const baseBlock = context.parseContent(content);
      return {
        ...baseBlock,
        type: 'callout',
        icon: context.annotations?.icon ?? '💡',
      };
    }
    return context.parseContent(content);
  },
});
```

</details>

---

## 📦 Related Packages

- [`yaml`](https://github.com/eemeli/yaml): YAML 1.2 document parser used by the annotation and bounded front-matter profiles
- [`type-fest`](https://github.com/sindresorhus/type-fest): TypeScript utility types including `JsonValue` for annotations and `PartialDeep` for delta fields

---
