import {cardShortLink, chipIds} from '../src/cards/newCardForm';
import {
  DEFAULT_NEW_CARD_SETTINGS,
  loadNewCardSettings,
  NEW_CARD_SETTINGS_KEY,
  saveNewCardSettings,
} from '../src/cards/newCardSettings';
import {
  CARD_PREFERENCES_KEY,
  EMPTY_PREFERENCES,
  loadCardPreferences,
  mostUsedIds,
  rememberCardDestination,
} from '../src/cards/preferences';
import {createMemoryStore} from '../src/storage/keyValueStore';

describe('label and member use', () => {
  it('counts the labels and members of each new card, per board', async () => {
    const store = createMemoryStore();
    let prefs = await rememberCardDestination(
      store,
      EMPTY_PREFERENCES,
      'b1',
      'l1',
      {labelIds: ['bug', 'wip'], memberIds: ['me'], at: 100},
    );
    prefs = await rememberCardDestination(store, prefs, 'b1', 'l1', {
      labelIds: ['bug'],
      memberIds: [],
      at: 200,
    });
    expect(prefs.labelUseByBoard).toEqual({
      b1: {bug: {count: 2, last: 200}, wip: {count: 1, last: 100}},
    });
    expect(prefs.memberUseByBoard).toEqual({b1: {me: {count: 1, last: 100}}});
    expect(await loadCardPreferences(store)).toEqual(prefs);
  });

  it('ranks by use, then by last use, among the ids still offered', () => {
    const stats = {
      a: {count: 1, last: 300},
      b: {count: 3, last: 100},
      c: {count: 1, last: 500},
      gone: {count: 9, last: 900},
    };
    expect(mostUsedIds(stats, ['a', 'b', 'c', 'd'], 3)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(mostUsedIds(stats, ['a', 'b', 'c'], 2)).toEqual(['b', 'c']);
    expect(mostUsedIds(stats, ['a'], 0)).toEqual([]);
    expect(mostUsedIds(undefined, ['a'], 3)).toEqual([]);
  });

  it('drops corrupted statistics when reading', async () => {
    const store = createMemoryStore();
    await store.setItem(
      CARD_PREFERENCES_KEY,
      JSON.stringify({
        lastListByBoard: {},
        labelUseByBoard: {
          b1: {x: {count: 'many'}},
          b2: {y: {count: 2, last: 1}},
        },
        memberUseByBoard: [],
      }),
    );
    const prefs = await loadCardPreferences(store);
    expect(prefs.labelUseByBoard).toEqual({b2: {y: {count: 2, last: 1}}});
    expect(prefs.memberUseByBoard).toBeUndefined();
  });
});

describe('new card chips', () => {
  it('shows the suggestions, then the other selected ones in board order', () => {
    expect(chipIds(['a', 'b', 'c', 'd'], ['c', 'a'], ['d', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
    expect(chipIds(['a', 'b'], [], [])).toEqual([]);
  });

  it('finds the short link of a new card', () => {
    expect(cardShortLink({shortLink: 'Ab12', shortUrl: ''})).toBe('Ab12');
    expect(cardShortLink({shortUrl: 'https://trello.com/c/WiqqWiQD'})).toBe(
      'WiqqWiQD',
    );
    expect(cardShortLink({shortUrl: 'https://trello.com/'})).toBeNull();
  });
});

describe('new card settings', () => {
  it('defaults to 3 suggestions, assign me on, link off', async () => {
    const store = createMemoryStore();
    expect(await loadNewCardSettings(store)).toEqual({
      suggestionCount: 3,
      assignMe: true,
      linkSelection: false,
    });
    expect(DEFAULT_NEW_CARD_SETTINGS.suggestionCount).toBe(3);
  });

  it('saves the settings and ignores corrupted values', async () => {
    const store = createMemoryStore();
    await saveNewCardSettings(store, {
      suggestionCount: 5,
      assignMe: false,
      linkSelection: true,
    });
    expect(await loadNewCardSettings(store)).toEqual({
      suggestionCount: 5,
      assignMe: false,
      linkSelection: true,
    });
    await store.setItem(
      NEW_CARD_SETTINGS_KEY,
      JSON.stringify({suggestionCount: 4, assignMe: 'yes'}),
    );
    expect(await loadNewCardSettings(store)).toEqual(DEFAULT_NEW_CARD_SETTINGS);
  });
});
