/**
 * Minimal QR Code encoder (ISO/IEC 18004), dependency free.
 *
 * It covers what the plugin needs: byte mode, error correction level M,
 * versions 1 to 10 (up to 213 bytes), with automatic mask selection. The
 * implementation follows the structure of Project Nayuki's reference
 * encoder (MIT).
 *
 * Coordinates: `x` is the column and `y` the row; `modules[y][x]` is `true`
 * for a dark module.
 */

/* eslint-disable no-bitwise -- bit packing and GF(2^8) arithmetic. */

/** Error correction level M: about 15 % of the code can be damaged. */
const EC_LEVEL_M_FORMAT_BITS = 0b00;

/** Highest version supported by the tables below. */
export const QR_MAX_VERSION = 10;

/**
 * Error correction layout of level M, per version (index 0 = version 1):
 * EC codewords per block, then [block count, data codewords] per group.
 */
const EC_BLOCKS_M: ReadonlyArray<
  readonly [number, ReadonlyArray<readonly [number, number]>]
> = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [
    22,
    [
      [2, 38],
      [2, 39],
    ],
  ],
  [
    22,
    [
      [3, 36],
      [2, 37],
    ],
  ],
  [
    26,
    [
      [4, 43],
      [1, 44],
    ],
  ],
];

/** Centers of the alignment patterns, per version (index 0 = version 1). */
const ALIGNMENT_POSITIONS: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export interface QrCode {
  version: number;
  /** Number of modules per side, without the quiet zone. */
  size: number;
  mask: number;
  modules: boolean[][];
}

/** Encodes a string as UTF-8 bytes (no TextEncoder on every JS engine). */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Reed-Solomon error correction over GF(2^8), polynomial 0x11D.

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Generator polynomial of the given degree, highest term omitted. */
function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Computes the `degree` error correction codewords of a data block. */
export function reedSolomonCodewords(
  data: readonly number[],
  degree: number,
): number[] {
  const divisor = reedSolomonDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < degree; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Data codewords.

function dataCodewordCount(version: number): number {
  const [, groups] = EC_BLOCKS_M[version - 1];
  return groups.reduce((sum, [count, size]) => sum + count * size, 0);
}

function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Largest number of bytes a version can hold in byte mode at level M. */
export function byteCapacity(version: number): number {
  return Math.floor(
    (dataCodewordCount(version) * 8 - 4 - countBits(version)) / 8,
  );
}

/** Builds the data codewords: mode, count, bytes, terminator and padding. */
export function dataCodewords(bytes: readonly number[], version: number) {
  const capacity = dataCodewordCount(version) * 8;
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };
  append(0b0100, 4);
  append(bytes.length, countBits(version));
  bytes.forEach(byte => append(byte, 8));
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) {
    append(pad, 8);
  }
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    codewords.push(byte);
  }
  return codewords;
}

/** Splits the data into blocks, adds error correction and interleaves. */
function interleavedCodewords(data: readonly number[], version: number) {
  const [ecLength, groups] = EC_BLOCKS_M[version - 1];
  const blocks: number[][] = [];
  let offset = 0;
  groups.forEach(([count, size]) => {
    for (let i = 0; i < count; i++) {
      blocks.push(data.slice(offset, offset + size));
      offset += size;
    }
  });
  const ecBlocks = blocks.map(block => reedSolomonCodewords(block, ecLength));
  const result: number[] = [];
  const longest = Math.max(...blocks.map(block => block.length));
  for (let i = 0; i < longest; i++) {
    blocks.forEach(block => {
      if (i < block.length) {
        result.push(block[i]);
      }
    });
  }
  for (let i = 0; i < ecLength; i++) {
    ecBlocks.forEach(block => result.push(block[i]));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix.

class Matrix {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({length: size}, () =>
      new Array<boolean>(size).fill(false),
    );
    this.isFunction = Array.from({length: size}, () =>
      new Array<boolean>(size).fill(false),
    );
  }

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
}

function bit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/** 15-bit format information: EC level, mask, BCH code and XOR mask. */
export function formatBits(mask: number): number {
  const data = (EC_LEVEL_M_FORMAT_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18-bit version information, used from version 7. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function drawFormatBits(matrix: Matrix, mask: number): void {
  const bits = formatBits(mask);
  const {size} = matrix;
  for (let i = 0; i <= 5; i++) {
    matrix.setFunction(8, i, bit(bits, i));
  }
  matrix.setFunction(8, 7, bit(bits, 6));
  matrix.setFunction(8, 8, bit(bits, 7));
  matrix.setFunction(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) {
    matrix.setFunction(14 - i, 8, bit(bits, i));
  }
  for (let i = 0; i < 8; i++) {
    matrix.setFunction(size - 1 - i, 8, bit(bits, i));
  }
  for (let i = 8; i < 15; i++) {
    matrix.setFunction(8, size - 15 + i, bit(bits, i));
  }
  matrix.setFunction(8, size - 8, true);
}

function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const {size} = matrix;
  for (let i = 0; i < size; i++) {
    matrix.setFunction(6, i, i % 2 === 0);
    matrix.setFunction(i, 6, i % 2 === 0);
  }

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          matrix.setFunction(x, y, distance !== 2 && distance !== 4);
        }
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const positions = ALIGNMENT_POSITIONS[version - 1];
  const last = positions.length - 1;
  positions.forEach((cy, i) =>
    positions.forEach((cx, j) => {
      const onFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0);
      if (onFinder) {
        return;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          matrix.setFunction(
            cx + dx,
            cy + dy,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          );
        }
      }
    }),
  );

  // Reserve the format areas; the real bits are drawn once the mask is known.
  drawFormatBits(matrix, 0);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      matrix.setFunction(a, b, bit(bits, i));
      matrix.setFunction(b, a, bit(bits, i));
    }
  }
}

/** Places the codewords in the zigzag order, two columns at a time. */
function drawCodewords(matrix: Matrix, codewords: readonly number[]): void {
  const {size} = matrix;
  const total = codewords.length * 8;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (!matrix.isFunction[y][x]) {
          // Remainder bits after the last codeword stay light.
          if (i < total) {
            matrix.modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          }
          i++;
        }
      }
    }
  }
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(matrix: Matrix, mask: number): void {
  const condition = MASKS[mask];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.isFunction[y][x] && condition(x, y)) {
        matrix.modules[y][x] = !matrix.modules[y][x];
      }
    }
  }
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** Penalty score of the four rules of the standard; lower is better. */
export function penaltyScore(modules: readonly boolean[][]): number {
  const size = modules.length;
  const at = (horizontal: boolean, line: number, i: number) =>
    horizontal ? modules[line][i] : modules[i][line];
  let penalty = 0;

  for (const horizontal of [true, false]) {
    for (let line = 0; line < size; line++) {
      // Rule 1: runs of five or more modules of the same color.
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (
          i < size &&
          at(horizontal, line, i) === at(horizontal, line, i - 1)
        ) {
          run++;
        } else {
          if (run >= 5) {
            penalty += 3 + (run - 5);
          }
          run = 1;
        }
      }
      // Rule 3: finder-like patterns.
      for (let i = 0; i + 11 <= size; i++) {
        for (const pattern of FINDER_LIKE) {
          if (
            pattern.every((dark, k) => at(horizontal, line, i + k) === dark)
          ) {
            penalty += 40;
          }
        }
      }
    }
  }

  // Rule 2: 2x2 blocks of the same color.
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: balance of dark and light modules.
  const total = size * size;
  const dark = modules.reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0,
  );
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  penalty += Math.max(0, k) * 10;
  return penalty;
}

/**
 * Encodes text in the smallest version that holds it, with the mask of
 * lowest penalty.
 *
 * @throws If the text does not fit in version {@link QR_MAX_VERSION}.
 */
export function encodeQrCode(text: string): QrCode {
  const bytes = utf8Bytes(text);
  let version = 1;
  while (version <= QR_MAX_VERSION && byteCapacity(version) < bytes.length) {
    version++;
  }
  if (version > QR_MAX_VERSION) {
    throw new RangeError(
      `Text too long for a QR code: ${
        bytes.length
      } bytes, at most ${byteCapacity(QR_MAX_VERSION)}`,
    );
  }

  const size = version * 4 + 17;
  const codewords = interleavedCodewords(
    dataCodewords(bytes, version),
    version,
  );

  let best: QrCode | null = null;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < MASKS.length; mask++) {
    const matrix = new Matrix(size);
    drawFunctionPatterns(matrix, version);
    drawCodewords(matrix, codewords);
    applyMask(matrix, mask);
    drawFormatBits(matrix, mask);
    const penalty = penaltyScore(matrix.modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = {version, size, mask, modules: matrix.modules};
    }
  }
  return best as QrCode;
}
