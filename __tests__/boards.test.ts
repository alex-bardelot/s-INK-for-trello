import {describeLastActivity} from '../src/boards/activity';
import {
  BOARD_SHADES,
  boardImageUrl,
  boardShade,
  buildDirectoryRows,
  DEFAULT_BOARD_SHADE,
  directoryColumns,
  DirectoryRow,
  paginateRows,
  parseHexColor,
  RowHeights,
} from '../src/boards/directory';
import {
  addPublicBoard,
  BOARDS_PREFERENCES_KEY,
  DEFAULT_BOARDS_PREFERENCES,
  loadBoardsPreferences,
  parseBoardShortLink,
  removePublicBoard,
  saveBoardsPreferences,
} from '../src/boards/preferences';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {organizationLogoUrl, TrelloBoard} from '../src/trello';

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
    expect(boardImageUrl({prefs: {backgroundImage: 'full'}}, 400)).toBe('full');
  });

  it('returns null for plain color backgrounds', () => {
    expect(boardImageUrl({prefs: {backgroundColor: '#0079BF'}}, 400)).toBe(
      null,
    );
    expect(boardImageUrl({}, 400)).toBeNull();
  });
});

describe('buildDirectoryRows', () => {
  const keys = (input: Parameters<typeof buildDirectoryRows>[0]) =>
    buildDirectoryRows(input).map(row => row.key);
  const tileIds = (rows: DirectoryRow[]) =>
    rows.flatMap(row =>
      row.kind === 'tiles'
        ? row.tiles.map(tile =>
            tile.kind === 'board' ? tile.board.id : tile.kind,
          )
        : [],
    );

  it('lists the public boards, the starred boards, then the others', () => {
    const boards = [
      board('a', {starred: true}),
      board('b'),
      board('c'),
      board('d'),
      board('e'),
    ];
    const rows = buildDirectoryRows({
      boards,
      publicBoards: [board('p')],
      columns: 3,
    });
    expect(rows.map(row => row.key)).toEqual([
      'header:public',
      'public:0',
      'header:starred',
      'starred:0',
      'header:all',
      'all:0',
      'all:3',
    ]);
    // Each board appears once: starred ones are not repeated.
    expect(tileIds(rows)).toEqual([
      'roadmap',
      'p',
      'addPublic',
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('ends the Public section with the card adding a public board', () => {
    const rows = buildDirectoryRows({
      boards: [],
      publicBoards: [board('p'), board('q')],
      columns: 3,
    });
    // Three slots taken: the "+" card wraps to its own row.
    expect(rows.slice(0, 3).map(row => row.key)).toEqual([
      'header:public',
      'public:0',
      'public:3',
    ]);
    expect(tileIds(rows)).toEqual(['roadmap', 'p', 'q', 'addPublic']);
  });

  it('skips the starred section when nothing is starred', () => {
    expect(keys({boards: [board('a')], columns: 3})).not.toContain(
      'header:starred',
    );
  });

  it('skips the other boards section when every board is starred', () => {
    expect(keys({boards: [board('a', {starred: true})], columns: 3})).toEqual([
      'header:public',
      'public:0',
      'header:starred',
      'starred:0',
    ]);
  });

  it('shows a message row while the boards are not loaded', () => {
    expect(
      buildDirectoryRows({boards: null, columns: 3}).map(row => row.kind),
    ).toEqual(['header', 'tiles', 'header', 'message']);
  });

  it('invites to connect an account in My boards when signed out', () => {
    const rows = buildDirectoryRows({
      boards: null,
      signedIn: false,
      columns: 3,
    });
    expect(rows.map(row => row.key)).toEqual([
      'header:public',
      'public:0',
      'header:mine',
      'mine:0',
    ]);
    expect(tileIds(rows)).toEqual(['roadmap', 'addPublic', 'connect']);
  });

  it('leaves My boards out when the connect card is turned off', () => {
    const rows = buildDirectoryRows({
      boards: null,
      signedIn: false,
      showConnect: false,
      columns: 3,
    });
    expect(rows.map(row => row.key)).toEqual(['header:public', 'public:0']);
    // Signed in, the setting has no effect.
    expect(
      buildDirectoryRows({boards: [], showConnect: false, columns: 3}).map(
        row => row.kind,
      ),
    ).toEqual(['header', 'tiles', 'header', 'message']);
  });

  it('keeps the Public section with only the "+" card when empty', () => {
    const rows = buildDirectoryRows({
      boards: [board('a')],
      showRoadmap: false,
      columns: 3,
    });
    expect(rows.map(row => row.key)).toEqual([
      'header:public',
      'public:0',
      'header:all',
      'all:0',
    ]);
    expect(tileIds(rows)).toEqual(['addPublic', 'a']);
  });

  it('can leave the "+" card out, and an empty Public section with it', () => {
    expect(
      tileIds(
        buildDirectoryRows({
          boards: [board('a')],
          showAddPublic: false,
          columns: 3,
        }),
      ),
    ).toEqual(['roadmap', 'a']);
    const rows = buildDirectoryRows({
      boards: [board('a')],
      showRoadmap: false,
      showAddPublic: false,
      columns: 3,
    });
    expect(rows.map(row => row.key)).toEqual(['header:all', 'all:0']);
  });

  it('keeps the public boards when the roadmap is hidden', () => {
    const rows = buildDirectoryRows({
      boards: [],
      publicBoards: [board('p')],
      showRoadmap: false,
      columns: 3,
    });
    expect(tileIds(rows)).toEqual(['p', 'addPublic']);
  });
});

describe('paginateRows', () => {
  const heights: RowHeights = {
    header: 10,
    tiles: 30,
    message: 30,
    gap: 5,
  };

  it('keeps everything on one page when it fits', () => {
    const rows = buildDirectoryRows({boards: [board('a')], columns: 3});
    expect(paginateRows(rows, 1000, heights)).toHaveLength(1);
  });

  it('never leaves a section header alone at the bottom of a page', () => {
    // header 10 + gap 5 + tiles 30 + gap 5 + header 10 = 60: the "all"
    // header would fit, but not with its first row of tiles.
    const rows = buildDirectoryRows({
      boards: [board('a'), board('b'), board('c')],
      columns: 2,
    });
    const pages = paginateRows(rows, 65, heights);
    expect(pages.map(page => page.map(row => row.key))).toEqual([
      ['header:public', 'public:0'],
      ['header:all', 'all:0'],
      ['all:2'],
    ]);
  });

  it('puts a row taller than the page on a page of its own', () => {
    const rows = buildDirectoryRows({boards: [board('a')], columns: 3});
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
  const ref = {shortLink: 'AbCd1234', name: 'Public board'};

  it('shows the roadmap and no public board by default', async () => {
    expect(await loadBoardsPreferences(createMemoryStore())).toEqual(
      DEFAULT_BOARDS_PREFERENCES,
    );
  });

  it('saves and reads the roadmap choice and the public boards', async () => {
    const store = createMemoryStore();
    const preferences = {
      showSupernoteRoadmap: false,
      publicBoards: [ref],
      showConnectCard: false,
    };
    await saveBoardsPreferences(store, preferences);
    expect(await loadBoardsPreferences(store)).toEqual(preferences);
  });

  it('ignores corrupted values', async () => {
    const store = createMemoryStore();
    await store.setItem(
      BOARDS_PREFERENCES_KEY,
      JSON.stringify({
        showSupernoteRoadmap: 1,
        publicBoards: [ref, {shortLink: 'bad'}, 'x'],
        showConnectCard: 'no',
      }),
    );
    expect(await loadBoardsPreferences(store)).toEqual({
      showSupernoteRoadmap: true,
      publicBoards: [ref],
      showConnectCard: true,
    });
    await store.setItem(BOARDS_PREFERENCES_KEY, 'not json');
    expect(await loadBoardsPreferences(store)).toEqual(
      DEFAULT_BOARDS_PREFERENCES,
    );
  });

  it('adds a public board once, never the roadmap', () => {
    const once = addPublicBoard(DEFAULT_BOARDS_PREFERENCES, ref);
    expect(once.publicBoards).toEqual([ref]);
    expect(addPublicBoard(once, ref)).toBe(once);
    expect(addPublicBoard(once, {shortLink: 'l0COP24j', name: 'Roadmap'})).toBe(
      once,
    );
  });

  it('removes a public board', () => {
    const added = addPublicBoard(DEFAULT_BOARDS_PREFERENCES, ref);
    expect(removePublicBoard(added, ref.shortLink).publicBoards).toEqual([]);
  });
});

describe('parseBoardShortLink', () => {
  it.each([
    ['https://trello.com/b/l0COP24j/supernote-roadmap', 'l0COP24j'],
    ['https://trello.com/b/l0COP24j', 'l0COP24j'],
    ['trello.com/b/l0COP24j/name?filter=x', 'l0COP24j'],
    ['http://www.trello.com/b/AbCd1234/', 'AbCd1234'],
    ['  AbCd1234 ', 'AbCd1234'],
  ])('reads %p', (input, expected) => {
    expect(parseBoardShortLink(input)).toBe(expected);
  });

  it.each([
    '',
    'AbCd123',
    'https://trello.com/c/AbCd1234/card',
    'https://example.com/b/AbCd1234',
    'https://trello.com/b/AbCd12345',
  ])('rejects %p', input => {
    expect(parseBoardShortLink(input)).toBeNull();
  });
});

describe('organizationLogoUrl', () => {
  it('completes base logo URLs with the size', () => {
    expect(
      organizationLogoUrl({id: 'o', logoUrl: 'https://logos/o/h'}, 50),
    ).toBe('https://logos/o/h/50.png');
  });

  it('keeps full image URLs', () => {
    expect(
      organizationLogoUrl({id: 'o', logoUrl: 'https://logos/o/h/170.png'}, 50),
    ).toBe('https://logos/o/h/170.png');
  });

  it('builds the URL from the logo hash', () => {
    expect(organizationLogoUrl({id: 'o', logoHash: 'h'}, 30)).toBe(
      'https://trello-logos.s3.amazonaws.com/o/h/30.png',
    );
  });

  it('returns null without a logo', () => {
    expect(organizationLogoUrl({id: 'o'}, 50)).toBeNull();
  });
});
