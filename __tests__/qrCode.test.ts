import {
  byteCapacity,
  dataCodewords,
  encodeQrCode,
  formatBits,
  QR_MAX_VERSION,
  reedSolomonCodewords,
  utf8Bytes,
  versionBits,
} from '../src/qr/qrCode';
import {buildAuthorizeUrl} from '../src/trello';

describe('reedSolomonCodewords', () => {
  it('matches the "HELLO WORLD" 1-M example of the standard', () => {
    const data = [
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    ];
    expect(reedSolomonCodewords(data, 10)).toEqual([
      196, 35, 39, 119, 235, 215, 231, 226, 93, 23,
    ]);
  });
});

describe('formatBits and versionBits', () => {
  it.each([
    [0, 0b101010000010010],
    [1, 0b101000100100101],
    [5, 0b100000011001110],
    [7, 0b100101010100000],
  ])('encodes level M with mask %i', (mask, expected) => {
    expect(formatBits(mask)).toBe(expected);
  });

  it.each([
    [7, 0x07c94],
    [8, 0x085bc],
    [10, 0x0a4d3],
  ])('encodes version %i', (version, expected) => {
    expect(versionBits(version)).toBe(expected);
  });
});

describe('dataCodewords', () => {
  it('adds mode, count, terminator and alternating padding', () => {
    expect(dataCodewords([0x41], 1)).toEqual([
      0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
      0x11, 0xec, 0x11, 0xec,
    ]);
  });
});

describe('utf8Bytes', () => {
  it('encodes ASCII and multi-byte characters', () => {
    expect(utf8Bytes('A')).toEqual([0x41]);
    expect(utf8Bytes('é')).toEqual([0xc3, 0xa9]);
    expect(utf8Bytes('€')).toEqual([0xe2, 0x82, 0xac]);
  });
});

describe('encodeQrCode', () => {
  const finderAt = (modules: boolean[][], x0: number, y0: number) =>
    [0, 1, 2, 3, 4, 5, 6].every(d =>
      [0, 6].every(
        edge =>
          modules[y0 + edge][x0 + d] === true &&
          modules[y0 + d][x0 + edge] === true,
      ),
    );

  it('picks the smallest version and draws the fixed patterns', () => {
    const url = buildAuthorizeUrl({apiKey: '0123456789abcdef0123456789abcdef'});
    const code = encodeQrCode(url);
    expect(byteCapacity(code.version)).toBeGreaterThanOrEqual(url.length);
    expect(byteCapacity(code.version - 1)).toBeLessThan(url.length);
    expect(code.size).toBe(code.version * 4 + 17);
    expect(code.modules).toHaveLength(code.size);
    expect(finderAt(code.modules, 0, 0)).toBe(true);
    expect(finderAt(code.modules, code.size - 7, 0)).toBe(true);
    expect(finderAt(code.modules, 0, code.size - 7)).toBe(true);
    // Dark module next to the bottom-left finder.
    expect(code.modules[code.size - 8][8]).toBe(true);
    // Timing patterns alternate.
    for (let i = 8; i < code.size - 8; i++) {
      expect(code.modules[6][i]).toBe(i % 2 === 0);
      expect(code.modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('rejects text longer than the largest supported version', () => {
    expect(() =>
      encodeQrCode('x'.repeat(byteCapacity(QR_MAX_VERSION) + 1)),
    ).toThrow(RangeError);
  });
});
