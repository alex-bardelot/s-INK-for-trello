import {
  BOARD_SHADES,
  boardShade,
  buildDirectoryRows,
  DEFAULT_BOARD_SHADE,
  directoryColumns,
  paginateRows,
  parseHexColor,
  RowHeights,
} from '../src/boards/directory';
import {
  BOARDS_PREFERENCES_KEY,
  loadBoardsPreferences,
  saveBoardsPreferences,
} from '../src/boards/preferences';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoard} from '../src/trello';

function board(id: string, extra: Partial<TrelloBoard> = {}): TrelloBoard {
  return {
    id,
    name: `Board ${id}`,
    url: `https://trello.com/b/${id}/board`,
    shortLink: id,
    closed: false,
    starred: false,
    idOrganization: null,
    ...extra,
  };
}

describe('parseHexColor', () => {
  it('parses long and short forms', () => {
    expect(parseHexColor('#0079BF')).toEqual([0, 121, 191]);
    expect(parseHexColor('fff')).toEqual([255, 255, 255]);
  });

  it.each([null, undefined, '', 'blue', '#12345'])('rejects %p', value => {
    expect(parseHexColor(value)).toBeNull();
  });
});

describe('boardShade', () => {
  const shade = (backgroundColor: string) =>
    boardShade({prefs: {backgroundColor}});

  it('maps Trello colors to separate greys', () => {
    expect(shade('#E4F0F6')).toBe(BOARD_SHADES[0]); // light sky
    expect(shade('#519839')).toBe(BOARD_SHADES[1]); // green
    expect(shade('#0079BF')).toBe(BOARD_SHADES[2]); // blue
    expect(shade('#1D2125')).toBe(BOARD_SHADES[3]); // dark
  });

  it('uses the dominant color of photo backgrounds', () => {
    expect(
      boardShade({
        prefs: {backgroundColor: null, backgroundBottomColor: '#1D2125'},
      }),
    ).toBe(BOARD_SHADES[3]);
  });

  it('falls back to a default grey', () => {
    expect(boardShade({})).toBe(DEFAULT_BOARD_SHADE);
    expect(boardShade({prefs: null})).toBe(DEFAULT_BOARD_SHADE);
  });
});

describe('buildDirectoryRows', () => {
  it('lists the Supernote section, the starred boards, then all boards', () => {
    const boards = [
      board('a', {starred: true}),
      board('b'),
      board('c'),
      board('d'),
    ];
    const rows = buildDirectoryRows(boards, 3);
    expect(rows.map(row => row.key)).toEqual([
      'header:supernote',
      'roadmap',
      'header:starred',
      'starred:0',
      'header:all',
      'all:0',
      'all:3',
    ]);
    const last = rows[rows.length - 1];
    expect(last.kind === 'tiles' && last.boards.map(b => b.id)).toEqual(['d']);
  });

  it('skips the starred section when nothing is starred', () => {
    const keys = buildDirectoryRows([board('a')], 3).map(row => row.key);
    expect(keys).not.toContain('header:starred');
  });

  it('shows a message row while the boards are not loaded', () => {
    expect(buildDirectoryRows(null, 3).map(row => row.kind)).toEqual([
      'header',
      'roadmap',
      'header',
      'message',
    ]);
  });

  it('leaves out the Supernote section when hidden', () => {
    const keys = buildDirectoryRows([board('a')], 3, false).map(r => r.key);
    expect(keys).toEqual(['header:all', 'all:0']);
  });
});

describe('paginateRows', () => {
  const heights: RowHeights = {
    header: 10,
    roadmap: 30,
    tiles: 30,
    message: 30,
    gap: 5,
  };

  it('keeps everything on one page when it fits', () => {
    const rows = buildDirectoryRows([board('a')], 3);
    expect(paginateRows(rows, 1000, heights)).toHaveLength(1);
  });

  it('never leaves a section header alone at the bottom of a page', () => {
    // header 10 + roadmap 30 + header 10 = 60 with gaps: the "all" header
    // would fit, but not with its first row of tiles.
    const rows = buildDirectoryRows([board('a'), board('b')], 1);
    const pages = paginateRows(rows, 62, heights);
    expect(pages.map(page => page.map(row => row.key))).toEqual([
      ['header:supernote', 'roadmap'],
      ['header:all', 'all:0'],
      ['all:1'],
    ]);
  });

  it('puts a row taller than the page on a page of its own', () => {
    const rows = buildDirectoryRows([board('a')], 3);
    const pages = paginateRows(rows, 5, heights);
    expect(pages.every(page => page.length > 0)).toBe(true);
    expect(pages.flat()).toHaveLength(rows.length);
  });

  it('returns one empty page for no rows', () => {
    expect(paginateRows([], 100, heights)).toEqual([[]]);
  });
});

describe('directoryColumns', () => {
  it('uses three columns in portrait and four in landscape', () => {
    expect(directoryColumns(1404, 1872)).toBe(3);
    expect(directoryColumns(1872, 1404)).toBe(4);
  });
});

describe('boards preferences', () => {
  it('shows the roadmap by default', async () => {
    expect(await loadBoardsPreferences(createMemoryStore())).toEqual({
      showSupernoteRoadmap: true,
    });
  });

  it('saves and reads the roadmap choice', async () => {
    const store = createMemoryStore();
    await saveBoardsPreferences(store, {showSupernoteRoadmap: false});
    expect(await loadBoardsPreferences(store)).toEqual({
      showSupernoteRoadmap: false,
    });
  });

  it('ignores corrupted values', async () => {
    const store = createMemoryStore();
    await store.setItem(BOARDS_PREFERENCES_KEY, '{"showSupernoteRoadmap":1}');
    expect(await loadBoardsPreferences(store)).toEqual({
      showSupernoteRoadmap: true,
    });
    await store.setItem(BOARDS_PREFERENCES_KEY, 'not json');
    expect(await loadBoardsPreferences(store)).toEqual({
      showSupernoteRoadmap: true,
    });
  });
});
