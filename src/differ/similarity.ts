/**
 * text similarity metrics for block matching
 *
 * provides multiple algorithms for computing similarity between text content:
 * - jaccard: token-based set overlap
 * - levenshtein: edit distance normalized
 * - ngram: character trigram overlap
 * - combined: weighted combination of all three metrics
 */

// TYPES //

/** parameters for computing character n-gram similarity */
export interface ComputeNgramSimilarityParams {
  textA: string;
  textB: string;
  n?: number;
}

/** mutable cap shared by one tree-matching run */
export interface SimilarityBudget {
  remainingComparisons: number;
}

// CONSTANTS //

/** weight for jaccard similarity in combined score */
const JACCARD_WEIGHT = 0.3;

/** weight for levenshtein similarity in combined score */
const LEVENSHTEIN_WEIGHT = 0.4;

/** weight for ngram similarity in combined score */
const NGRAM_WEIGHT = 0.3;

/** default n-gram size for character-based similarity */
const DEFAULT_NGRAM_SIZE = 3;

/** maximum exact Levenshtein work for one pair of strings */
const MAX_LEVENSHTEIN_CELLS = 1_000_000;

/** maximum text comparisons for one complete tree-matching run */
const MAX_SIMILARITY_COMPARISONS = 10_000;

// EXPORTED FUNCTIONS //

/**
 * computes combined similarity using weighted metrics
 *
 * formula: 0.3 * jaccard + 0.4 * levenshtein + 0.3 * ngram
 * @param textA first text to compare
 * @param textB second text to compare
 * @returns similarity score from 0 to 1
 */
export function computeCombinedSimilarity(
  textA: string,
  textB: string,
): number {
  // handle edge cases
  if (textA === textB) {
    return 1;
  }

  if (textA.length === 0 || textB.length === 0) {
    return 0;
  }

  const jaccard = computeJaccardSimilarity(textA, textB);
  const levenshtein = computeLevenshteinSimilarity(textA, textB);
  const ngram = computeNgramSimilarity({ textA, textB });

  return (
    jaccard * JACCARD_WEIGHT +
    levenshtein * LEVENSHTEIN_WEIGHT +
    ngram * NGRAM_WEIGHT
  );
}

/**
 * computes jaccard similarity based on token set overlap
 *
 * jaccard index = |A ∩ B| / |A ∪ B|
 * @param textA first text to compare
 * @param textB second text to compare
 * @returns similarity score from 0 to 1
 */
export function computeJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  // handle empty token sets
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1;
  }

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  const intersection = computeSetIntersectionSize(tokensA, tokensB);
  const union = tokensA.size + tokensB.size - intersection;

  return intersection / union;
}

/**
 * computes levenshtein similarity based on edit distance
 *
 * similarity = 1 - (editDistance / maxLength)
 * @param textA first text to compare
 * @param textB second text to compare
 * @returns similarity score from 0 to 1
 */
export function computeLevenshteinSimilarity(
  textA: string,
  textB: string,
): number {
  const maxLength = Math.max(textA.length, textB.length);

  // handle empty strings
  if (maxLength === 0) {
    return 1;
  }

  if (textA.length * textB.length > MAX_LEVENSHTEIN_CELLS) {
    return 0;
  }

  const distance = computeLevenshteinDistance(textA, textB);

  return 1 - distance / maxLength;
}

/**
 * creates a deterministic work budget for one tree-matching run
 * @param limit optional comparison limit used by focused callers and tests
 * @returns mutable remaining-work counter
 */
export function createSimilarityBudget(
  limit = MAX_SIMILARITY_COMPARISONS,
): SimilarityBudget {
  return { remainingComparisons: Math.max(0, limit) };
}

/**
 * reserves one similarity comparison when budget remains
 * @param budget shared tree-matching budget
 * @returns whether the caller may perform the comparison
 */
export function consumeSimilarityComparison(budget: SimilarityBudget): boolean {
  if (budget.remainingComparisons <= 0) {
    return false;
  }
  budget.remainingComparisons--;

  return true;
}

/**
 * computes n-gram similarity based on character trigram overlap
 *
 * uses jaccard index over character n-grams
 * @param params n-gram comparison inputs
 * @param params.textA first text to compare
 * @param params.textB second text to compare
 * @param params.n size of n-grams (default: 3 for trigrams)
 * @returns similarity score from 0 to 1
 */
export function computeNgramSimilarity(
  params: ComputeNgramSimilarityParams,
): number {
  const { textA, textB, n = DEFAULT_NGRAM_SIZE } = params;
  const ngramsA = generateNgrams(textA, n);
  const ngramsB = generateNgrams(textB, n);

  // handle empty n-gram sets
  if (ngramsA.size === 0 && ngramsB.size === 0) {
    return 1;
  }

  if (ngramsA.size === 0 || ngramsB.size === 0) {
    return 0;
  }

  const intersection = computeSetIntersectionSize(ngramsA, ngramsB);
  const union = ngramsA.size + ngramsB.size - intersection;

  return intersection / union;
}

// HELPER FUNCTIONS //

/**
 * tokenizes text into lowercase words
 * @param text text to tokenize
 * @returns set of lowercase tokens
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/);

  return new Set(words.filter((word) => word.length > 0));
}

/**
 * generates character n-grams from text
 * @param text text to process
 * @param n size of each n-gram
 * @returns set of n-gram strings
 */
function generateNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  const normalized = text.toLowerCase();

  // need at least n characters for n-grams
  if (normalized.length < n) {
    return ngrams;
  }

  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.slice(i, i + n));
  }

  return ngrams;
}

/**
 * returns one required value from a dense dynamic-programming row
 * @param row dense row produced by the Levenshtein loop
 * @param index initialized row index
 * @returns initialized row value
 */
function requiredRowValue(row: number[], index: number): number {
  const value = row[index];

  // The loop initializes every row index before any dependent read.
  /* c8 ignore start */
  if (value === undefined) {
    throw new RangeError(`Missing Levenshtein row value at index ${index}.`);
  }
  /* c8 ignore stop */

  return value;
}

/**
 * computes size of intersection between two sets
 * @param setA first set
 * @param setB second set
 * @returns number of elements in intersection
 */
export function computeSetIntersectionSize(
  setA: Set<string>,
  setB: Set<string>,
): number {
  let count = 0;

  // iterate over smaller set for efficiency
  const [smaller, larger] =
    setA.size <= setB.size ? [setA, setB] : [setB, setA];

  for (const item of smaller) {
    if (larger.has(item)) {
      count++;
    }
  }

  return count;
}

/**
 * computes levenshtein edit distance using space-optimized DP
 *
 * uses two-row approach for O(min(m,n)) space complexity
 * @param textA first string
 * @param textB second string
 * @returns edit distance (number of operations)
 */
function computeLevenshteinDistance(textA: string, textB: string): number {
  // ensure shorter string is used for row iteration (space optimization)
  const [shorter, longer] =
    textA.length <= textB.length ? [textA, textB] : [textB, textA];

  const m = shorter.length;
  const n = longer.length;

  // handle edge cases
  if (m === 0) {
    return n;
  }

  // two-row DP approach
  let previousRow = Array.from({ length: m + 1 }, (_, i) => i);
  let currentRow = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    currentRow[0] = j;

    for (let i = 1; i <= m; i++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;

      // DP rows are fully written before being read, so the fallbacks never apply
      currentRow[i] = Math.min(
        requiredRowValue(previousRow, i) + 1, // deletion
        requiredRowValue(currentRow, i - 1) + 1, // insertion
        requiredRowValue(previousRow, i - 1) + cost, // substitution
      );
    }

    // swap rows
    [previousRow, currentRow] = [currentRow, previousRow];
  }

  return requiredRowValue(previousRow, m);
}
