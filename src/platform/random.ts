import {concatBytes, sha256} from '../relay/sha256';

/* eslint-disable no-bitwise -- byte packing. */

export type RandomSource = 'crypto' | 'entropyPool';

interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

function systemCrypto(): CryptoLike | null {
  const candidate = (globalThis as {crypto?: Partial<CryptoLike>}).crypto;
  return typeof candidate?.getRandomValues === 'function'
    ? (candidate as CryptoLike)
    : null;
}

/** Which generator {@link randomBytes} uses on this engine. */
export function randomSource(): RandomSource {
  return systemCrypto() ? 'crypto' : 'entropyPool';
}

function pushNumber(pool: number[], value: number): void {
  const high = Math.floor(value / 0x100000000);
  const low = value >>> 0;
  pool.push(
    (high >>> 24) & 255,
    (high >>> 16) & 255,
    (high >>> 8) & 255,
    high & 255,
    (low >>> 24) & 255,
    (low >>> 16) & 255,
    (low >>> 8) & 255,
    low & 255,
  );
}

function clock(): number {
  const perf = (globalThis as {performance?: {now?: () => number}}).performance;
  return typeof perf?.now === 'function' ? perf.now() * 1000 : Date.now();
}

let pool: Uint8Array | null = null;
let counter = 0;

/**
 * Gathers what entropy the engine offers when it has no cryptographic
 * generator: many `Math.random()` outputs (seeded by the engine from the
 * system) and the jitter of the clock over tight loops, all hashed.
 * `Math.random()` outputs never leave this pool: callers only see SHA-256
 * digests of it, so they reveal nothing about the generator's state.
 */
function entropyPool(): Uint8Array {
  if (pool) {
    return pool;
  }
  const samples: number[] = [];
  pushNumber(samples, Date.now());
  for (let i = 0; i < 64; i++) {
    pushNumber(samples, Math.floor(Math.random() * 0x20000000000000));
    const start = clock();
    let spins = 0;
    while (clock() === start && spins < 10_000) {
      spins++;
    }
    pushNumber(samples, spins);
    pushNumber(samples, Math.floor(clock() * 1000));
  }
  pool = sha256(Uint8Array.from(samples));
  return pool;
}

/**
 * `length` random bytes, from `crypto.getRandomValues` when the engine has
 * it, otherwise from a hashed entropy pool (see {@link entropyPool}).
 */
export function randomBytes(length: number): Uint8Array {
  const crypto = systemCrypto();
  if (crypto) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  const result = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 32) {
    const fresh: number[] = [];
    pushNumber(fresh, counter++);
    pushNumber(fresh, Math.floor(Math.random() * 0x20000000000000));
    pushNumber(fresh, Math.floor(clock() * 1000));
    const block = sha256(concatBytes(entropyPool(), Uint8Array.from(fresh)));
    result.set(block.subarray(0, length - offset), offset);
  }
  return result;
}
