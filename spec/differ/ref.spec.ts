import { describe, it, expect } from 'vitest';

import { generateLocalRef } from '#differ/ref';

// TEST SUITES //

describe('fn:generateLocalRef', () => {
  it('should generate ref with # prefix', () => {
    const ref = generateLocalRef();

    expect(ref).toMatch(/^#/);
  });

  it('should generate valid base36 string after prefix', () => {
    const ref = generateLocalRef();
    const base36Part = ref.slice(1);

    expect(base36Part).toMatch(/^[a-z0-9]+$/);
  });

  it('should generate unique refs on each call', () => {
    const refs = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      refs.add(generateLocalRef());
    }

    expect(refs.size).toBe(iterations);
  });

  it('should generate refs of consistent length', () => {
    const ref1 = generateLocalRef();
    const ref2 = generateLocalRef();

    // 64-bit number in base36 is ~12-13 chars, plus # prefix
    expect(ref1.length).toBeGreaterThanOrEqual(2);
    expect(ref1.length).toBeLessThanOrEqual(14);
    expect(ref2.length).toBeGreaterThanOrEqual(2);
    expect(ref2.length).toBeLessThanOrEqual(14);
  });
});
