import {
  estimateTextSize,
  findInkLinks,
  HIT_SLOP_PX,
  inkLinkAt,
  LINK_MERGE_GAP_PX,
  mergeInkLinks,
  NoteElementType,
  PageElement,
  unionOf,
} from '../src/inkLink/hitTest';
import {formatInkLink, parseInkLink} from '../src/inkLink/inkLink';
import {
  layoutLink,
  layoutLinkMark,
  LINK_FONT_SIZE,
  MARK_LABEL_GAP_PX,
  MARK_LABEL_PATTERN,
  MARK_LINE_GAP_PX,
  markLabel,
  LINK_ICON_SIZE,
  LINK_NAME_MAX_LENGTH,
  shortName,
} from '../src/inkLink/linkLayout';
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
import {
  acceptsTool,
  DEFAULT_LINK_TRIGGER,
  LINK_TRIGGER_KEY,
  loadLinkTrigger,
  saveLinkTrigger,
} from '../src/inkLink/trigger';
import {createMemoryStore} from '../src/storage/keyValueStore';

describe('linked handwriting', () => {
  const stroke = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    userData: string | null = 's-INK/c/abc123',
  ): PageElement => ({
    type: 0,
    userData,
    recognizeResult: {
      up_left_point_x: left,
      up_left_point_y: top,
      down_right_point_x: right,
      down_right_point_y: bottom,
    },
  });

  it('finds linked strokes by their recognition box', () => {
    const links = findInkLinks([stroke(10, 20, 30, 40), stroke(0, 0, 5, 5, null)]);
    expect(links).toEqual([
      {
        target: {kind: 'card', shortLink: 'abc123'},
        source: 'userData',
        rect: {left: 10, top: 20, right: 30, bottom: 40},
      },
    ]);
  });

  it('ignores an empty recognition box', () => {
    expect(
      findInkLinks([{type: 0, userData: 's-INK/c/abc123', recognizeResult: {}}]),
    ).toEqual([]);
  });

  it('merges the strokes of a word into one hit zone', () => {
    const merged = mergeInkLinks(
      findInkLinks([
        stroke(100, 100, 130, 150),
        stroke(300, 100, 330, 150),
        stroke(150, 110, 180, 140),
        stroke(200, 100, 280, 160),
      ]),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].rect).toEqual({left: 100, top: 100, right: 330, bottom: 160});
    expect(inkLinkAt(merged, 190, 105)).not.toBeNull();
  });

  it('unites bounds', () => {
    expect(
      unionOf([
        {left: 10, top: 20, right: 30, bottom: 40},
        {left: 5, top: 25, right: 50, bottom: 35},
      ]),
    ).toEqual({left: 5, top: 20, right: 50, bottom: 40});
    expect(unionOf([])).toBeNull();
  });

  it('marks a selection with a line and a label standing on its end', () => {
    const bounds = {left: 300, top: 600, right: 800, bottom: 900};
    const mark = layoutLinkMark(bounds, 'card', 1920, 2560);
    const y = 900 + MARK_LINE_GAP_PX;
    expect(mark.label).toBe('s-INK/c');
    expect(mark.labelRect.left).toBe(800 + MARK_LABEL_GAP_PX);
    expect(mark.labelRect.bottom).toBe(y);
    expect(mark.labelRect.top).toBeLessThan(y);
    expect(mark.line).toEqual([
      {x: 300, y},
      {x: mark.labelRect.right, y},
    ]);
    expect(layoutLinkMark(bounds, 'board', 1920, 2560).label).toBe('s-INK/b');
    expect(MARK_LABEL_PATTERN.test(markLabel('board'))).toBe(true);
  });

  it('keeps the mark on the page', () => {
    const mark = layoutLinkMark(
      {left: 1500, top: 2400, right: 1915, bottom: 2558},
      'board',
      1920,
      2560,
    );
    expect(mark.labelRect.right).toBeLessThanOrEqual(1919);
    expect(mark.line[0].y).toBe(2559);
    expect(mark.line[0].x).toBeLessThanOrEqual(mark.labelRect.left);
  });

  it('keeps copies placed apart and other targets separate', () => {
    const far = 130 + LINK_MERGE_GAP_PX + 1;
    const merged = mergeInkLinks(
      findInkLinks([
        stroke(100, 100, 130, 150),
        stroke(far, 100, far + 30, 150),
        stroke(140, 100, 160, 150, 's-INK/b/board1'),
      ]),
    );
    expect(merged).toHaveLength(3);
  });
});

describe('link trigger', () => {
  it('lets the chosen tools open links', () => {
    expect(acceptsTool('finger', ToolType.Finger)).toBe(true);
    expect(acceptsTool('finger', 0)).toBe(true);
    expect(acceptsTool('finger', ToolType.Pen)).toBe(false);
    expect(acceptsTool('pen', ToolType.Pen)).toBe(true);
    expect(acceptsTool('pen', ToolType.Finger)).toBe(false);
    expect(acceptsTool('both', ToolType.Pen)).toBe(true);
    expect(acceptsTool('both', ToolType.Finger)).toBe(true);
  });

  it('saves and reads the setting, finger by default', async () => {
    const store = createMemoryStore();
    expect(await loadLinkTrigger(store)).toBe(DEFAULT_LINK_TRIGGER);
    await saveLinkTrigger(store, 'both');
    expect(await loadLinkTrigger(store)).toBe('both');
    await store.setItem(LINK_TRIGGER_KEY, 'elbow');
    expect(await loadLinkTrigger(store)).toBe(DEFAULT_LINK_TRIGGER);
  });
});

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

  it('narrows a wide text box to its text', () => {
    const [link] = findInkLinks([
      {
        type: NoteElementType.Text,
        textBox: {
          textContentFull: 'Slides\ns-INK/c/abc',
          textRect: {left: 100, top: 100, right: 1100, bottom: 400},
          fontSize: 36,
        },
      },
    ]);
    const size = estimateTextSize('Slides\ns-INK/c/abc', 36);
    expect(link.rect).toEqual({
      left: 100,
      top: 100,
      right: 100 + size.width,
      bottom: 100 + size.height,
    });
    expect(inkLinkAt([link], 900, 150)).toBeNull();
  });

  it('places pictures with the given converter only', () => {
    const picture: PageElement = {
      type: NoteElementType.Picture,
      userData: 's-INK/b/pic',
      picture: {rect: {left: 1000, top: 1000, right: 2000, bottom: 2000}},
    };
    expect(findInkLinks([picture])).toEqual([]);
    const [link] = findInkLinks([picture], emr => ({
      left: emr.left / 10,
      top: emr.top / 10,
      right: emr.right / 10,
      bottom: emr.bottom / 10,
    }));
    expect(link.rect).toEqual({left: 100, top: 100, right: 200, bottom: 200});
  });

  it('picks the topmost of overlapping links', () => {
    const links = findInkLinks([
      textElement('s-INK/c/below', 'Below'),
      textElement('s-INK/c/above', 'Above'),
    ]);
    expect(inkLinkAt(links, 300, 150)?.target.shortLink).toBe('above');
  });
});

describe('text size and link layout', () => {
  it('counts wide characters as a full font size', () => {
    const latin = estimateTextSize('abcd', 40);
    const wide = estimateTextSize('看板看板', 40);
    expect(wide.width).toBeGreaterThan(latin.width);
    expect(estimateTextSize('a\nb\nc', 40).height).toBeGreaterThan(
      estimateTextSize('a', 40).height,
    );
  });

  it('cuts long names', () => {
    expect(shortName('  Short   name ')).toBe('Short name');
    const long = shortName('x'.repeat(100));
    expect(Array.from(long)).toHaveLength(LINK_NAME_MAX_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });

  it('puts the icon before a text box fitted to the text', () => {
    const layout = layoutLink('Slides', 's-INK/c/abc', {x: 160, y: 160});
    expect(layout.text).toBe('Slides\ns-INK/c/abc');
    expect(layout.iconRect.left).toBe(160);
    expect(layout.iconRect.right - layout.iconRect.left).toBe(LINK_ICON_SIZE);
    expect(layout.textRect.left).toBeGreaterThan(layout.iconRect.right);
    const size = estimateTextSize(layout.text, LINK_FONT_SIZE);
    expect(layout.textRect.right - layout.textRect.left).toBe(size.width);
    // Both are centered on the same line.
    expect(layout.iconRect.top + layout.iconRect.bottom).toBeCloseTo(
      layout.textRect.top + layout.textRect.bottom,
      -1,
    );
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

  it('detects pen taps when the pen is accepted', () => {
    const detector = new TapDetector(tool => acceptsTool('pen', tool));
    const pen = {toolType: ToolType.Pen};
    detector.feed(sample(MotionAction.Down, 50, 60, 0, pen));
    expect(detector.feed(sample(MotionAction.Up, 52, 61, 90, pen))).toEqual({
      x: 50,
      y: 60,
    });
    detector.feed(sample(MotionAction.Down, 50, 60, 200));
    expect(detector.feed(sample(MotionAction.Up, 50, 60, 250))).toBeNull();
    expect(detector.lastRelease).toBeNull();
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
