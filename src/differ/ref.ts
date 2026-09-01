import { randomBytes } from 'node:crypto';

/** prefix for virtual local refs */
const LOCAL_REF_PREFIX = '#';

/** number of random bytes for virtual ref (64 bits = 8 bytes) */
const REF_BYTES = 8;

/** base36 radix for encoding (0-9 + a-z = 36 characters) */
const BASE36_RADIX = 36;

/**
 * generates a virtual local ref for positionally matched nodes
 * @returns ref string in format #<base36-encoded-random>
 */
export function generateLocalRef(): string {
  const bytes = randomBytes(REF_BYTES);
  const base36 = bytes.readBigUInt64BE().toString(BASE36_RADIX);

  return `${LOCAL_REF_PREFIX}${base36}`;
}
