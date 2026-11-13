import {describeLastActivity} from '../src/boards/activity';
import {
  BOARD_SHADES,
  boardImageUrl,
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

describe('boardImageUrl', () => {
  const scaled = [
    {width: 1280, height: 960, url: 'large'},
    {width: 140, height: 100, url: 'small'},
    {width: 480, height: 360, url: 'medium'},
  ];

  it('picks the smallest image at least as wide as the tile', () => {
    expect(boardImageUrl({prefs: {backgroundImageScaled: scaled}}, 400)).toBe(
      'medium',
    );
  });

  it('falls back to the largest image for wide tiles', () => {
    expect(boardImageUrl({prefs: {backgroundImageScaled: scaled}}, 2000)).toBe(
      'large',
    );
  });

  it('uses the full size image without scaled versions', () => {
    expect(boardImageUrl({prefs: {backgroundImage: 'full'}}, 400)).toBe(
      'full',
    );
  });

  it('returns null for plain color backgrounds', () => {
    expect(boardImageUrl({prefs: {backgroundColor: '#0079BF'}}, 400)).toBe(
      null,
    );
    expect(boardImageUrl({}, 400)).toBeNull();
  });
});

describe('buildDirectoryRows', () => {
  it('lists the roadmap, the starred boards, then the other boards', () => {
    const boards = [
      board('a', {starred: true}),
      board('b'),
      board('c'),
      board('d'),
      board('e'),
    ];
    const rows = buildDirectoryRows(boards, 3);
    expect(rows.map(row => row.key)).toEqual([
      'roadmap',
      'header:starred',
      'starred:0',
      'header:all',
      'all:0',
      'all:3',
    ]);
    const tileIds = rows.flatMap(row =>
      row.kind === 'tiles' ? row.boards.map(b => b.id) : [],
    );
    // Each board appears once: starred ones are not repeated.
    expect(tileIds).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('skips the starred section when nothing is starred', () => {
    const keys = buildDirectoryRows([board('a')], 3).map(row => row.key);
    expect(keys).not.toContain('header:starred');
  });

  it('skips the other boards section when every board is starred', () => {
    const keys = buildDirectoryRows([board('a', {starred: true})], 3).map(
      row => row.key,
    );
    expect(keys).toEqual(['roadmap', 'header:starred', 'starred:0']);
  });

  it('shows a message row while the boards are not loaded', () => {
    expect(buildDirectoryRows(null, 3).map(row => row.kind)).toEqual([
      'roadmap',
      'header',
      'message',
    ]);
  });

  it('leaves out the roadmap when hidden', () => {
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
    // roadmap 30 + gap 5 + header 10 = 45: the "all" header would fit, but
    // not with its first row of tiles.
    const rows = buildDirectoryRows([board('a'), board('b')], 1);
    const pages = paginateRows(rows, 50, heights);
    expect(pages.map(page => page.map(row => row.key))).toEqual([
      ['roadmap'],
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

describe('describeLastActivity', () => {
  const now = new Date(2026, 10, 13, 9, 0);
  const at = (day: number, hour = 12) =>
    new Date(2026, 10, day, hour).toISOString();

  it('counts calendar days, not 24-hour periods', () => {
    expect(describeLastActivity(at(13, 8), now)).toEqual({kind: 'today'});
    expect(describeLastActivity(at(12, 23), now)).toEqual({
      kind: 'yesterday',
    });
    expect(describeLastActivity(at(10), now)).toEqual({
      kind: 'daysAgo',
      days: 3,
    });
  });

  it('gives the date beyond a week', () => {
    const activity = describeLastActivity(at(1), now);
    expect(activity?.kind).toBe('date');
  });

  it('treats future dates as today', () => {
    expect(describeLastActivity(at(20), now)).toEqual({kind: 'today'});
  });

  it.each([null, undefined, '', 'not a date'])('ignores %p', value => {
    expect(describeLastActivity(value, now)).toBeNull();
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
