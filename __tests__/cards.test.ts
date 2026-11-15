jest.mock('sn-plugin-lib', () => ({}));

import {
  canAddCards,
  hasHiddenBoards,
  isObserverOf,
  offerBoards,
  orderLists,
  parseCheckItem,
  splitCardText,
} from '../src/cards/ordering';
import {
  checkItemsToCreate,
  defaultChoice,
  membersMeFirst,
  toggleId,
} from '../src/cards/newCardForm';
import {
  addCardChecklist,
  NEW_CARD_CHECKLIST_NAME,
} from '../src/cards/checklist';
import {
  CARD_PREFERENCES_KEY,
  loadCardPreferences,
  mostUsedBoardId,
  rememberCardDestination,
} from '../src/cards/preferences';
import {ButtonId} from '../src/plugin/constants';
import {
  CAPTURE_WAIT_MS,
  getLaunchIntent,
  handleButtonPress,
} from '../src/plugin/launchIntent';
import {recognizedText} from '../src/plugin/lassoText';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoard, TrelloList} from '../src/trello';

function board(id: string, starred: boolean): TrelloBoard {
  return {
    id,
    name: id,
    url: '',
    shortLink: id,
    closed: false,
    starred,
    idOrganization: null,
  };
}

function list(id: string, pos: number): TrelloList {
  return {id, name: id, closed: false, pos, idBoard: 'b'};
}

// Sorted like TrelloClient.getMyBoards: starred first, then by name.
const BOARDS = [
  board('fav-a', true),
  board('fav-b', true),
  board('plain-c', false),
  board('plain-d', false),
];

const ids = (items: Array<{id: string}>) => items.map(item => item.id);
const offeredIds = (items: Array<{board: TrelloBoard}>) =>
  items.map(item => item.board.id);

function withMembership(
  base: TrelloBoard,
  memberType: string,
  idMember = 'me',
): TrelloBoard {
  return {
    ...base,
    memberships: [{id: `m-${base.id}`, idMember, memberType}],
  };
}

describe('offerBoards', () => {
  it('offers starred boards by default', () => {
    expect(offeredIds(offerBoards({boards: BOARDS, showAll: false}))).toEqual([
      'fav-a',
      'fav-b',
    ]);
  });

  it('puts the last used starred board first', () => {
    expect(
      offeredIds(
        offerBoards({boards: BOARDS, lastUsedId: 'fav-b', showAll: false}),
      ),
    ).toEqual(['fav-b', 'fav-a']);
  });

  it('includes the last used board even if it is not starred', () => {
    expect(
      offeredIds(
        offerBoards({boards: BOARDS, lastUsedId: 'plain-d', showAll: false}),
      ),
    ).toEqual(['plain-d', 'fav-a', 'fav-b']);
  });

  it('puts the most used board first, then the last used one', () => {
    const offered = offerBoards({
      boards: BOARDS,
      mostUsedId: 'plain-c',
      lastUsedId: 'fav-b',
      showAll: false,
    });
    expect(offeredIds(offered)).toEqual(['plain-c', 'fav-b', 'fav-a']);
    expect(offered.map(item => item.badges)).toEqual([
      ['mostUsed'],
      ['lastUsed'],
      [],
    ]);
  });

  it('gives both badges to a board most and last used', () => {
    const [first] = offerBoards({
      boards: BOARDS,
      mostUsedId: 'plain-d',
      lastUsedId: 'plain-d',
      showAll: false,
    });
    expect(first.board.id).toBe('plain-d');
    expect(first.badges).toEqual(['mostUsed', 'lastUsed']);
  });

  it('adds the public boards after the member boards, once', () => {
    const pub = board('pub-x', false);
    const offered = offerBoards({
      boards: BOARDS,
      publicBoards: [pub, pub, BOARDS[2]],
      showAll: false,
    });
    expect(offeredIds(offered)).toEqual(['fav-a', 'fav-b', 'plain-c', 'pub-x']);
    expect(offered[2].badges).toEqual(['public']);
    expect(offered[3].badges).toEqual(['public']);
  });

  it('can make a public board the favorite', () => {
    const pub = board('pub-x', false);
    expect(
      offeredIds(
        offerBoards({
          boards: BOARDS,
          publicBoards: [pub],
          mostUsedId: 'pub-x',
          showAll: false,
        }),
      ),
    ).toEqual(['pub-x', 'fav-a', 'fav-b']);
  });

  it('shows every board on demand, last used first', () => {
    expect(
      offeredIds(
        offerBoards({boards: BOARDS, lastUsedId: 'plain-c', showAll: true}),
      ),
    ).toEqual(['plain-c', 'fav-a', 'fav-b', 'plain-d']);
  });

  it('ignores unknown most and last used boards', () => {
    expect(
      offeredIds(
        offerBoards({
          boards: BOARDS,
          mostUsedId: 'gone',
          lastUsedId: 'gone-too',
          showAll: true,
        }),
      ),
    ).toEqual(ids(BOARDS));
  });

  it('tells whether boards are hidden', () => {
    expect(hasHiddenBoards({boards: BOARDS})).toBe(true);
    expect(hasHiddenBoards({boards: BOARDS.slice(0, 2)})).toBe(false);
    expect(
      hasHiddenBoards({boards: BOARDS.slice(0, 2), publicBoards: [BOARDS[3]]}),
    ).toBe(false);
  });
});

describe('board permissions', () => {
  it('lets normal and admin members add cards', () => {
    expect(canAddCards(withMembership(BOARDS[0], 'normal'), 'me', false)).toBe(
      true,
    );
    expect(canAddCards(withMembership(BOARDS[0], 'admin'), 'me', false)).toBe(
      true,
    );
  });

  it('refuses observers, other members and deactivated members', () => {
    expect(canAddCards(withMembership(BOARDS[0], 'observer'), 'me', true)).toBe(
      false,
    );
    expect(
      canAddCards(withMembership(BOARDS[0], 'normal', 'other'), 'me', true),
    ).toBe(false);
    const deactivated: TrelloBoard = {
      ...BOARDS[0],
      memberships: [
        {id: 'm', idMember: 'me', memberType: 'normal', deactivated: true},
      ],
    };
    expect(canAddCards(deactivated, 'me', true)).toBe(false);
  });

  it('falls back without membership data', () => {
    expect(canAddCards(BOARDS[0], 'me', true)).toBe(true);
    expect(canAddCards(BOARDS[0], 'me', false)).toBe(false);
  });

  it('spots observers only', () => {
    expect(isObserverOf(withMembership(BOARDS[0], 'observer'), 'me')).toBe(
      true,
    );
    expect(isObserverOf(withMembership(BOARDS[0], 'normal'), 'me')).toBe(false);
    expect(isObserverOf(BOARDS[0], 'me')).toBe(false);
  });
});

describe('orderLists', () => {
  it('keeps board order with the last used list first', () => {
    const lists = [list('todo', 1), list('doing', 2), list('done', 3)];
    expect(ids(orderLists(lists, 'done'))).toEqual(['done', 'todo', 'doing']);
    expect(ids(orderLists(lists, undefined))).toEqual([
      'todo',
      'doing',
      'done',
    ]);
  });
});

describe('splitCardText', () => {
  it('uses the first non-empty line as the title', () => {
    expect(
      splitCardText('\n  Buy milk \r\n2 litres\n\nsemi-skimmed\n'),
    ).toEqual({
      name: 'Buy milk',
      desc: '2 litres\n\nsemi-skimmed',
      checkItems: [],
    });
  });

  it('handles empty text', () => {
    expect(splitCardText(' \n ')).toEqual({
      name: '',
      desc: '',
      checkItems: [],
    });
  });

  it('turns lines starting with a square into checklist items', () => {
    expect(
      splitCardText(
        'Donate button\nAdd a support link\n☐ Buy me a coffee\n□Don paypal\nin the footer\n☑ Draft the text\n[ ] Test\n[x] Ship',
      ),
    ).toEqual({
      name: 'Donate button',
      desc: 'Add a support link\nin the footer',
      checkItems: [
        {name: 'Buy me a coffee', checked: false},
        {name: 'Don paypal', checked: false},
        {name: 'Draft the text', checked: true},
        {name: 'Test', checked: false},
        {name: 'Ship', checked: true},
      ],
    });
  });

  it('takes the title from the first line without a square', () => {
    expect(splitCardText('☐ First item\nTitle\n☐ Second item')).toEqual({
      name: 'Title',
      desc: '',
      checkItems: [
        {name: 'First item', checked: false},
        {name: 'Second item', checked: false},
      ],
    });
  });

  it('keeps a lone square as text', () => {
    expect(splitCardText('Title\n☐').desc).toBe('☐');
  });
});

describe('checklist text', () => {
  it('reads parseable lines only', () => {
    expect(parseCheckItem('  ☐  Buy milk ')).toEqual({
      name: 'Buy milk',
      checked: false,
    });
    expect(parseCheckItem('■ Done')).toEqual({name: 'Done', checked: true});
    expect(parseCheckItem('Buy milk')).toBeNull();
    expect(parseCheckItem('[a] Buy milk')).toBeNull();
  });
});

describe('new card form', () => {
  const lists = [
    {id: 'l1', name: 'TODO'},
    {id: 'l2', name: 'WIP'},
  ];

  it('fills in the choice used last, if still offered', () => {
    expect(defaultChoice(lists, 'l2')).toBe(lists[1]);
  });

  it('fills in the only choice, else leaves it to the user', () => {
    expect(defaultChoice(lists, 'gone')).toBeNull();
    expect(defaultChoice(lists, undefined)).toBeNull();
    expect(defaultChoice([lists[0]], 'gone')).toBe(lists[0]);
    expect(defaultChoice([], undefined)).toBeNull();
  });

  it('adds and removes labels or members', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('lists the connected member first, then by name', () => {
    const members = [
      {id: 'm3', fullName: 'zoé'},
      {id: 'm1', fullName: 'Bob'},
      {id: 'me', fullName: 'Me'},
      {id: 'm2', fullName: 'alice'},
    ];
    expect(membersMeFirst(members, 'me').map(m => m.id)).toEqual([
      'me',
      'm2',
      'm1',
      'm3',
    ]);
  });

  it('drops blank checklist rows and trims names', () => {
    expect(
      checkItemsToCreate([
        {key: '0', name: ' Buy milk ', checked: true},
        {key: '1', name: '   ', checked: false},
        {key: '2', name: 'Oat', checked: false},
      ]),
    ).toEqual([
      {name: 'Buy milk', checked: true},
      {name: 'Oat', checked: false},
    ]);
  });
});

describe('addCardChecklist', () => {
  function fakeClient() {
    const calls: string[] = [];
    return {
      calls,
      createChecklist: jest.fn(async (cardId: string, name: string) => {
        calls.push(`checklist ${cardId} ${name}`);
        return {id: 'cl1', name};
      }),
      addCheckItem: jest.fn(
        async (checklistId: string, name: string, checked?: boolean) => {
          calls.push(`item ${checklistId} ${name} ${checked}`);
        },
      ),
    };
  }

  it('creates the "Check-list" checklist with its items in order', async () => {
    const client = fakeClient();
    await addCardChecklist(client, 'c1', [
      {name: 'Buy me a coffee', checked: false},
      {name: 'Don paypal', checked: true},
    ]);
    expect(NEW_CARD_CHECKLIST_NAME).toBe('Check-list');
    expect(client.calls).toEqual([
      'checklist c1 Check-list',
      'item cl1 Buy me a coffee false',
      'item cl1 Don paypal true',
    ]);
  });

  it('adds no checklist without items', async () => {
    const client = fakeClient();
    await addCardChecklist(client, 'c1', []);
    expect(client.createChecklist).not.toHaveBeenCalled();
  });

  it('moves an overly long first line to the description', () => {
    const long = 'x'.repeat(300);
    const {name, desc} = splitCardText(`${long}\nmore`);
    expect(name.length).toBe(200);
    expect(name.endsWith('…')).toBe(true);
    expect(desc).toBe(`${long}\nmore`);
  });
});

describe('card preferences', () => {
  it('defaults when nothing is stored or data is corrupted', async () => {
    const store = createMemoryStore();
    expect(await loadCardPreferences(store)).toEqual({lastListByBoard: {}});
    await store.setItem(CARD_PREFERENCES_KEY, '{not json');
    expect(await loadCardPreferences(store)).toEqual({lastListByBoard: {}});
  });

  it('remembers the last board and the last list per board', async () => {
    const store = createMemoryStore();
    let prefs = await loadCardPreferences(store);
    prefs = await rememberCardDestination(store, prefs, 'b1', 'l1');
    await rememberCardDestination(store, prefs, 'b2', 'l2');
    expect(await loadCardPreferences(store)).toEqual({
      lastBoardId: 'b2',
      lastListByBoard: {b1: 'l1', b2: 'l2'},
      useCountByBoard: {b1: 1, b2: 1},
    });
  });

  it('counts cards per board to find the most used one', async () => {
    const store = createMemoryStore();
    let prefs = await loadCardPreferences(store);
    expect(mostUsedBoardId(prefs)).toBeUndefined();
    prefs = await rememberCardDestination(store, prefs, 'b1', 'l1');
    prefs = await rememberCardDestination(store, prefs, 'b1', 'l1');
    prefs = await rememberCardDestination(store, prefs, 'b2', 'l2');
    expect(mostUsedBoardId(prefs)).toBe('b1');
    prefs = await rememberCardDestination(store, prefs, 'b2', 'l2');
    // Tie: the board used last wins.
    expect(mostUsedBoardId(prefs)).toBe('b2');
    expect(mostUsedBoardId(await loadCardPreferences(store))).toBe('b2');
  });

  it('reads preferences saved before usage counts existed', async () => {
    const store = createMemoryStore();
    await store.setItem(
      CARD_PREFERENCES_KEY,
      JSON.stringify({lastBoardId: 'b1', lastListByBoard: {b1: 'l1'}}),
    );
    const prefs = await loadCardPreferences(store);
    expect(prefs.useCountByBoard).toBeUndefined();
    expect(mostUsedBoardId(prefs)).toBeUndefined();
    await store.setItem(
      CARD_PREFERENCES_KEY,
      JSON.stringify({lastListByBoard: {}, useCountByBoard: {b1: 'x'}}),
    );
    expect((await loadCardPreferences(store)).useCountByBoard).toBeUndefined();
  });
});

describe('launch intent', () => {
  const readText = () => Promise.resolve({ok: true as const, text: 'Buy milk'});

  it('follows the pressed button', () => {
    handleButtonPress(ButtonId.LassoCreateCard, {readSelection: readText});
    const first = getLaunchIntent();
    expect(first.kind).toBe('lassoCreateCard');

    handleButtonPress(ButtonId.LassoCreateCard, {readSelection: readText});
    const second = getLaunchIntent();
    expect(second).not.toEqual(first);

    handleButtonPress(ButtonId.Open);
    expect(getLaunchIntent()).toEqual({kind: 'boards'});

    expect(handleButtonPress(9999)).toBeNull();
    expect(getLaunchIntent()).toEqual({kind: 'boards'});
  });

  it('reads the lasso selection when the button is pressed', async () => {
    const read = jest.fn(readText);
    const intent = handleButtonPress(ButtonId.LassoCreateCard, {
      readSelection: read,
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(intent?.kind).toBe('lassoCreateCard');
    if (intent?.kind === 'lassoCreateCard') {
      await expect(intent.lasso).resolves.toEqual({ok: true, text: 'Buy milk'});
    }
  });

  it('opens the view once captured, and recognizes after it', async () => {
    const events: string[] = [];
    const intent = handleButtonPress(ButtonId.LassoCreateCard, {
      openView: async () => {
        await Promise.resolve();
        events.push('view open');
      },
      readSelection: async onCaptured => {
        events.push('captured');
        await onCaptured();
        events.push('recognized');
        return {ok: true, text: 'Buy milk'};
      },
    });
    if (intent?.kind !== 'lassoCreateCard') {
      throw new Error('Expected a lasso intent');
    }
    await intent.lasso;
    expect(events).toEqual(['captured', 'view open', 'recognized']);
  });

  it('opens the view once, even if the reader never captured', async () => {
    const openView = jest.fn(() => Promise.resolve());
    const intent = handleButtonPress(ButtonId.LassoCreateCard, {
      openView,
      readSelection: () =>
        Promise.resolve({ok: false, error: 'noSelection', diagnostics: ''}),
    });
    if (intent?.kind !== 'lassoCreateCard') {
      throw new Error('Expected a lasso intent');
    }
    await intent.lasso;
    expect(openView).toHaveBeenCalledTimes(1);
  });

  it('still reads the selection if the view fails to open', async () => {
    const intent = handleButtonPress(ButtonId.LassoCreateCard, {
      openView: () => Promise.reject(new Error('no view')),
      readSelection: async onCaptured => {
        await onCaptured();
        return {ok: true, text: 'Buy milk'};
      },
    });
    if (intent?.kind !== 'lassoCreateCard') {
      throw new Error('Expected a lasso intent');
    }
    await expect(intent.lasso).resolves.toEqual({ok: true, text: 'Buy milk'});
  });

  it('opens the view anyway when the lasso read never answers', () => {
    jest.useFakeTimers();
    try {
      const openView = jest.fn(() => Promise.resolve());
      handleButtonPress(ButtonId.LassoCreateCard, {
        openView,
        readSelection: () => new Promise(() => {}),
      });
      jest.advanceTimersByTime(CAPTURE_WAIT_MS - 1);
      expect(openView).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(openView).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('turns a failing reader into a "no selection" result', async () => {
    const intent = handleButtonPress(ButtonId.LassoCreateCard, {
      readSelection: () => Promise.reject(new Error('boom')),
    });
    if (intent?.kind !== 'lassoCreateCard') {
      throw new Error('Expected a lasso intent');
    }
    await expect(intent.lasso).resolves.toMatchObject({
      ok: false,
      error: 'noSelection',
    });
  });
});

describe('recognizedText', () => {
  it('reads the text whatever shape the host returns', () => {
    expect(recognizedText({success: true, result: ' hello '})).toBe('hello');
    expect(recognizedText({success: true, result: {text: 'a'}})).toBe('a');
    expect(recognizedText({success: true, result: null})).toBe('');
    expect(
      recognizedText({success: false, error: {code: 1, message: 'x'}}),
    ).toBe('');
    expect(recognizedText(undefined)).toBe('');
  });
});
