import {
  boundsOf,
  describeElement,
  presentKeys,
  strokeFingerprint,
} from '../src/inkLink/elementProbe';

const stroke = [
  {x: 100, y: 200},
  {x: 110, y: 230},
  {x: 140, y: 260},
  {x: 180, y: 250},
  {x: 200, y: 210},
];

const moved = stroke.map(({x, y}) => ({x: x + 512, y: y - 37}));
const doubled = stroke.map(({x, y}) => ({x: x * 2, y: y * 2}));

describe('boundsOf', () => {
  it('returns the bounding box of the points', () => {
    expect(boundsOf(stroke)).toEqual({
      left: 100,
      top: 200,
      right: 200,
      bottom: 260,
    });
  });

  it('returns null without points', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('strokeFingerprint', () => {
  it('does not change when the stroke is moved', () => {
    expect(strokeFingerprint(moved)).toBe(strokeFingerprint(stroke));
  });

  it('keeps the count and shape when the stroke is resized', () => {
    const original = strokeFingerprint(stroke)!;
    const resized = strokeFingerprint(doubled)!;
    expect(resized).not.toBe(original);
    expect(resized.split(':').slice(0, 2)).toEqual(
      original.split(':').slice(0, 2),
    );
    expect(resized.endsWith(':200x120')).toBe(true);
  });

  it('differs for another shape', () => {
    const other = [...stroke].reverse();
    expect(strokeFingerprint(other)).not.toBe(strokeFingerprint(stroke));
  });

  it('handles a single point and no point', () => {
    expect(strokeFingerprint([{x: 5, y: 5}])).toMatch(/^n1:[0-9a-f]{8}:0x0$/);
    expect(strokeFingerprint([])).toBeNull();
  });
});

describe('describeElement', () => {
  it('summarizes the identity, userData and stroke geometry', () => {
    const line = describeElement(
      {type: 0, numInPage: 7, trailNum: 42, uuid: 'abcdef123456', userData: ''},
      {
        pointCount: 5,
        bounds: {left: 100, top: 200, right: 200, bottom: 260},
        fingerprint: 'n5:00000000:100x60',
      },
    );
    expect(line).toBe(
      'type 0, num 7, trail 42, uuid abcdef12…, ud -, pts 5, emr 100,200-200,260, fp n5:00000000:100x60',
    );
  });

  it('shows text boxes and native links', () => {
    const line = describeElement({
      type: 500,
      numInPage: 2,
      uuid: 'u',
      userData: 's-INK/c/abc',
      textBox: {
        textContentFull: 'Name\ns-INK/c/abc',
        textRect: {left: 1, top: 2, right: 3, bottom: 4},
      },
      link: {linkType: 4, destPath: 'https://trello.com/c/abc', controlTrailNums: [3, 4]},
    });
    expect(line).toContain('ud "s-INK/c/abc"');
    expect(line).toContain('text 1,2-3,4');
    expect(line).toContain('"Name / s-INK/c/abc"');
    expect(line).toContain('link 4 "https://trello.com/c/abc" trails [3,4]');
  });
});

describe('presentKeys', () => {
  it('lists the keys that hold a value', () => {
    expect(presentKeys({b: 1, a: '', c: null, d: undefined})).toBe('a,b');
  });
});
