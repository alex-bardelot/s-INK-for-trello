jest.mock('sn-plugin-lib', () => ({}));

import {
  hasHiddenBoards,
  orderBoards,
  orderLists,
  splitCardText,
} from '../src/cards/ordering';
import {
  CARD_PREFERENCES_KEY,
  loadCardPreferences,
  rememberCardDestination,
} from '../src/cards/preferences';
import {ButtonId} from '../src/plugin/constants';
import {getLaunchIntent, handleButtonPress} from '../src/plugin/launchIntent';
import {recognizedText} from '../src/plugin/lassoText';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoard, TrelloList} from '../src/trello';

function board(id: string, starred: boolean): TrelloBoard {
  return {id, name: id, url: '', closed: false, starred, idOrganization: null};
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

describe('orderBoards', () => {
  it('offers favorites by default', () => {
    expect(ids(orderBoards(BOARDS, undefined, false))).toEqual([
      'fav-a',
      'fav-b',
    ]);
  });

  it('puts the last used favorite first', () => {
    expect(ids(orderBoards(BOARDS, 'fav-b', false))).toEqual([
      'fav-b',
      'fav-a',
    ]);
  });

  it('includes the last used board even if it is not a favorite', () => {
    expect(ids(orderBoards(BOARDS, 'plain-d', false))).toEqual([
      'plain-d',
      'fav-a',
      'fav-b',
    ]);
  });

  it('shows every board on demand, last used first', () => {
    expect(ids(orderBoards(BOARDS, 'plain-c', true))).toEqual([
      'plain-c',
      'fav-a',
      'fav-b',
      'plain-d',
    ]);
  });

  it('ignores an unknown last board', () => {
    expect(ids(orderBoards(BOARDS, 'gone', true))).toEqual(ids(BOARDS));
  });

  it('tells whether boards are hidden', () => {
    expect(hasHiddenBoards(BOARDS, undefined)).toBe(true);
    expect(hasHiddenBoards(BOARDS.slice(0, 2), undefined)).toBe(false);
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
    ).toEqual({name: 'Buy milk', desc: '2 litres\n\nsemi-skimmed'});
  });

  it('handles empty text', () => {
    expect(splitCardText(' \n ')).toEqual({name: '', desc: ''});
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
    });
  });
});

describe('launch intent', () => {
  it('follows the pressed button', () => {
    handleButtonPress(ButtonId.LassoCreateCard);
    const first = getLaunchIntent();
    expect(first.kind).toBe('lassoCreateCard');

    handleButtonPress(ButtonId.LassoCreateCard);
    const second = getLaunchIntent();
    expect(second).not.toEqual(first);

    handleButtonPress(ButtonId.Open);
    expect(getLaunchIntent()).toEqual({kind: 'boards'});

    handleButtonPress(9999);
    expect(getLaunchIntent()).toEqual({kind: 'boards'});
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
