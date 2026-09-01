import { describe, expect, it } from 'vitest';

import { selectBestSimilarityCandidate } from '#differ/fallback';
import {
  computeCombinedSimilarity,
  computeJaccardSimilarity,
  computeLevenshteinSimilarity,
  computeNgramSimilarity,
  consumeSimilarityComparison,
  createSimilarityBudget,
} from '#differ/similarity';

import { createParagraph } from '../fixtures/ast';

// TEST INPUTS //

const JACCARD_IDENTICAL_TEXTS = ['hello world', 'hello world'] as const;
const JACCARD_DISJOINT_TEXTS = ['hello world', 'foo bar'] as const;
const JACCARD_PARTIAL_OVERLAP_TEXTS = [
  'hello world',
  'hello universe',
] as const;
const JACCARD_CASE_VARIANT_TEXTS = ['Hello World', 'hello world'] as const;
const JACCARD_EMPTY_TEXTS = ['', ''] as const;
const JACCARD_ONE_EMPTY_TEXT = ['hello world', ''] as const;
const JACCARD_WHITESPACE_TEXTS = ['   ', '   '] as const;

const LEVENSHTEIN_IDENTICAL_TEXTS = ['hello', 'hello'] as const;
const LEVENSHTEIN_DISJOINT_TEXTS = ['abc', 'xyz'] as const;
const LEVENSHTEIN_SINGLE_EDIT_TEXTS = ['hello', 'hallo'] as const;
const LEVENSHTEIN_EMPTY_TEXTS = ['', ''] as const;
const LEVENSHTEIN_DIFFERENT_LENGTH_TEXTS = ['cat', 'cats'] as const;
const LEVENSHTEIN_ONE_EMPTY_TEXT = ['hello', ''] as const;
const LEVENSHTEIN_SYMMETRIC_TEXTS = ['kitten', 'sitting'] as const;

const NGRAM_IDENTICAL_TEXTS = {
  textA: 'hello world',
  textB: 'hello world',
} as const;
const NGRAM_DISJOINT_TEXTS = { textA: 'abc', textB: 'xyz' } as const;
const NGRAM_PARTIAL_OVERLAP_TEXTS = {
  textA: 'hello',
  textB: 'helloworld',
} as const;
const NGRAM_CASE_VARIANT_TEXTS = { textA: 'Hello', textB: 'hello' } as const;
const NGRAM_EMPTY_TEXTS = { textA: '', textB: '' } as const;
const NGRAM_ONE_EMPTY_TEXT = { textA: 'hello', textB: '' } as const;
const NGRAM_SHORT_TEXTS = { textA: 'ab', textB: 'ab' } as const;
const NGRAM_ONE_SHORT_TEXT = { textA: 'ab', textB: 'hello' } as const;
const NGRAM_CUSTOM_SIZE_INPUT = {
  textA: 'hello',
  textB: 'hello',
  n: 2,
} as const;
const NGRAM_WEIGHTED_TEXTS = {
  textA: 'programming',
  textB: 'programing',
} as const;

const COMBINED_IDENTICAL_TEXTS = ['hello world', 'hello world'] as const;
const COMBINED_ONE_EMPTY_TEXT = ['hello world', ''] as const;
const COMBINED_EMPTY_TEXTS = ['', ''] as const;
const COMBINED_PARTIAL_OVERLAP_TEXTS = [
  'hello world',
  'hello universe',
] as const;
const COMBINED_WEIGHTED_TEXTS = ['programming', 'programing'] as const;
const COMBINED_SIMILAR_TEXTS = [
  'The quick brown fox',
  'The quick brown dog',
] as const;

// TEST SUITES //

describe('fn:computeJaccardSimilarity', () => {
  it('should return full similarity for identical texts', () => {
    const result = computeJaccardSimilarity(...JACCARD_IDENTICAL_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity for disjoint texts', () => {
    const result = computeJaccardSimilarity(...JACCARD_DISJOINT_TEXTS);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should return partial similarity for overlapping texts', () => {
    const result = computeJaccardSimilarity(...JACCARD_PARTIAL_OVERLAP_TEXTS);

    expect(result).toBeCloseTo(1 / 3, 5);
  });

  it('should ignore casing when comparing texts', () => {
    const result = computeJaccardSimilarity(...JACCARD_CASE_VARIANT_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return full similarity for two empty strings', () => {
    const result = computeJaccardSimilarity(...JACCARD_EMPTY_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity when one string is empty', () => {
    const result = computeJaccardSimilarity(...JACCARD_ONE_EMPTY_TEXT);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should treat whitespace-only strings as empty', () => {
    const result = computeJaccardSimilarity(...JACCARD_WHITESPACE_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });
});

describe('fn:computeLevenshteinSimilarity', () => {
  it('should return full similarity for identical strings', () => {
    const result = computeLevenshteinSimilarity(...LEVENSHTEIN_IDENTICAL_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity for disjoint strings of equal length', () => {
    const result = computeLevenshteinSimilarity(...LEVENSHTEIN_DISJOINT_TEXTS);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should calculate similarity after one edit', () => {
    const result = computeLevenshteinSimilarity(
      ...LEVENSHTEIN_SINGLE_EDIT_TEXTS,
    );

    expect(result).toBeCloseTo(0.8, 5);
  });

  it('should return full similarity for two empty strings', () => {
    const result = computeLevenshteinSimilarity(...LEVENSHTEIN_EMPTY_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should account for different string lengths', () => {
    const result = computeLevenshteinSimilarity(
      ...LEVENSHTEIN_DIFFERENT_LENGTH_TEXTS,
    );

    expect(result).toBeCloseTo(0.75, 5);
  });

  it('should return no similarity when one string is empty', () => {
    const result = computeLevenshteinSimilarity(...LEVENSHTEIN_ONE_EMPTY_TEXT);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should be symmetric', () => {
    const [textA, textB] = LEVENSHTEIN_SYMMETRIC_TEXTS;

    const resultAB = computeLevenshteinSimilarity(textA, textB);
    const resultBA = computeLevenshteinSimilarity(textB, textA);

    expect(resultAB).toBe(resultBA);
  });

  it('should compute the exact score at the work boundary', () => {
    const textA = 'a'.repeat(1_000);
    const textB = `${'a'.repeat(999)}b`;

    expect(computeLevenshteinSimilarity(textA, textB)).toBeCloseTo(0.999, 5);
  });

  it('should bypass edit-distance work above the cell limit', () => {
    const textA = 'a'.repeat(1_001);
    const textB = `${'a'.repeat(1_000)}b`;

    expect(computeLevenshteinSimilarity(textA, textB)).toBe(0);
  });
});

describe('similarity budget', () => {
  it('should fail closed after the comparison limit is consumed', () => {
    const budget = createSimilarityBudget(2);

    expect([
      consumeSimilarityComparison(budget),
      consumeSimilarityComparison(budget),
      consumeSimilarityComparison(budget),
    ]).toEqual([true, true, false]);
    expect(budget.remainingComparisons).toBe(0);
  });

  it('should stop candidate selection when no budget remains', () => {
    const candidate = createParagraph('candidate');
    const result = selectBestSimilarityCandidate({
      targetNode: createParagraph('target'),
      candidates: [{ node: candidate, index: 0 }],
      usedIndices: new Set(),
      threshold: 0,
      getNode: (entry) => entry.node,
      getIndex: (entry) => entry.index,
      similarityBudget: createSimilarityBudget(0),
    });

    expect(result).toBeNull();
  });
});

describe('fn:computeNgramSimilarity', () => {
  it('should return full similarity for identical strings', () => {
    const result = computeNgramSimilarity(NGRAM_IDENTICAL_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity for disjoint strings', () => {
    const result = computeNgramSimilarity(NGRAM_DISJOINT_TEXTS);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should calculate partial similarity for overlapping strings', () => {
    const result = computeNgramSimilarity(NGRAM_PARTIAL_OVERLAP_TEXTS);

    expect(result).toBeCloseTo(3 / 8, 5);
  });

  it('should ignore casing when comparing strings', () => {
    const result = computeNgramSimilarity(NGRAM_CASE_VARIANT_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return full similarity for two empty strings', () => {
    const result = computeNgramSimilarity(NGRAM_EMPTY_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity when one string is empty', () => {
    const result = computeNgramSimilarity(NGRAM_ONE_EMPTY_TEXT);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should return full similarity when both strings are shorter than n', () => {
    const result = computeNgramSimilarity(NGRAM_SHORT_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity when one string is shorter than n', () => {
    const result = computeNgramSimilarity(NGRAM_ONE_SHORT_TEXT);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should allow custom ngram size', () => {
    const result = computeNgramSimilarity(NGRAM_CUSTOM_SIZE_INPUT);

    expect(result).toBe(1);
  });
});

describe('fn:computeCombinedSimilarity', () => {
  it('should return full similarity for identical strings', () => {
    const result = computeCombinedSimilarity(...COMBINED_IDENTICAL_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return no similarity when one string is empty', () => {
    const result = computeCombinedSimilarity(...COMBINED_ONE_EMPTY_TEXT);

    expect(result).toBeCloseTo(0, 5);
  });

  it('should return full similarity for two empty strings', () => {
    const result = computeCombinedSimilarity(...COMBINED_EMPTY_TEXTS);

    expect(result).toBeCloseTo(1, 5);
  });

  it('should return weighted combination for partial similarity', () => {
    const result = computeCombinedSimilarity(...COMBINED_PARTIAL_OVERLAP_TEXTS);

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('should weight levenshtein higher than jaccard and ngram', () => {
    // strings with high levenshtein similarity but low jaccard
    const jaccard = computeJaccardSimilarity(...COMBINED_WEIGHTED_TEXTS);
    const levenshtein = computeLevenshteinSimilarity(
      ...COMBINED_WEIGHTED_TEXTS,
    );
    const ngram = computeNgramSimilarity(NGRAM_WEIGHTED_TEXTS);
    const combined = computeCombinedSimilarity(...COMBINED_WEIGHTED_TEXTS);

    expect(combined).toBeCloseTo(
      jaccard * 0.3 + levenshtein * 0.4 + ngram * 0.3,
      5,
    );
  });

  it('should handle similar strings correctly', () => {
    const result = computeCombinedSimilarity(...COMBINED_SIMILAR_TEXTS);

    expect(result).toBeGreaterThan(0.5);
  });
});
