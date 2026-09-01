## ✍️ Syntax Reference

This is the normative grammar reference for MDCX, a CommonMark syntax extension for human/LLM-readable prose with stable identity, explicit context, and deterministic transformation semantics. MDCX follows CommonMark syntax where the purpose-built parser implements it; it does not claim complete CommonMark conformance or use a CommonMark AST dependency.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. Where MDCX structural rules are stricter than ordinary Markdown whitespace handling, the MDCX rules below win.

---

### Document Structure

**Front Matter** (optional)

Documents may begin with a YAML directive block delimited by `---`. This block contains document-level metadata.

```mdc
---
type: document
author: Jane Doe
tags: [guide, reference]
---

# Document content starts here
```

**Rules**

- Front matter **must** be the first content in the document (no preceding whitespace or content)
- Opening and closing delimiters are exactly `---` on their own line
- Content is a YAML 1.2 Core mapping of JSON-compatible values, limited to 65,536 UTF-8 bytes and collection depth 16
- Block mappings, sequences, comments, and multiline strings are allowed; aliases, anchors, explicit tags, merge keys, duplicate or non-string keys, and unsafe numeric values are rejected
- Front matter is **optional** — documents can start directly with content blocks
- All content after the closing `---` is treated as page content

---

### Block Annotations

Block annotations attach metadata to the **immediately following** block. The annotation line appears directly above the content it modifies.

**Syntax**:

```
{{ param1: value1, param2: value2 }}
```

**Placement Rules**

- Annotation must be on the line **immediately preceding** its target block
- No blank lines between annotation and block
- Annotation and target must use the same indentation level
- One annotation per block (multiple parameters go in the same annotation)

**Examples**

```mdc
{{ ref: intro-heading }}
# Introduction

{{ type: callout, icon: 💡 }}
This is important information.

- Task one
- Task two
```

### Closing Markers

A closing marker may follow a referenced block as a redundant boundary assertion.

> A closing marker asserts the end of a referenced block. In strict mode it never creates children, changes indentation, merges Markdown blocks, or changes the AST structure determined by block syntax and indentation.

**Syntax**:

```
--{ ref: block-ref }--
```

**Placement Rules**

- The closing marker is optional when parsing
- Its mapping is parsed through the MDCX Annotation Profile
- The mapping must contain exactly one property: a non-empty string `ref`
- The parsed `ref` string must match the block's parsed opening `ref`
- The marker must be at the same indentation level as the block it closes
- It is checked only after the block body and indentation-owned children are parsed
- A valid redundant marker may follow a leaf, table, or layout
- Mismatched, malformed, and orphan markers are errors

**Example**

```mdc
{{ ref: parent }}
- Parent
  {{ ref: child }}
  - Child
--{ ref: parent }--
```

The child is a leaf and needs no marker. A quoted reference is compared as its parsed string value:

```mdc
{{ ref: "section with spaces" }}
# Introduction
--{ ref: "section with spaces" }--
```

Markers cannot repair visible sibling structure. This is invalid in strict mode because the final assertion cannot retroactively make all three list items children of the first:

```mdc
{{ ref: deps }}
- `pydantic` — option parsing
- `blake3` — request ids
- `httpx` — transport
--{ ref: deps }--
```

### Inline Annotations

Inline annotations wrap specific content **within** a line of text. The syntax extends standard Markdown link syntax by appending annotation parameters.

**Basic Syntax** (metadata only)

```jsx
[content]{{ param: value, ... }}
```

**With Markdown Link** (extends standard `[text](url)` syntax)

```jsx
[text](url){{ param: value, ... }}
```

**Empty Content Form**

```jsx
[]{{ type: marker }}
```

Use empty brackets for type-only annotations without visible content.

**Examples**

```mdc
# Metadata-only annotations

The revenue increased by [+12%]{{ trend: positive, delta: 0.12 }}.
Please review the [critical section]{{ color: red, priority: high }}.

# Annotated Markdown links

See [API Documentation](https://acme.com/doc){{ verified: true }}
```

---

### Block Type Inference

Block types are **inferred from Markdown syntax** unless explicitly overridden by a `type` parameter in the annotation.

**Inference Table**

| Markdown Prefix     | Inferred Type        | Example          |
| ------------------- | -------------------- | ---------------- |
| `#`                 | `heading` (depth: 1) | `# Title`        |
| `##`                | `heading` (depth: 2) | `## Section`     |
| `###`               | `heading` (depth: 3) | `### Subsection` |
| `-` or `*`          | `bullet`             | `- Item`         |
| `1.` (number + dot) | `enum`               | `1. First`       |
| `- [ ]`             | `todo` (unchecked)   | `- [ ] Task`     |
| `- [x]`             | `todo` (checked)     | `- [x] Done`     |
| `>`                 | `quote`              | `> Quote text`   |
| Fenced code         | `code`               | ` ```ts `        |
| Pipe-delimited rows | `table` or `layout`  | A/B columns      |
| _(none)_            | `paragraph`          | Plain text       |

**Explicit Override**

```mdc
{{ type: callout, icon: ⚠️ }}
This paragraph becomes a callout block.
```

### Inline Type Inference

Inline content is parsed into typed AST nodes based on Markdown syntax. Formats can be combined (nested) and annotations can be appended to any inline element.

**Inference Table**

| Markdown Syntax          | Inferred AST Node                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `plain text`             | `{ type: 'text', text: '...' }`                                                               |
| `**bold**`               | `{ type: 'text', formats: ['bold'] }`                                                         |
| `*italic*` or `_italic_` | `{ type: 'text', formats: ['italic'] }`                                                       |
| `~~strikethrough~~`      | `{ type: 'text', formats: ['strikethrough'] }`                                                |
| `code`                   | `{ type: 'text', formats: ['code'] }`                                                         |
| `**_bold italic_**`      | `{ type: 'text', formats: ['bold', 'italic'] }`                                               |
| `[text](url)`            | `{ type: 'link', caption: [{ type: 'text', text: '...' }], link: '...' }`                     |
| `[content]{{ ... }}`     | `{ type: 'meta', caption: [{ type: 'text', text: '...' }], annotations: {...} }`              |
| `[text](url){{ ... }}`   | `{ type: 'link', caption: [{ type: 'text', text: '...' }], link: '...', annotations: {...} }` |

**Format Combinations**

Formats can be nested to create combined styling. The `formats` array contains all applied formats:

```tsx
// Input: **_bold and italic_**
{ type: 'text', text: 'bold and italic', formats: ['bold', 'italic'] }

// Input: ~~**strikethrough bold**~~
{ type: 'text', text: 'strikethrough bold', formats: ['strikethrough', 'bold'] }

// Input: [**bold link**](url)
{ type: 'link', caption: [{ type: 'text', text: 'bold link', formats: ['bold'] }], link: 'url' }
```

**Annotations**

- `[caption]{{ ... }}` always produces a `meta` node; a `type` key remains metadata in `annotations`
- Formatting belongs to text nodes inside the annotation caption:

  ```tsx
  // Input: [**important**]{{ priority: high }}
  { type: 'meta', caption: [{ type: 'text', text: 'important', formats: ['bold'] }], annotations: { priority: 'high' } }

  // Input: [Click here](url){{ ref: cta-link }}
  { type: 'link', caption: [{ type: 'text', text: 'Click here' }], link: 'url', annotations: { ref: 'cta-link' } }
  ```

---

### MDCX Annotation Profile

The MDCX Annotation Profile applies to block annotations, inline annotations, trailing link/media annotations, and closing-marker mappings. Front matter uses the same safe YAML value constraints with a separate block-style profile and a 65,536-byte limit.

Every annotation is one single-line YAML 1.2 Core flow mapping with string keys and JSON-compatible resulting values. The complete mapping, including braces, may contain at most 16,384 encoded UTF-8 bytes. The root mapping is depth 1; each nested mapping or sequence adds one level; depth 16 is valid and depth 17 is rejected.

**Supported Value Types**

| Type                | Syntax                      | Example                    |
| ------------------- | --------------------------- | -------------------------- |
| **Unquoted String** | No spaces or special chars  | `color: red`               |
| **Quoted String**   | Single or double quotes     | `title: 'Hello World'`     |
| **Number**          | Integer or float            | `count: 42`, `ratio: 3.14` |
| **Boolean**         | `true` / `false` (unquoted) | `collapsed: true`          |
| **Array**           | Square bracket notation     | `tags: [a, b, c]`          |
| **Null**            | `null` or `~`               | `value: null`              |
| **Object**          | Flow mapping                | `style: { color: red }`    |

Nested mappings and sequences are supported, and mapping delimiters inside quoted strings do not end an annotation:

```mdc
{{ equation: "x^{n}", style: { color: red, font: { weight: 700 } } }}
$$ x^n $$
```

The profile rejects block-style or multiline syntax, YAML directives, explicit tags, anchors, aliases, merge keys, cycles, duplicate or non-string keys, comments, non-finite numbers, unsafe unquoted integers, and primitive, sequence, or null roots. Large integer identifiers must be quoted as strings:

```mdc
{{ externalId: "9007199254740993" }}
```

`type` and `ref`, when present, must be non-empty strings. Canonical annotation output is a single flow mapping with top-level keys ordered `type`, `ref`, `title`, then lexicographically; nested object keys are sorted lexicographically.

### Rich Text Formatting

MDCX supports the Markdown inline formatting below. These forms can be combined with inline annotations.

| Format            | Syntax               | Output      |
| ----------------- | -------------------- | ----------- |
| **Bold**          | `**text**`           | **text**    |
| _Italic_          | `_text_` or `*text*` | _text_      |
| ~~Strikethrough~~ | `~~text~~`           | ~~text~~    |
| `Inline code`     | `code`               | `code`      |
| Link              | `[text](url)`        | [text](url) |

**Combining with Annotations**:

```mdc
The **[critical value]{{ severity: high }}** must not be exceeded.
```

---

### Nesting & Indentation

Child blocks are defined by **exact structural indentation**. Strict mode is the default.

**Indentation Rules**:

- Use exactly **2 spaces** per indentation level
- Tabs are forbidden anywhere outside opaque fenced-code content
- Odd leading indentation is an error rather than residual paragraph content
- Children must be indented exactly one level deeper than their parent
- Skipped indentation levels are errors
- Dedentation may return to any existing ancestor level

**Example**:

```mdc
{{ type: callout, icon: 📌 }}
Important notice
  This paragraph is a child of the callout.

  - And this list is also inside the callout
    - Nested list item
```

**Resulting Structure**:

```
callout
├── content ("Important notice")
├── paragraph ("This paragraph is a child...")
└── bullet
    └── bullet (nested)
```

**Explicit Recovery**: Recovery requires `mode: 'recover'` and an `onDiagnostic` callback. It applies deterministic repairs in this order: leading tabs become two spaces each; odd leading spaces round down; a uniquely paired referenced child may be promoted within uniquely paired parent boundaries; and a skipped level clamps to one level below the current parent. Every repair emits a warning with a stable code, source range, message, and original/normalized state. Ambiguous markers, non-leading tabs, malformed annotations, unreferenced siblings, and ordinary same-indent blocks are not repaired.

**Empty Blocks**: A canonical empty block is a typed annotation-only declaration:

```mdc
{{ type: paragraph, ref: empty-paragraph }}
```

`type` is mandatory. The declaration may be followed by EOF, a blank separator, or its parent's closing marker. An untyped orphan annotation is an error, and canonical stringification inserts a blank separator before a following sibling.

**List Structure**: Each list item is a direct `bullet` or `enum` node. Consecutive items remain siblings; indentation attaches nested items through `children`:

```mdc
- Parent item
  - Child item
    - Grandchild item
```

Produces:

```
bullet ("Parent item")
└── bullet ("Child item")
    └── bullet ("Grandchild item")
```

---

### Tables and Layouts

MDCX uses pipe-delimited syntax for both tables and layouts. The **presence of a separator row** distinguishes between them.

**Table** (with separator row):

```mdc
| Name  | Score |
| ----- | ----- |
| Alice | 95    |
| Bob   | 87    |
```

**Layout** (without separator row):

```mdc
| Column 1 | Column 2 |
| Content A | Content B |
```

**Distinction**:

- **Table**: Pipe syntax with a separator row (`|---|---|`) creates a `TableNode` with `headers` and data `children`
- **Layout**: Pipe syntax without a separator row creates a `LayoutNode` with `column` children

**Table Alignment**:

Use colons in the separator row to specify column alignment:

| Syntax  | Alignment      |
| ------- | -------------- |
| `---`   | Default (none) |
| `:---`  | Left           |
| `:---:` | Center         |
| `---:`  | Right          |

**Example with Alignment**:

```mdc
| Left | Center | Right |
| :--- | :----: | ----: |
| A    |   B    |     C |
```

Produces a table where:

- Header 1 has `annotations.alignment: 'left'`
- Header 2 has `annotations.alignment: 'center'`
- Header 3 has `annotations.alignment: 'right'`

**Layout with Annotations**:

Layouts support column-level annotations:

```mdc
{{ type: layout }}
| {{ ref: col1 }} | {{ ref: col2 }} |
| Content A | Content B |
```

Rows, cells, headers, and columns are intrinsic structures. Referenced tables and layouts do not receive automatic closing markers under the default `auto` policy, although a valid manually authored marker remains an accepted assertion.

---

### Escaping Special Characters

Escape MDCX-specific characters with a backslash to render them literally.

| To Display | Write As   | Context                   |
| ---------- | ---------- | ------------------------- |
| `\{\{`     | `\\\{\\\{` | Prevent annotation open   |
| `\}\}`     | `\\\}\\\}` | Prevent annotation close  |
| `\[`       | `\\\[`     | Prevent inline annotation |
| `\]`       | `\\\]`     | Prevent inline annotation |
| `\\`       | `\\\\`     | Literal backslash         |

**Code Fence Exception**: Content inside fenced code blocks is **parser-opaque** — no escaping required.

```jsx
// No escaping needed inside code fences
const annotation = `{ type: 'callout', icon: '💡' }`;
const brackets = `[content]{{ param: value }}`;
```

---

### Standard Annotation Parameters

These parameters are recognized by the core MDCX specification.

**Block Parameters**:

| Parameter | Type   | Description                                                 |
| --------- | ------ | ----------------------------------------------------------- |
| `ref`     | string | Unique identifier for the block (used for diffing, linking) |
| `type`    | string | Explicit block type override (e.g., `callout`, `toggle`)    |

**Inline Parameters**:

| Parameter | Type                  | Description                                                 |
| --------- | --------------------- | ----------------------------------------------------------- |
| `type`    | string                | Metadata retained in `annotations`; the node remains `meta` |
| _(any)_   | JSON-compatible value | Arbitrary domain-specific metadata                          |

---

### Canonical Stringification

`closingMarkers` accepts three policies:

| Policy | Behavior                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `auto` | Default. Emit a marker only for a referenced block whose generic children are rendered by structural indentation.          |
| `all`  | Emit a marker for every referenced externally serialized block, including leaves, tables, layouts, and typed empty blocks. |
| `none` | Emit no closing markers.                                                                                                   |

Under `auto`, referenced leaf paragraphs, headings, code blocks, equations, dividers, tables, and layouts receive no marker. Referenced paragraphs, bullets, and custom blocks with generic indentation-owned children do. Intrinsic row, cell, header, and column nodes never emit their own marker. Suppressing block annotations also suppresses matching markers.

### Round-Trip Contracts

Semantic AST round trip:

```text
parse(stringify(ast)) ≡ normalize(ast)
```

`≡` ignores source ranges, materializes parser defaults, normalizes inferred versus explicitly serialized native types, and treats absent and empty annotation objects consistently. Block type, `ref`, content, semantic annotations, child order and hierarchy, and intrinsic table/layout structure remain significant.

Canonical source round trip:

```text
stringify(parse(source)) = canonicalize(source)
canonicalize(source) := stringify(parse(source))
```

Canonicalization may normalize annotation key order and quoting, whitespace, table padding, ordered-list markers, optional leaf markers, and automatic parent-marker placement. MDCX's semantic AST pipeline is not byte-for-byte source-lossless: original YAML quote style and key order, comments, arbitrary whitespace, table padding, and canonicalized ordered-list numbering are not preserved.

### Error Behavior

Parsing uses the stable codes `MDCX_ANNOTATION_INVALID`, `MDCX_ANNOTATION_PROFILE_VIOLATION`, `MDCX_CLOSING_MARKER_INVALID`, `MDCX_CLOSING_MARKER_MISMATCH`, `MDCX_INDENTATION_INVALID`, and `MDCX_RECOVERY_CONFIGURATION_INVALID`. Errors identify the expected contract and offending annotation, ref, or indentation and include line and column when available. Recovery is mentioned only when that exact problem has a deterministic repair.

---

### Grammar Summary (EBNF-like)

```ebnf
document               ::= front_matter? block*
block                  ::= block_annotation? block_body block_end?
                         | empty_block
block_annotation       ::= '{{' flow_mapping_content '}}' NEWLINE
typed_block_annotation ::= '{{' typed_flow_mapping_content '}}' NEWLINE?
empty_block            ::= typed_block_annotation
block_body             ::= block_content children?
children               ::= (exact_child_indent block)+
block_end              ::= '--' closing_mapping '--' NEWLINE?
closing_mapping        ::= flow_mapping
                           (* exactly one non-empty string property: ref *)
flow_mapping           ::= '{' flow_mapping_content '}'
                           (* MDCX Annotation Profile restrictions apply *)
exact_child_indent     ::= parent_indent '  '
```

The outer `{{ ... }}` block annotation contains the YAML flow-mapping content. The shared annotation machinery receives the complete `{ ... }` mapping; a closing marker directly contains that complete single-brace mapping.

---

### Quick Reference Card

**Document**

```
---
front: matter
---
```

**Block Annotation**

```
{{ param: value }}
# Content
```

**Inline Annotation**

```
[content]{{ param: value }}
```

**Nesting**

```
Parent block
  Child block (2 spaces)
    Grandchild (4 spaces)
```

**Closing Assertion**

```
--{ ref: parent }--
```

**Empty Block**

```
{{ type: paragraph, ref: empty }}
```

Literal annotation-shaped text belongs inside an opaque fenced code block.
