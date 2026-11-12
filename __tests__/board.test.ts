import {
  cardsPerPage,
  clampPage,
  classifySwipe,
  groupCardsByList,
  nextColumnCount,
  orientationOf,
  pageCount,
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
  };
}

describe('board layout', () => {
  it('cycles the column count 1 → 2 → 3 → 1', () => {
    expect(nextColumnCount(1)).toBe(2);
    expect(nextColumnCount(2)).toBe(3);
    expect(nextColumnCount(3)).toBe(1);
  });

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

  it('only counts cards that fit entirely', () => {
    // 3 cards of 100 + 2 gaps of 8 = 316.
    expect(cardsPerPage(316, 100, 8)).toBe(3);
    expect(cardsPerPage(315, 100, 8)).toBe(2);
    expect(cardsPerPage(50, 100, 8)).toBe(1);
    expect(cardsPerPage(0, 100, 8)).toBe(1);
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
