import { describe, expect, it } from 'vitest';

import { tokenize } from '#lexer/tokenize';
import { parse } from '#parse';
import { buildMarkerIndex } from '#parser/marker-index';
import {
  recoverSourceIndentation,
  translatedRange,
} from '#parser/recovery-source';
import { recoverMarkerScopes } from '#parser/recovery-tokens';

import type { ParseDiagnostic } from '#parser/types';
import type { Range } from '#types';

function recover(source: string) {
  const diagnostics: ParseDiagnostic[] = [];
  const ast = parse(source, {
    mode: 'recover',
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  return { ast, diagnostics };
}

function indentationRange(
  line: number,
  offset: number,
  prefixLength: number,
): Range {
  return {
    start: { line, column: 1, offset },
    end: { line, column: prefixLength + 1, offset: offset + prefixLength },
  };
}

describe('parse recovery', () => {
  it('should require an explicit diagnostic callback', () => {
    expect(() =>
      parse('Content', { mode: 'recover' } as Parameters<typeof parse>[1]),
    ).toThrow(
      expect.objectContaining({
        code: 'MDC_RECOVERY_CONFIGURATION_INVALID',
      }),
    );
  });

  it('should replace a leading indentation tab and reports the exact repair', () => {
    const { ast, diagnostics } = recover('Parent\n\tChild');

    expect(ast.children[0]?.children).toMatchObject([
      {
        type: 'paragraph',
        content: [{ text: 'Child' }],
        range: { start: { line: 2, column: 2, offset: 8 } },
      },
    ]);
    expect(diagnostics).toEqual([
      {
        code: 'MDC_TAB_INDENT_RECOVERED',
        severity: 'warning',
        message:
          'Leading indentation tabs were replaced with two spaces per tab.',
        range: indentationRange(2, 7, 1),
        change: { from: { text: '\t' }, to: { text: '  ' } },
      },
    ]);
  });

  it('should replace every leading tab with two spaces', () => {
    const { ast, diagnostics } = recover(
      ['Parent', '  Child', '\t\tGrandchild'].join('\n'),
    );

    expect(ast.children[0]?.children?.[0]?.children).toMatchObject([
      { content: [{ text: 'Grandchild' }] },
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'MDC_TAB_INDENT_RECOVERED',
        change: { from: { text: '\t\t' }, to: { text: '    ' } },
      }),
    ]);
  });

  it('should round odd indentation down and reports the exact repair', () => {
    const { ast, diagnostics } = recover('Parent\n   Child');

    expect(ast.children[0]?.children).toHaveLength(1);
    expect(diagnostics).toEqual([
      {
        code: 'MDC_ODD_INDENT_RECOVERED',
        severity: 'warning',
        message: 'Odd indentation was rounded down from 3 to 2 spaces.',
        range: indentationRange(2, 7, 3),
        change: { from: { text: '   ' }, to: { text: '  ' } },
      },
    ]);
  });

  it('should report tab replacement before odd-space rounding', () => {
    const { diagnostics } = recover('Parent\n\t Child');

    expect(diagnostics).toEqual([
      {
        code: 'MDC_TAB_INDENT_RECOVERED',
        severity: 'warning',
        message:
          'Leading indentation tabs were replaced with two spaces per tab.',
        range: indentationRange(2, 7, 2),
        change: { from: { text: '\t ' }, to: { text: '   ' } },
      },
      {
        code: 'MDC_ODD_INDENT_RECOVERED',
        severity: 'warning',
        message: 'Odd indentation was rounded down from 3 to 2 spaces.',
        range: indentationRange(2, 7, 2),
        change: { from: { text: '   ' }, to: { text: '  ' } },
      },
    ]);
  });

  it('should complete the tab phase before odd-space repairs on other lines', () => {
    const { diagnostics } = recover(
      ['Parent', '   Odd child', '\tTabbed child'].join('\n'),
    );

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'MDC_TAB_INDENT_RECOVERED',
      'MDC_ODD_INDENT_RECOVERED',
    ]);
  });

  it('should clamp a skipped indentation level and reports the exact repair', () => {
    const { ast, diagnostics } = recover('Parent\n    Child');

    expect(ast.children[0]?.children).toHaveLength(1);
    expect(diagnostics).toEqual([
      {
        code: 'MDC_SKIPPED_INDENT_RECOVERED',
        severity: 'warning',
        message: 'Skipped indentation was clamped from level 2 to level 1.',
        range: indentationRange(2, 7, 4),
        change: { from: { indent: 2 }, to: { indent: 1 } },
      },
    ]);
  });

  it('should clamp an annotated block as one unit with one diagnostic', () => {
    const source = ['Parent', '    {{ ref: child }}', '    Child'].join('\n');
    const { ast, diagnostics } = recover(source);

    expect(ast.children[0]?.children).toMatchObject([{ ref: 'child' }]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'MDC_SKIPPED_INDENT_RECOVERED',
      change: { from: { indent: 2 }, to: { indent: 1 } },
    });
  });

  it('should promote a uniquely paired referenced child interval', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'Child',
      '--{ ref: child }--',
      '--{ ref: parent }--',
    ].join('\n');
    const { ast, diagnostics } = recover(source);

    expect(ast.children).toMatchObject([
      {
        ref: 'parent',
        children: [{ ref: 'child', content: [{ text: 'Child' }] }],
      },
    ]);
    expect(diagnostics).toEqual([
      {
        code: 'MDC_MARKER_SCOPE_RECOVERED',
        severity: 'warning',
        message:
          'Referenced child "child" was promoted from level 0 to level 1 within unambiguous marker boundaries.',
        range: {
          start: { line: 3, column: 1, offset: 25 },
          end: { line: 3, column: 17, offset: 41 },
        },
        change: { from: { indent: 0 }, to: { indent: 1 } },
      },
    ]);
  });

  it('should apply all recovery categories in normative order', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '\t Auxiliary',
      '{{ ref: child }}',
      'Child',
      '--{ ref: child }--',
      '--{ ref: parent }--',
      '    Root sibling',
    ].join('\n');
    const { diagnostics } = recover(source);

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'MDC_TAB_INDENT_RECOVERED',
      'MDC_ODD_INDENT_RECOVERED',
      'MDC_MARKER_SCOPE_RECOVERED',
      'MDC_SKIPPED_INDENT_RECOVERED',
    ]);
  });

  it('should shift a promoted child interval without flattening its descendants', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'Child',
      '  Grandchild',
      '--{ ref: child }--',
      '--{ ref: parent }--',
    ].join('\n');
    const { ast, diagnostics } = recover(source);

    expect(ast.children[0]?.children?.[0]).toMatchObject({
      ref: 'child',
      children: [{ content: [{ text: 'Grandchild' }] }],
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('MDC_MARKER_SCOPE_RECOVERED');
  });

  it('should shift deeply nested marker intervals with one token write each', () => {
    const depth = 64;
    const openings = Array.from({ length: depth }, (_, index) => [
      `{{ ref: level-${index} }}`,
      `Level ${index}`,
    ]).flat();
    const closings = Array.from(
      { length: depth },
      (_, index) => `--{ ref: level-${depth - index - 1} }--`,
    );
    const source = recoverSourceIndentation(
      [...openings, ...closings].join('\n'),
      () => undefined,
    );
    const tokens = tokenize(source.source);
    let indentWrites = 0;
    for (const token of tokens) {
      let indent = token.indent;
      Object.defineProperty(token, 'indent', {
        configurable: true,
        get: () => indent,
        set: (value: number) => {
          indentWrites += 1;
          indent = value;
        },
      });
    }
    const diagnostics: ParseDiagnostic[] = [];

    recoverMarkerScopes({
      tokens,
      source,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(indentWrites).toBeLessThanOrEqual(tokens.length);
    expect(diagnostics).toHaveLength(depth - 1);
    expect(diagnostics.at(0)?.change).toEqual({
      from: { indent: 0 },
      to: { indent: 1 },
    });
    expect(diagnostics.at(-1)?.change).toEqual({
      from: { indent: depth - 2 },
      to: { indent: depth - 1 },
    });
  });

  it('should accept a canonical referenced leaf without a redundant leaf marker', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '  {{ ref: child }}',
      '  Child',
      '--{ ref: parent }--',
    ].join('\n');
    const { ast, diagnostics } = recover(source);

    expect(ast.children[0]?.children).toMatchObject([{ ref: 'child' }]);
    expect(diagnostics).toEqual([]);
  });

  it('should not promote an already correctly indented marker interval', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '  {{ ref: child }}',
      '  Child',
      '  --{ ref: child }--',
      '--{ ref: parent }--',
    ].join('\n');

    expect(recover(source).diagnostics).toEqual([]);
  });

  it('should reject duplicate marker candidates instead of choosing one', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'First',
      '--{ ref: child }--',
      '{{ ref: child }}',
      'Second',
      '--{ ref: child }--',
      '--{ ref: parent }--',
    ].join('\n');

    expect(() => recover(source)).toThrow(
      expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }),
    );
  });

  it('should reject a closing marker without a matching opening candidate', () => {
    expect(() => buildMarkerIndex(tokenize('--{ ref: orphan }--'))).toThrow(
      /unique opening and closing marker/,
    );
  });

  it('should reject crossing marker intervals', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'Child',
      '--{ ref: parent }--',
      '--{ ref: child }--',
    ].join('\n');

    expect(() => recover(source)).toThrow(
      expect.objectContaining({ code: 'MDC_CLOSING_MARKER_INVALID' }),
    );
  });

  it('should not recover an incompletely paired referenced child', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      '{{ ref: child }}',
      'Child',
      '--{ ref: parent }--',
    ].join('\n');

    expect(() => recover(source)).toThrow();
  });

  it('should not promote ordinary unreferenced siblings', () => {
    const source = [
      '{{ ref: parent }}',
      'Parent',
      'Sibling',
      '--{ ref: parent }--',
    ].join('\n');

    expect(() => recover(source)).toThrow(
      expect.objectContaining({ code: 'MDC_CLOSING_MARKER_MISMATCH' }),
    );
  });

  it('should not merge ordinary same-indent blocks', () => {
    const source = [
      '{{ ref: deps }}',
      '- first',
      '- second',
      '- third',
      '--{ ref: deps }--',
    ].join('\n');

    expect(() => recover(source)).toThrow(
      expect.objectContaining({ code: 'MDC_CLOSING_MARKER_MISMATCH' }),
    );
  });

  it('should still reject a non-leading tab outside fenced code', () => {
    expect(() => recover('Content\tcontinued')).toThrow(
      expect.objectContaining({ code: 'MDC_INDENTATION_INVALID' }),
    );
  });

  it('should not repair malformed annotations', () => {
    const diagnostics: ParseDiagnostic[] = [];

    expect(() =>
      parse('{{ value: .nan }}\nContent', {
        mode: 'recover',
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).toThrow(
      expect.objectContaining({ code: 'MDC_ANNOTATION_PROFILE_VIOLATION' }),
    );
    expect(diagnostics).toEqual([]);
  });

  it('should preserve tabs inside opaque fenced code without diagnostics', () => {
    const { ast, diagnostics } = recover('```typescript\n\tcode();\n```');

    expect(ast.children[0]).toMatchObject({
      type: 'code',
      content: [{ text: '\tcode();' }],
    });
    expect(diagnostics).toEqual([]);
  });

  it('should keep front matter opaque during source indentation recovery', () => {
    const diagnostics: ParseDiagnostic[] = [];
    const result = recoverSourceIndentation(
      ['---', '\topaque', '---', '\tChild'].join('\n'),
      (diagnostic) => diagnostics.push(diagnostic),
    );

    expect(result.source).toBe(
      ['---', '\topaque', '---', '  Child'].join('\n'),
    );
    expect(diagnostics.map(({ code }) => code)).toEqual([
      'MDC_TAB_INDENT_RECOVERED',
    ]);
  });

  it('should preserve positions inside a normalized indentation prefix', () => {
    const source = recoverSourceIndentation('\tChild', () => undefined);
    const range = {
      start: { line: 1, column: 2, offset: 1 },
      end: { line: 1, column: 2, offset: 1 },
    };

    expect(translatedRange(range, source.lines)).toEqual(range);
  });

  it('should clamp an intrinsic table row run as one block unit', () => {
    const { ast, diagnostics } = recover(
      [
        'Parent',
        '    | Name | Score |',
        '    | ---- | ----- |',
        '    | Alice | 95 |',
      ].join('\n'),
    );

    expect(ast.children[0]?.children?.[0]?.type).toBe('table');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('MDC_SKIPPED_INDENT_RECOVERED');
  });

  it('should end an intrinsic row run before a following ordinary block', () => {
    const { ast, diagnostics } = recover('| A |\nAfter');

    expect(ast.children).toHaveLength(2);
    expect(diagnostics).toEqual([]);
  });

  it('should group an annotated intrinsic row as one recovery unit', () => {
    const { ast, diagnostics } = recover('{{ ref: table }}\n| A |');

    expect(ast.children).toMatchObject([{ type: 'layout', ref: 'table' }]);
    expect(diagnostics).toEqual([]);
  });

  it('should reject malformed annotation token sequences in the marker index', () => {
    const tokens = tokenize('{{ ref: child }}\nChild');

    expect(() => buildMarkerIndex(tokens.slice(0, 2))).toThrow(
      /token sequence is incomplete/,
    );

    const wrongContent = tokens.map((token) => ({ ...token }));
    const contentToken = wrongContent[1];
    if (contentToken === undefined) {
      throw new Error('Expected an annotation content token.');
    }
    contentToken.type = 'CONTENT';
    expect(() => buildMarkerIndex(wrongContent)).toThrow(
      /token sequence is incomplete/,
    );
  });

  it('should reject a recovery closing marker that precedes its opening', () => {
    const tokens = tokenize(
      ['--{ ref: child }--', '{{ ref: child }}', 'Child'].join('\n'),
    );

    expect(() => buildMarkerIndex(tokens)).toThrow(/must follow its opening/);
  });
});
