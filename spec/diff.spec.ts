import { describe, it, expect } from 'vitest';

import { diff } from '#diff';
import { parse } from '#parse';

// TEST SUITES //

describe('fn:diff', () => {
  it('should return empty operations for identical ASTs', () => {
    const ast = parse(['# Title', '', 'Paragraph'].join('\n'));

    const result = diff(ast, ast);

    expect(result.operations).toEqual([]);
    expect(result.virtuals).toEqual({});
    expect(result.summary).toEqual({
      inserts: 0,
      deletes: 0,
      updates: 0,
      moves: 0,
    });
    expect(result.sourceAst).toMatchObject({
      type: 'document',
      children: [
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'paragraph' }),
      ],
    });
    expect(result.targetAst).toMatchObject({
      type: 'document',
      children: [
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'paragraph' }),
      ],
    });
    expect(result.sourceAst.children[0]?.ref).toBe(
      result.targetAst.children[0]?.ref,
    );
    expect(result.sourceAst.children[1]?.ref).toBe(
      result.targetAst.children[1]?.ref,
    );
    expect(result.sourceAst).not.toBe(ast);
    expect(result.targetAst).not.toBe(ast);
  });

  it('should reconcile a missing target ref from the canonical source AST', () => {
    const astA = parse(['{{ ref: source-ref }}', 'Original text'].join('\n'));
    const astB = parse('Updated text');

    const result = diff(astA, astB);

    expect(result.sourceAst.children[0]?.ref).toBe('source-ref');
    expect(result.targetAst.children[0]?.ref).toBe('source-ref');
    expect(astB.children[0]?.ref).toBeUndefined();
    expect(result.operations).toMatchObject([
      {
        type: 'update',
        ref: 'source-ref',
      },
    ]);
  });

  it('should assign the same temporary ref to matched ref-less blocks', () => {
    const astA = parse('Same text');
    const astB = parse('Same text');

    const result = diff(astA, astB);
    const sourceRef = result.sourceAst.children[0]?.ref;
    const targetRef = result.targetAst.children[0]?.ref;

    expect(sourceRef).toMatch(/^#/);
    expect(targetRef).toBe(sourceRef);
    expect(astA.children[0]?.ref).toBeUndefined();
    expect(astB.children[0]?.ref).toBeUndefined();
  });

  it('should keep summary counts on the Diff', () => {
    const astA = parse(['# Title', '', 'Paragraph'].join('\n'));
    const astB = parse(['# Title', '', 'Paragraph', '', 'Added'].join('\n'));

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      summary: {
        inserts: 1,
        deletes: 0,
        updates: 0,
        moves: 0,
      },
    });
  });

  describe('change granularity', () => {
    it('should detect changes at paragraph level inside columns', () => {
      const astA = parse(`---
title: e2e:column-modify
ref: 2f0b2572-f788-815c-ad4c-ca3a2864c1a0
---

{{ type: layout, ratios: "1,1", ref: 2f0b2572-f788-811f-9f74-ebfccd84b9a5 }}
| {{ type: column, ref: 2f0b2572-f788-81b5-9353-e1c992fe40a6 }} | {{ type: column, ref: 2f0b2572-f788-81f7-a7ff-c967a95eedde }} |
| Original left text                                            | Original right text                                           |`);

      const astB = parse(`---
title: e2e:column-modify
ref: 2f0b2572-f788-815c-ad4c-ca3a2864c1a0
---

{{ type: layout, ratios: "1,1", ref: 2f0b2572-f788-811f-9f74-ebfccd84b9a5 }}
| {{ type: column, ref: 2f0b2572-f788-81b5-9353-e1c992fe40a6 }} | {{ type: column, ref: 2f0b2572-f788-81f7-a7ff-c967a95eedde }} |
| Modified left text                                            | Original right text                                           |`);

      const result = diff(astA, astB);

      // change detected at paragraph level, not column or layout level
      expect(result.operations).toHaveLength(1);
      const updateOp = result.operations[0];
      expect(updateOp?.type).toEqual('update');
      if (updateOp?.type === 'update') {
        expect(updateOp.old.type).toEqual('paragraph');
        expect(updateOp.new.type).toEqual('paragraph');
      }
      expect(result.summary.updates).toEqual(1);
    });

    it('should detect changes at cell level inside table rows', () => {
      const astA = parse(`{{ ref: table1 }}
| A | B | C |
|---|---|---|
| 1 | 2 | 3 |`);

      const astB = parse(`{{ ref: table1 }}
| A | B | C |
|---|---|---|
| 1 | X | 3 |`);

      const result = diff(astA, astB);

      // change detected at cell level, not row or table level
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]).toMatchObject({
        type: 'update',
        old: expect.objectContaining({ type: 'cell' }),
        new: expect.objectContaining({ type: 'cell' }),
      });
    });

    it('should not report parent as changed when only children change', () => {
      // layout with two columns - only one column's content changes
      const astA = parse(`{{ type: layout, ref: layout1 }}
| {{ type: column, ref: col1 }} | {{ type: column, ref: col2 }} |
| Original A                    | Original B                    |`);

      const astB = parse(`{{ type: layout, ref: layout1 }}
| {{ type: column, ref: col1 }} | {{ type: column, ref: col2 }} |
| Modified A                    | Original B                    |`);

      const result = diff(astA, astB);

      // only the paragraph content changed, not the layout or columns
      expect(result.summary.updates).toEqual(1);
      const updateOp = result.operations.find((op) => op.type === 'update');
      expect(updateOp).toBeDefined();
      if (updateOp?.type === 'update') {
        expect(updateOp.old.type).toEqual('paragraph');
        // parent refs should include the column ref
        expect(updateOp.parentRefs).toContain('col1');
      }
    });

    it('should ignore range changes when content is identical', () => {
      // when a cell before another cell changes length, the following cells
      // have shifted ranges but identical content - no update should be reported
      const astA = parse(`{{ ref: table1 }}
| A | B |
|---|---|
| Short | Text |`);

      const astB = parse(`{{ ref: table1 }}
| A | B |
|---|---|
| Very long content here | Text |`);

      const result = diff(astA, astB);

      // only the first cell changed, the second cell ("Text") should not be updated
      // even though its range shifted
      expect(result.summary.updates).toEqual(1);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]).toMatchObject({
        type: 'update',
        old: expect.objectContaining({ type: 'cell' }),
        new: expect.objectContaining({ type: 'cell' }),
      });
    });

    it('should auto-generate virtual refs for positional table rows and resolve them in virtuals', () => {
      const astA = parse(`{{ ref: table1 }}
| A | B |
|---|---|
| Original | Keep |`);

      const astB = parse(`{{ ref: table1 }}
| A | B |
|---|---|
| Modified | Keep |`);

      const result = diff(astA, astB);
      const cellUpdate = result.operations.find(
        (op) =>
          op.type === 'update' &&
          op.old.type === 'cell' &&
          op.new.type === 'cell',
      );

      expect(cellUpdate).toBeDefined();
      if (cellUpdate?.type === 'update') {
        // the row's virtual ref should be in parentRefs
        const virtualRowRef = cellUpdate.parentRefs.at(-1);
        expect(virtualRowRef).toBeDefined();
        expect(virtualRowRef).toMatch(/^#[a-z0-9]+$/);

        // virtuals map should resolve it to the source row node
        expect(result.virtuals[virtualRowRef!]).toBeDefined();
        expect(result.virtuals[virtualRowRef!]?.type).toBe('row');
      }
    });
  });

  it('should compute summary counts', () => {
    const astA = parse('# Title');
    const astB = parse(['# Title', '', 'New paragraph'].join('\n'));

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      operations: [
        expect.objectContaining({
          type: 'insert',
          path: ['children', 1],
          node: expect.objectContaining({ type: 'paragraph' }),
          parentRefs: [],
          // afterRef is now generated as virtual ref of preceding sibling
          afterRef: expect.stringMatching(/^#[a-z0-9]+$/),
        }),
      ],
      summary: {
        inserts: 1,
        deletes: 0,
        updates: 0,
        moves: 0,
      },
    });
  });

  it('should detect all operation types', () => {
    const astA = parse(
      ['{{ ref: a }}', 'First', '', '{{ ref: b }}', 'Old'].join('\n'),
    );
    const astB = parse(
      ['{{ ref: b }}', 'New', '', '{{ ref: a }}', 'First', '', 'Added'].join(
        '\n',
      ),
    );

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      operations: expect.arrayContaining([
        expect.objectContaining({
          type: 'insert',
          parentRefs: [],
        }),
        expect.objectContaining({
          type: 'update',
          ref: 'b',
          parentRefs: [],
        }),
        expect.objectContaining({
          type: 'move',
          ref: 'a',
          fromParentRefs: [],
          toParentRefs: [],
          toAfterRef: 'b',
        }),
        expect.objectContaining({
          type: 'move',
          ref: 'b',
          fromParentRefs: [],
          toParentRefs: [],
        }),
      ]),
      virtuals: expect.any(Object),
      summary: {
        inserts: 1,
        deletes: 0,
        updates: 1,
        moves: 2,
      },
    });
  });

  it('should work with complex documents', () => {
    // With list wrapping, structure is:
    // [0] heading, [1] paragraph, [2] list (with items), [3] quote
    const astA = parse(
      [
        '# Title',
        '',
        'Paragraph one',
        '',
        '- Item 1',
        '- Item 2',
        '',
        '> Quote',
      ].join('\n'),
    );

    const astB = parse(
      [
        '# Title',
        '',
        'Paragraph one modified',
        '',
        '- Item 1',
        '- Item 3',
        '',
        '> Quote',
        '',
        'New paragraph',
      ].join('\n'),
    );

    const result = diff(astA, astB);

    // Updates: paragraph content changed, list content changed (item 2 -> 3)
    // Inserts: new paragraph at end
    expect(result.summary).toEqual({
      inserts: 1,
      deletes: 0,
      updates: 2,
      moves: 0,
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'update',
          path: ['children', 1],
          old: expect.objectContaining({ type: 'paragraph' }),
          new: expect.objectContaining({ type: 'paragraph' }),
          from: {
            content: [
              expect.objectContaining({ type: 'text', text: 'Paragraph one' }),
            ],
          },
          to: {
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'Paragraph one modified',
              }),
            ],
          },
          parentRefs: [],
        }),
        expect.objectContaining({
          type: 'update',
          path: ['children', 3],
          old: expect.objectContaining({ type: 'bullet' }),
          new: expect.objectContaining({ type: 'bullet' }),
          from: {
            content: [
              expect.objectContaining({ type: 'text', text: 'Item 2' }),
            ],
          },
          to: {
            content: [
              expect.objectContaining({ type: 'text', text: 'Item 3' }),
            ],
          },
          parentRefs: [],
        }),
        expect.objectContaining({
          type: 'insert',
          path: ['children', 5],
          node: expect.objectContaining({
            type: 'paragraph',
            content: [
              expect.objectContaining({ type: 'text', text: 'New paragraph' }),
            ],
          }),
          parentRefs: [],
        }),
      ]),
    );

    // the bullet item update - flat at document level (children[3] is second bullet)
    // structure: heading[0], paragraph[1], bullet[2], bullet[3], quote[4]
    expect(result.operations).toContainEqual(
      expect.objectContaining({
        type: 'update',
        path: ['children', 3],
        old: expect.objectContaining({ type: 'bullet' }),
        new: expect.objectContaining({ type: 'bullet' }),
        from: {
          content: [expect.objectContaining({ type: 'text', text: 'Item 2' })],
        },
        to: {
          content: [expect.objectContaining({ type: 'text', text: 'Item 3' })],
        },
      }),
    );

    expect(result.operations).toContainEqual(
      expect.objectContaining({
        type: 'insert',
        path: ['children', 5],
        node: expect.objectContaining({ type: 'paragraph' }),
        parentRefs: [],
      }),
    );
  });

  it('should handle empty documents', () => {
    const astA = parse('');
    const astB = parse('');

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      operations: [],
      virtuals: {},
      summary: {
        inserts: 0,
        deletes: 0,
        updates: 0,
        moves: 0,
      },
    });
  });

  it('should handle adding to empty document', () => {
    const astA = parse('');
    const astB = parse('# Title');

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      operations: expect.arrayContaining([
        expect.objectContaining({
          type: 'insert',
          parentRefs: [],
        }),
      ]),
      virtuals: expect.any(Object),
      summary: {
        inserts: 1,
        deletes: 0,
        updates: 0,
        moves: 0,
      },
    });
  });

  it('should handle removing all content', () => {
    const astA = parse('# Title');
    const astB = parse('');

    const result = diff(astA, astB);

    expect(result).toMatchObject({
      operations: expect.arrayContaining([
        expect.objectContaining({
          type: 'delete',
          parentRefs: [],
        }),
      ]),
      virtuals: expect.any(Object),
      summary: {
        inserts: 0,
        deletes: 1,
        updates: 0,
        moves: 0,
      },
    });

    const deleteOp = result.operations.find((op) => op.type === 'delete');
    expect(deleteOp?.ref).toMatch(/^#[a-z0-9]+$/);
    if (deleteOp?.ref) {
      expect(result.virtuals[deleteOp.ref]).toBeDefined();
      expect(result.virtuals[deleteOp.ref]?.type).toBe('heading');
    }
  });

  it('should emit source-anchored virtual refs for unref moves and resolve them in virtuals', () => {
    const astA = parse(
      ['Moved paragraph', '', '{{ ref: anchor }}', 'Anchor'].join('\n'),
    );
    const astB = parse(
      ['{{ ref: anchor }}', 'Anchor', '', 'Moved paragraph'].join('\n'),
    );

    const result = diff(astA, astB);

    const moveOp = result.operations.find(
      (op) => op.type === 'move' && op.ref?.startsWith('#'),
    );
    expect(moveOp).toBeDefined();
    expect(moveOp?.ref).toMatch(/^#[a-z0-9]+$/);
    if (moveOp?.ref) {
      expect(result.virtuals[moveOp.ref]).toBeDefined();
      expect(result.virtuals[moveOp.ref]?.type).toBe('paragraph');
    }
  });

  describe('spurious move filtering', () => {
    it('should not generate move operations when a middle block is deleted', () => {
      const original = [
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: b }}',
        'Block B',
        '',
        '{{ ref: c }}',
        'Block C',
      ].join('\n');

      const edited = [
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: c }}',
        'Block C',
      ].join('\n');

      const astA = parse(original);
      const astB = parse(edited);
      const result = diff(astA, astB);

      expect(result.summary).toEqual({
        inserts: 0,
        deletes: 1,
        updates: 0,
        moves: 0,
      });

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]).toMatchObject({
        type: 'delete',
        ref: 'b',
      });
    });

    it('should match remaining nodes when a leading ref is deleted', () => {
      const astA = parse(
        [
          '{{ ref: delete}}',
          'Deleted Content',
          '',
          '{{ ref: anchor }}',
          'Anchor',
          '',
          '{{ ref: after-anchor }}',
          'New Content',
        ].join('\n'),
      );
      const astB = parse(['Anchor', '', 'Modified content'].join('\n'));

      const result = diff(astA, astB);

      expect(result.summary).toEqual({
        inserts: 0,
        deletes: 1,
        updates: 1,
        moves: 0,
      });
      expect(result.operations).toHaveLength(2);
      expect(result.operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'delete', ref: 'delete' }),
          expect.objectContaining({ type: 'update', ref: 'after-anchor' }),
        ]),
      );
    });

    it('should not generate move when multiple predecessors are deleted', () => {
      const original = [
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: b }}',
        'Block B',
        '',
        '{{ ref: c }}',
        'Block C',
        '',
        '{{ ref: d }}',
        'Block D',
      ].join('\n');

      const edited = [
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: d }}',
        'Block D',
      ].join('\n');

      const astA = parse(original);
      const astB = parse(edited);
      const result = diff(astA, astB);

      expect(result.summary).toEqual({
        inserts: 0,
        deletes: 2,
        updates: 0,
        moves: 0,
      });

      expect(result.operations).toHaveLength(2);
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'b' }),
      );
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'delete', ref: 'c' }),
      );
    });

    it('should generate move when node is repositioned past surviving siblings', () => {
      const original = [
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: b }}',
        'Block B',
        '',
        '{{ ref: c }}',
        'Block C',
      ].join('\n');

      // C moved to front (genuine move)
      const edited = [
        '{{ ref: c }}',
        'Block C',
        '',
        '{{ ref: a }}',
        'Block A',
        '',
        '{{ ref: b }}',
        'Block B',
      ].join('\n');

      const astA = parse(original);
      const astB = parse(edited);
      const result = diff(astA, astB);

      // C moved past A and B, so should have moves
      expect(result.summary.moves).toBeGreaterThan(0);
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'move', ref: 'c' }),
      );
    });
  });

  describe('tables with adjacent annotations', () => {
    it('should detect cell-level changes in table rows', () => {
      const source = [
        '{{ ref: table1 }}',
        '| Col A | Col B |',
        '|-------|-------|',
        '| A | B |',
      ].join('\n');

      const target = [
        '{{ ref: table1 }}',
        '| Col A | Col B |',
        '|-------|-------|',
        '| Modified | B |',
      ].join('\n');

      const astA = parse(source);
      const astB = parse(target);
      const result = diff(astA, astB);

      // recursive child matching detects changes at cell level (not row level)
      // this is more granular - only the changed cell is reported, not the whole row
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          type: 'update',
          old: expect.objectContaining({ type: 'cell' }),
          new: expect.objectContaining({ type: 'cell' }),
        }),
      );
      expect(result.summary.updates).toBe(1); // only the changed cell
    });

    it('should match an annotated table by ref', () => {
      const source = [
        '{{ ref: table1 }}',
        '| Col A | Col B |',
        '|-------|-------|',
        '| A | B |',
      ].join('\n');

      const target = [
        '{{ ref: table1 }}',
        '| Col A | Col B |',
        '|-------|-------|',
        '| A | B |',
      ].join('\n');

      const astA = parse(source);
      const astB = parse(target);
      const result = diff(astA, astB);

      // Identical content should produce no operations
      expect(result.operations).toHaveLength(0);
    });

    it('should detect row additions in an annotated table', () => {
      const source = [
        '{{ ref: table2 }}',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n');

      const target = [
        '{{ ref: table2 }}',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '| 3 | 4 |',
      ].join('\n');

      const astA = parse(source);
      const astB = parse(target);
      const result = diff(astA, astB);

      // should detect the new row
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'insert' }),
      );
      expect(result.summary.inserts).toBeGreaterThan(0);
    });

    it('should not mispair table headers and rows when appending rows', () => {
      const source = [
        '{{ ref: table2 }}',
        '| Name | Score |',
        '|------|-------|',
        '| Alice | 100 |',
      ].join('\n');

      const target = [
        '{{ ref: table2 }}',
        '| Name | Score |',
        '|------|-------|',
        '| Alice | 100 |',
        '| Bob | 95 |',
      ].join('\n');

      const result = diff(parse(source), parse(target));
      const typeSwapUpdates = result.operations.filter(
        (op) =>
          op.type === 'update' &&
          ((op.old.type === 'header' && op.new.type === 'row') ||
            (op.old.type === 'row' && op.new.type === 'header')),
      );

      expect(typeSwapUpdates).toHaveLength(0);
      expect(result.summary.inserts).toBeGreaterThan(0);
    });

    it('should return no changes for identical annotated tables', () => {
      const source = [
        '{{ ref: table3 }}',
        '| Col A | Col B |',
        '|-------|-------|',
        '| A | B |',
      ].join('\n');

      const astA = parse(source);
      const astB = parse(source);
      const result = diff(astA, astB);

      expect(result.operations).toHaveLength(0);
      expect(result.summary).toEqual({
        inserts: 0,
        deletes: 0,
        updates: 0,
        moves: 0,
      });
    });
  });

  describe('nested insert virtual refs', () => {
    it('should include virtual ref for parent when children reference it via parentRefs', () => {
      const astA = parse('');
      const astB = parse('- parent\n  - child');

      const result = diff(astA, astB);

      // should have 2 inserts: parent bullet and child bullet
      const inserts = result.operations.filter((op) => op.type === 'insert');
      expect(inserts).toHaveLength(2);

      // parent insert should have a virtual ref
      const parentInsert = inserts.find((op) => op.path.length === 2);
      expect(parentInsert).toBeDefined();
      expect(parentInsert?.ref).toBeDefined();
      expect(parentInsert?.ref).toMatch(/^#[a-z0-9]+$/);

      // child insert should reference parent's ref in parentRefs
      const childInsert = inserts.find((op) => op.path.length === 4);
      expect(childInsert).toBeDefined();
      expect(childInsert?.parentRefs).toContain(parentInsert?.ref);
    });

    it('should handle deeply nested inserts with chained virtual refs', () => {
      const astA = parse('');
      // use a structure that creates nested children (parent bullet with nested children)
      const astB = parse('- parent\n  - child');

      const result = diff(astA, astB);

      const inserts = result.operations.filter((op) => op.type === 'insert');
      expect(inserts).toHaveLength(2);

      // find the parent (shorter path) and child (longer path)
      const sortedInserts = [...inserts].sort(
        (a, b) => a.path.length - b.path.length,
      );
      const parentInsert = sortedInserts[0];
      const childInsert = sortedInserts[1];

      // parent insert should have a virtual ref since child references it
      expect(parentInsert?.ref).toBeDefined();
      expect(parentInsert?.ref).toMatch(/^#/);

      // child insert should reference parent via parentRefs
      expect(childInsert?.parentRefs).toContain(parentInsert?.ref);
    });

    it('should use explicit ref when present instead of generating virtual ref', () => {
      const astA = parse('');
      const astB = parse('{{ ref: parent-explicit }}\n- parent\n  - child');

      const result = diff(astA, astB);

      const inserts = result.operations.filter((op) => op.type === 'insert');

      // parent with explicit ref
      const parentInsert = inserts.find(
        (op) => op.node.ref === 'parent-explicit',
      );
      expect(parentInsert).toBeDefined();
      expect(parentInsert?.ref).toBe('parent-explicit');

      // child should reference explicit ref
      const childInsert = inserts.find(
        (op) => op.path.length > (parentInsert?.path.length ?? 0),
      );
      if (childInsert) {
        expect(childInsert.parentRefs).toContain('parent-explicit');
      }
    });

    it('should not generate virtual ref for leaf inserts without children', () => {
      // a leaf node insert that nothing else references must not produce a
      // virtual ref — verified by the empty virtuals map and absent ref on
      // both the operation and the inserted node payload
      const astA = parse('');
      const astB = parse('Paragraph without children');

      const result = diff(astA, astB);

      expect(result.operations).toHaveLength(1);
      const insertOp = result.operations[0];
      expect(insertOp?.type).toBe('insert');
      expect(result.virtuals).toEqual({});
      expect(insertOp?.ref).toBeUndefined();
      if (insertOp?.type === 'insert') {
        expect(insertOp.node.ref).toBeUndefined();
      }
    });

    it('should generate virtual refs for siblings when referenced by afterRef', () => {
      const astA = parse('# Title');
      const astB = parse('# Title\n\nParagraph');

      const result = diff(astA, astB);

      // the paragraph insert should have afterRef referencing the heading
      const insertOp = result.operations.find((op) => op.type === 'insert');
      expect(insertOp).toBeDefined();
      if (insertOp?.type === 'insert') {
        expect(insertOp.afterRef).toBeDefined();
        expect(insertOp.afterRef).toMatch(/^#[a-z0-9]+$/);
      }
    });
  });

  describe('reconciliation contract', () => {
    it('should not mutate input ASTs when computing diff', () => {
      const astA = parse(
        ['{{ ref: a }}', '# Heading', '', 'Plain paragraph'].join('\n'),
      );
      const astB = parse(
        ['{{ ref: a }}', '# Heading', '', 'Other plain paragraph'].join('\n'),
      );
      const snapshotA = structuredClone(astA);
      const snapshotB = structuredClone(astB);

      diff(astA, astB);

      expect(astA).toEqual(snapshotA);
      expect(astB).toEqual(snapshotB);
    });

    it('should return reconciled ASTs distinct from inputs', () => {
      const astA = parse(['# Heading', '', 'Paragraph'].join('\n'));
      const astB = parse(['# Heading', '', 'Paragraph'].join('\n'));

      const result = diff(astA, astB);

      expect(result.sourceAst).not.toBe(astA);
      expect(result.targetAst).not.toBe(astB);
    });

    it('should share reconciled refs across matched pairs', () => {
      const astA = parse(['# Heading', '', 'Paragraph'].join('\n'));
      const astB = parse(['# Heading', '', 'Paragraph modified'].join('\n'));

      const result = diff(astA, astB);

      expect(result.sourceAst.children).toHaveLength(2);
      expect(result.targetAst.children).toHaveLength(2);
      for (let index = 0; index < result.sourceAst.children.length; index++) {
        const sourceRef = result.sourceAst.children[index]?.ref;
        const targetRef = result.targetAst.children[index]?.ref;
        expect(sourceRef).toBeDefined();
        expect(sourceRef).toBe(targetRef);
      }
    });

    it('should leave unmatched insert nodes without ref reconciliation against source', () => {
      const astA = parse('# Heading');
      const astB = parse(['# Heading', '', 'Added paragraph'].join('\n'));

      const result = diff(astA, astB);

      expect(result.sourceAst.children).toHaveLength(1);
      expect(result.targetAst.children).toHaveLength(2);
      // the new node has no counterpart in source — its ref is independent
      const newNodeRef = result.targetAst.children[1]?.ref;
      const sourceRefs = result.sourceAst.children.map((child) => child.ref);
      expect(sourceRefs).not.toContain(newNodeRef);
    });

    it('should keep distinct refs when both sides carry different non-null refs', () => {
      const astA = parse(['{{ ref: source-ref }}', 'Original'].join('\n'));
      const astB = parse(['{{ ref: target-ref }}', 'Updated'].join('\n'));

      const result = diff(astA, astB);

      expect(result.sourceAst.children[0]?.ref).toBe('source-ref');
      expect(result.targetAst.children[0]?.ref).toBe('target-ref');
    });

    it('should reuse user-supplied ref instead of generating a virtual collision', () => {
      // user-supplied refs that look like virtuals must still be honored as-is
      const astA = parse(
        ['{{ ref: "#user-supplied" }}', 'Paragraph'].join('\n'),
      );
      const astB = parse(
        ['{{ ref: "#user-supplied" }}', 'Paragraph'].join('\n'),
      );

      const result = diff(astA, astB);

      expect(result.sourceAst.children[0]?.ref).toBe('#user-supplied');
      expect(result.targetAst.children[0]?.ref).toBe('#user-supplied');
      expect(result.operations).toEqual([]);
    });

    it('should preserve a target-only ref when the matched source has none', () => {
      // inference matches a ref-less source paragraph to a target paragraph
      // that carries a ref. The reconciliation contract says: keep source
      // ref-less, keep target's original ref — neither side is rewritten
      const astA = parse('Same text');
      const astB = parse(['{{ ref: target-only }}', 'Same text'].join('\n'));

      const result = diff(astA, astB);

      expect(result.sourceAst.children[0]?.ref).toBeUndefined();
      expect(result.targetAst.children[0]?.ref).toBe('target-only');
    });
  });
});
