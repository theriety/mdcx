import { describe, expect, it } from 'vitest';

import {
  areArraysEqual,
  areObjectsEqual,
  areValuesEqual,
  computeExpectedAfterRef,
} from '#differ/utilities';

// TEST SUITES //

describe('fn:areObjectsEqual', () => {
  it('should return true for identical objects', () => {
    const a = { name: 'test', value: 123 };
    const b = { name: 'test', value: 123 };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should return true for objects with different property order', () => {
    const a = { name: 'test', value: 123 };
    const b = { value: 123, name: 'test' };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should return false for objects with different values', () => {
    const a = { name: 'test', value: 123 };
    const b = { name: 'test', value: 456 };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should return false for objects with different keys', () => {
    const a = { name: 'test', value: 123 };
    const b = { name: 'test', count: 123 };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should return false for objects with different key count', () => {
    const a = { name: 'test', value: 123 };
    const b = { name: 'test' };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should return true for deeply nested equal objects', () => {
    const a = { outer: { inner: { deep: 'value' } } };
    const b = { outer: { inner: { deep: 'value' } } };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should return false for deeply nested different objects', () => {
    const a = { outer: { inner: { deep: 'value1' } } };
    const b = { outer: { inner: { deep: 'value2' } } };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should return true for both undefined', () => {
    expect(areObjectsEqual(undefined, undefined)).toBe(true);
  });

  it('should return false when one is undefined', () => {
    expect(areObjectsEqual({ key: 'value' }, undefined)).toBe(false);
    expect(areObjectsEqual(undefined, { key: 'value' })).toBe(false);
  });

  it('should handle objects with array properties', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [1, 2, 3] };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should return false for objects with different array properties', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [1, 2, 4] };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should handle empty objects', () => {
    expect(areObjectsEqual({}, {})).toBe(true);
  });

  it('should handle null values correctly', () => {
    const a = { value: null };
    const b = { value: null };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should return false for null vs object', () => {
    const a = { value: null };
    const b = { value: { nested: true } };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should treat a key with undefined value as absent', () => {
    expect(areObjectsEqual({}, { x: undefined })).toBe(true);
  });

  it('should treat a key with undefined value as absent (symmetric)', () => {
    expect(areObjectsEqual({ x: undefined }, {})).toBe(true);
  });

  it('should ignore undefined-valued keys when comparing matching defined keys', () => {
    const a = { x: 1, y: undefined };
    const b = { x: 1 };

    expect(areObjectsEqual(a, b)).toBe(true);
  });

  it('should treat undefined as distinct from null', () => {
    const a = { x: undefined };
    const b = { x: null };

    expect(areObjectsEqual(a, b)).toBe(false);
  });

  it('should return false when defined values differ', () => {
    expect(areObjectsEqual({ x: 1 }, { x: 2 })).toBe(false);
  });

  it('should return false when defined keys differ', () => {
    expect(areObjectsEqual({ x: 1 }, { y: 1 })).toBe(false);
  });

  it('should ignore undefined-valued keys nested inside objects', () => {
    const a = { a: { x: undefined } };
    const b = { a: {} };

    expect(areObjectsEqual(a, b)).toBe(true);
  });
});

describe('fn:computeExpectedAfterRef', () => {
  it('should skip a sparse predecessor entry', () => {
    const siblings: Parameters<typeof computeExpectedAfterRef>[0] = [];
    let predecessorReads = 0;
    Object.defineProperty(siblings, 0, {
      configurable: true,
      get: () =>
        predecessorReads++ === 0
          ? { index: 0, ref: 'predecessor', deleted: false }
          : undefined,
    });
    siblings[1] = { index: 1, ref: 'current', deleted: false };

    expect(computeExpectedAfterRef(siblings, 1)).toBeUndefined();
  });
});

describe('fn:areArraysEqual', () => {
  it('should return true for identical arrays', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];

    expect(areArraysEqual(a, b)).toBe(true);
  });

  it('should return false for arrays with different values', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 4];

    expect(areArraysEqual(a, b)).toBe(false);
  });

  it('should return false for arrays with different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];

    expect(areArraysEqual(a, b)).toBe(false);
  });

  it('should return true for empty arrays', () => {
    expect(areArraysEqual([], [])).toBe(true);
  });

  it('should return true for nested equal arrays', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [1, 2],
      [3, 4],
    ];

    expect(areArraysEqual(a, b)).toBe(true);
  });

  it('should return false for nested different arrays', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [1, 2],
      [3, 5],
    ];

    expect(areArraysEqual(a, b)).toBe(false);
  });

  it('should return true for arrays of objects', () => {
    const a = [{ name: 'a' }, { name: 'b' }];
    const b = [{ name: 'a' }, { name: 'b' }];

    expect(areArraysEqual(a, b)).toBe(true);
  });

  it('should return false for arrays of objects with different values', () => {
    const a = [{ name: 'a' }, { name: 'b' }];
    const b = [{ name: 'a' }, { name: 'c' }];

    expect(areArraysEqual(a, b)).toBe(false);
  });

  it('should handle arrays with null values', () => {
    const a = [null, 1, null];
    const b = [null, 1, null];

    expect(areArraysEqual(a, b)).toBe(true);
  });

  it('should handle mixed type arrays', () => {
    const a = [1, 'two', { three: 3 }, [4]];
    const b = [1, 'two', { three: 3 }, [4]];

    expect(areArraysEqual(a, b)).toBe(true);
  });
});

describe('fn:areValuesEqual', () => {
  it('should return false for different types (string vs number)', () => {
    const a = 'hello';
    const b = 123;

    const result = areValuesEqual(a, b);

    expect(result).toBe(false);
  });

  it('should return false for array vs non-array mismatch', () => {
    const a = [1, 2, 3];
    const b = { 0: 1, 1: 2, 2: 3 };

    const result = areValuesEqual(a, b);

    expect(result).toBe(false);
  });
});
