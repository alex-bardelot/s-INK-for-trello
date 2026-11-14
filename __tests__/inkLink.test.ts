import {
  findInkLinks,
  HIT_SLOP_PX,
  inkLinkAt,
  NoteElementType,
  PageElement,
} from '../src/inkLink/hitTest';
import {formatInkLink, parseInkLink} from '../src/inkLink/inkLink';
import {
  MotionAction,
  normalizeTouch,
  TapDetector,
  TAP_MAX_DISTANCE_PX,
  TAP_MAX_DURATION_MS,
  ToolType,
  Touch,
  TouchSample,
} from '../src/inkLink/tapDetector';

describe('s-INK links', () => {
  it('formats card and board links after Trello URLs', () => {
    expect(formatInkLink({kind: 'card', shortLink: 'aB12xYz'})).toBe(
      's-INK/c/aB12xYz',
    );
    expect(formatInkLink({kind: 'board', shortLink: 'Qw3'})).toBe(
      's-INK/b/Qw3',
    );
  });

  it('parses a link anywhere in a text', () => {
    expect(parseInkLink('≡ Slides\ns-INK/c/aB12xYz')).toEqual({
      kind: 'card',
      shortLink: 'aB12xYz',
    });
    expect(parseInkLink('s-INK/b/Qw3')).toEqual({
      kind: 'board',
      shortLink: 'Qw3',
    });
  });

  it('ignores texts without a valid link', () => {
    expect(parseInkLink(null)).toBeNull();
    expect(parseInkLink('trello.com/c/aB12xYz')).toBeNull();
    expect(parseInkLink('s-INK/x/aB12')).toBeNull();
    expect(parseInkLink('s-INK/c/')).toBeNull();
  });

  it('round-trips', () => {
    const target = {
      kind: 'card' as const,
      shortLink: '5f0c3a9e1b2d4c6e8a0b1c2d',
    };
    expect(parseInkLink(formatInkLink(target))).toEqual(target);
  });
});

describe('hit testing', () => {
  const rect = {left: 100, top: 100, right: 500, bottom: 200};
  const textElement = (
    userData: string,
    text: string,
    textRect = rect,
  ): PageElement => ({
    type: NoteElementType.Text,
    userData,
    textBox: {textContentFull: text, textRect},
  });

  it('prefers userData and falls back to the text', () => {
    const links = findInkLinks([
      textElement('s-INK/c/fromData', 'Name\ns-INK/c/fromText'),
      textElement('', 'Name\ns-INK/b/onlyText'),
      textElement('', 'Plain text'),
      {type: 0},
    ]);
    expect(links).toEqual([
      {target: {kind: 'card', shortLink: 'fromData'}, source: 'userData', rect},
      {target: {kind: 'board', shortLink: 'onlyText'}, source: 'text', rect},
    ]);
  });

  it('reads native link bounds', () => {
    const [link] = findInkLinks([
      {
        type: NoteElementType.Link,
        link: {X: 10, Y: 20, width: 30, height: 40, fullText: 's-INK/b/abc'},
      },
    ]);
    expect(link.rect).toEqual({left: 10, top: 20, right: 40, bottom: 60});
  });

  it('finds the link under a point, with a small margin', () => {
    const links = findInkLinks([textElement('s-INK/c/one', 'One')]);
    expect(inkLinkAt(links, 300, 150)?.target.shortLink).toBe('one');
    expect(inkLinkAt(links, 100 - HIT_SLOP_PX, 150)).not.toBeNull();
    expect(inkLinkAt(links, 100 - HIT_SLOP_PX - 1, 150)).toBeNull();
    expect(inkLinkAt(links, 300, 400)).toBeNull();
  });

  it('picks the topmost of overlapping links', () => {
    const links = findInkLinks([
      textElement('s-INK/c/below', 'Below'),
      textElement('s-INK/c/above', 'Above'),
    ]);
    expect(inkLinkAt(links, 300, 150)?.target.shortLink).toBe('above');
  });
});

describe('normalizeTouch', () => {
  it('falls back on the first pointer and the reception time', () => {
    expect(
      normalizeTouch({action: 0, pointers: [{x: 12, y: 34, toolType: 1}]}, 999),
    ).toEqual({
      action: 0,
      x: 12,
      y: 34,
      time: 999,
      pointerCount: 1,
      toolType: 1,
    });
  });

  it('rejects events without an action or a position', () => {
    expect(normalizeTouch({x: 1, y: 2})).toBeNull();
    expect(normalizeTouch({action: 0})).toBeNull();
    expect(normalizeTouch({action: 0, x: Number.NaN, y: 2})).toBeNull();
  });
});

describe('TapDetector', () => {
  const sample = (
    action: number,
    x: number,
    y: number,
    eventTime: number,
    overrides: Partial<TouchSample> = {},
  ): Touch =>
    normalizeTouch({
      action,
      x,
      y,
      eventTime,
      pointerCount: 1,
      toolType: ToolType.Finger,
      ...overrides,
    })!;

  it('records why a release was or was not a tap', () => {
    const detector = new TapDetector();
    detector.feed(sample(MotionAction.Down, 100, 100, 0));
    detector.feed(sample(MotionAction.Up, 100, 130, 500));
    expect(detector.lastRelease).toEqual({
      durationMs: 500,
      distancePx: 30,
      tap: false,
    });
  });

  it('accepts an unknown tool', () => {
    const detector = new TapDetector();
    detector.feed(sample(MotionAction.Down, 10, 10, 0, {toolType: 0}));
    expect(
      detector.feed(sample(MotionAction.Up, 10, 10, 50, {toolType: 0})),
    ).toEqual({x: 10, y: 10});
  });

  it('reports a short, still finger press as a tap', () => {
    const detector = new TapDetector();
    expect(detector.feed(sample(MotionAction.Down, 100, 100, 0))).toBeNull();
    expect(detector.feed(sample(MotionAction.Move, 104, 102, 50))).toBeNull();
    expect(detector.feed(sample(MotionAction.Up, 105, 103, 120))).toEqual({
      x: 100,
      y: 100,
    });
  });

  it('ignores long presses', () => {
    const detector = new TapDetector();
    detector.feed(sample(MotionAction.Down, 100, 100, 0));
    expect(
      detector.feed(sample(MotionAction.Up, 100, 100, TAP_MAX_DURATION_MS + 1)),
    ).toBeNull();
  });

  it('ignores drags', () => {
    const detector = new TapDetector();
    detector.feed(sample(MotionAction.Down, 100, 100, 0));
    detector.feed(
      sample(MotionAction.Move, 100 + TAP_MAX_DISTANCE_PX + 1, 100, 40),
    );
    expect(detector.feed(sample(MotionAction.Up, 100, 100, 80))).toBeNull();
  });

  it('ignores the pen and multi-finger gestures', () => {
    const detector = new TapDetector();
    const pen = {toolType: ToolType.Pen};
    detector.feed(sample(MotionAction.Down, 100, 100, 0, pen));
    expect(
      detector.feed(sample(MotionAction.Up, 100, 100, 50, pen)),
    ).toBeNull();

    detector.feed(sample(MotionAction.Down, 100, 100, 0));
    detector.feed(sample(MotionAction.Move, 100, 100, 20, {pointerCount: 2}));
    expect(detector.feed(sample(MotionAction.Up, 100, 100, 50))).toBeNull();
  });

  it('ignores a cancelled press', () => {
    const detector = new TapDetector();
    detector.feed(sample(MotionAction.Down, 100, 100, 0));
    detector.feed(sample(MotionAction.Cancel, 100, 100, 20));
    expect(detector.feed(sample(MotionAction.Up, 100, 100, 50))).toBeNull();
  });
});
