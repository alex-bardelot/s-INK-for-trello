import {labelShade} from '../src/board/labels';
import {
  clampPage,
  classifySwipe,
  groupCardsByList,
  orientationOf,
  pageCount,
  paginate,
} from '../src/board/layout';
import {
  BOARD_PREFERENCES_KEY,
  loadBoardPreferences,
  saveBoardPreferences,
} from '../src/board/preferences';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoardCard} from '../src/trello';

function card(id: string, idList: string): TrelloBoardCard {
  return {
    id,
    name: id,
    idList,
    pos: 0,
    due: null,
    dueComplete: false,
    badges: {checkItems: 0, checkItemsChecked: 0, description: false},
    labels: [],
    idMembers: [],
  };
}

describe('board layout', () => {
  it('detects the orientation', () => {
    expect(orientationOf(2560, 1920)).toBe('landscape');
    expect(orientationOf(1920, 2560)).toBe('portrait');
  });

  it('counts and clamps pages', () => {
    expect(pageCount(0, 3)).toBe(1);
    expect(pageCount(7, 3)).toBe(3);
    expect(clampPage(5, 7, 3)).toBe(2);
    expect(clampPage(-1, 7, 3)).toBe(0);
  });

  it('paginates measured cards so that each page fits', () => {
    // 100 + 8 + 100 + 8 + 100 = 316.
    expect(paginate([100, 100, 100, 100], 316, 8)).toEqual([
      {start: 0, end: 3},
      {start: 3, end: 4},
    ]);
    expect(paginate([100, 100, 100], 315, 8)).toEqual([
      {start: 0, end: 2},
      {start: 2, end: 3},
    ]);
    // A card taller than the column gets its own page.
    expect(paginate([50, 400, 50], 300, 8)).toEqual([
      {start: 0, end: 1},
      {start: 1, end: 2},
      {start: 2, end: 3},
    ]);
    expect(paginate([], 300, 8)).toEqual([{start: 0, end: 0}]);
  });

  it('groups cards by list, keeping their order', () => {
    const grouped = groupCardsByList([
      card('a', 'l1'),
      card('b', 'l2'),
      card('c', 'l1'),
    ]);
    expect(grouped.get('l1')?.map(c => c.id)).toEqual(['a', 'c']);
    expect(grouped.get('l2')?.map(c => c.id)).toEqual(['b']);
  });

  it.each([
    [-120, 10, 'left'],
    [120, -10, 'right'],
    [5, -100, 'up'],
    [0, 100, 'down'],
    [40, 0, null],
    [100, 90, null],
  ])('classifies a swipe of (%p, %p) as %p', (dx, dy, expected) => {
    expect(classifySwipe(dx, dy)).toBe(expected);
  });
});

describe('board preferences', () => {
  it('defaults to 2 lists in portrait and 3 in landscape', async () => {
    expect(await loadBoardPreferences(createMemoryStore())).toEqual({
      portrait: 2,
      landscape: 3,
    });
  });

  it('round-trips and ignores invalid values', async () => {
    const store = createMemoryStore();
    await saveBoardPreferences(store, {portrait: 1, landscape: 2});
    expect(await loadBoardPreferences(store)).toEqual({
      portrait: 1,
      landscape: 2,
    });

    await store.setItem(BOARD_PREFERENCES_KEY, '{"portrait":7}');
    expect(await loadBoardPreferences(store)).toEqual({
      portrait: 2,
      landscape: 3,
    });
    await store.setItem(BOARD_PREFERENCES_KEY, 'not json');
    expect(await loadBoardPreferences(store)).toEqual({
      portrait: 2,
      landscape: 3,
    });
  });
});

describe('labelShade', () => {
  it('keeps the relative lightness of label colors', () => {
    expect(labelShade('yellow').background).toBe('#E1E1E1');
    expect(labelShade('yellow').text).toBe('#000000');
    expect(labelShade('blue_dark').text).toBe('#FFFFFF');
    expect(
      labelShade('green_light').background > labelShade('green').background,
    ).toBe(true);
  });

  it('avoids mid greys: dark chips get white text, light chips black text', () => {
    expect(labelShade('purple')).toEqual({
      background: '#646464',
      text: '#FFFFFF',
    });
    expect(labelShade('green_dark').text).toBe('#FFFFFF');
    expect(labelShade('pink')).toEqual({
      background: '#B4B4B4',
      text: '#000000',
    });
  });

  it('falls back for unknown or missing colors', () => {
    expect(labelShade(null)).toEqual(labelShade('unknown'));
  });
});
