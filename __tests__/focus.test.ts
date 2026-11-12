import {
  FOCUS_SETTINGS_KEY,
  focusBoard,
  focusLabelChoices,
  isFocusCard,
  loadFocusSettings,
  reviewBoard,
  saveFocusSettings,
  stackLists,
  toggleFocusLabel,
  toggleMode,
} from '../src/board/focus';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoardCard, TrelloList} from '../src/trello';

const ME = 'me';

function card(
  id: string,
  idList: string,
  options: {members?: string[]; labels?: string[]; done?: boolean} = {},
): TrelloBoardCard {
  return {
    id,
    name: id,
    idList,
    pos: 0,
    due: null,
    dueComplete: options.done ?? false,
    badges: {checkItems: 0, checkItemsChecked: 0, description: false},
    labels: (options.labels ?? []).map(name => ({
      id: `${id}-${name}`,
      name,
      color: null,
    })),
    idMembers: options.members ?? [ME],
  };
}

function list(id: string): TrelloList {
  return {id, name: id, closed: false, pos: 0, idBoard: 'b'};
}

describe('isFocusCard', () => {
  it('keeps open cards assigned to the member', () => {
    expect(isFocusCard(card('a', 'l'), ME, [])).toBe(true);
    expect(isFocusCard(card('a', 'l', {members: ['other']}), ME, [])).toBe(
      false,
    );
    expect(isFocusCard(card('a', 'l', {done: true}), ME, [])).toBe(false);
  });

  it('requires one of the Focus labels, ignoring case', () => {
    const labels = ['TODO', 'WIP'];
    expect(isFocusCard(card('a', 'l', {labels: ['todo']}), ME, labels)).toBe(
      true,
    );
    expect(
      isFocusCard(card('a', 'l', {labels: ['Best Effort', 'WIP']}), ME, labels),
    ).toBe(true);
    expect(
      isFocusCard(card('a', 'l', {labels: ['Best Effort']}), ME, labels),
    ).toBe(false);
    expect(isFocusCard(card('a', 'l'), ME, labels)).toBe(false);
  });
});

describe('focusBoard', () => {
  it('drops other cards and the lists left empty', () => {
    const lists = [list('git'), list('sprint'), list('done')];
    const cardsByList = new Map([
      ['git', [card('g1', 'git', {labels: ['TODO']}), card('g2', 'git')]],
      ['sprint', [card('s1', 'sprint', {labels: ['WIP'], members: ['x']})]],
      ['done', [card('d1', 'done', {labels: ['TODO'], done: true})]],
    ]);
    const result = focusBoard(lists, cardsByList, ME, ['TODO', 'WIP']);
    expect(result.lists.map(l => l.id)).toEqual(['git']);
    expect(result.cardsByList.get('git')?.map(c => c.id)).toEqual(['g1']);
  });
});

describe('reviewBoard', () => {
  it('keeps every completed card, whoever it is assigned to', () => {
    const lists = [list('sprint'), list('backlog'), list('done')];
    const cardsByList = new Map([
      [
        'sprint',
        [
          card('s1', 'sprint', {done: true, members: ['x']}),
          card('s2', 'sprint'),
        ],
      ],
      ['backlog', [card('b1', 'backlog')]],
      ['done', [card('d1', 'done', {done: true}), card('d2', 'done')]],
    ]);
    const result = reviewBoard(lists, cardsByList);
    expect(result.lists.map(l => l.id)).toEqual(['sprint', 'done']);
    expect(result.cardsByList.get('sprint')?.map(c => c.id)).toEqual(['s1']);
    expect(result.cardsByList.get('done')?.map(c => c.id)).toEqual(['d1']);
  });
});

describe('toggleMode', () => {
  it('keeps at most one mode on', () => {
    const off = {mode: null, labels: ['TODO']};
    expect(toggleMode(off, 'focus')).toEqual({mode: 'focus', labels: ['TODO']});
    expect(toggleMode({...off, mode: 'focus'}, 'review').mode).toBe('review');
    expect(toggleMode({...off, mode: 'review'}, 'review').mode).toBeNull();
  });
});

describe('focus labels', () => {
  it('lists distinct named labels plus the selected ones', () => {
    const cards = [
      card('a', 'l', {labels: ['WIP', 'TODO', '']}),
      card('b', 'l', {labels: ['todo', 'Best Effort']}),
    ];
    expect(focusLabelChoices(cards, ['Urgent'])).toEqual([
      'Best Effort',
      'TODO',
      'Urgent',
      'WIP',
    ]);
  });

  it('toggles a label name, ignoring case', () => {
    expect(toggleFocusLabel(['TODO'], 'WIP')).toEqual(['TODO', 'WIP']);
    expect(toggleFocusLabel(['TODO', 'WIP'], 'todo')).toEqual(['WIP']);
  });

  it('turns Focus mode on for settings saved by 0.7.0', async () => {
    const store = createMemoryStore();
    await store.setItem(
      FOCUS_SETTINGS_KEY,
      '{"enabled":true,"labels":["WIP"]}',
    );
    expect(await loadFocusSettings(store)).toEqual({
      mode: 'focus',
      labels: ['WIP'],
    });
  });

  it('round-trips the settings and survives corrupted values', async () => {
    const store = createMemoryStore();
    expect(await loadFocusSettings(store)).toEqual({
      mode: null,
      labels: [],
    });
    await saveFocusSettings(store, {mode: 'review', labels: ['TODO', 'WIP']});
    expect(await loadFocusSettings(store)).toEqual({
      mode: 'review',
      labels: ['TODO', 'WIP'],
    });
    await store.setItem(FOCUS_SETTINGS_KEY, '{"enabled":"yes","labels":[1]}');
    expect(await loadFocusSettings(store)).toEqual({
      mode: null,
      labels: [],
    });
    await store.setItem(FOCUS_SETTINGS_KEY, '{"mode":"zen"}');
    expect((await loadFocusSettings(store)).mode).toBeNull();
    await store.setItem(FOCUS_SETTINGS_KEY, 'not json');
    expect(await loadFocusSettings(store)).toEqual({
      mode: null,
      labels: [],
    });
  });
});

describe('stackLists', () => {
  const block = (listId: string, ...heights: number[]) => ({
    listId,
    header: 10,
    cards: heights.map((height, i) => ({id: `${listId}${i}`, height})),
  });

  it('stacks short lists in the same column', () => {
    // a: 10 + 1 + 20 = 31; b: 31 + 5 + 10 + 1 + 20 = 67 <= 100.
    expect(stackLists([block('a', 20), block('b', 20)], 100, 1, 5)).toEqual([
      [
        {listId: 'a', cardIds: ['a0'], continued: false},
        {listId: 'b', cardIds: ['b0'], continued: false},
      ],
    ]);
  });

  it('continues a long list in the next column with its header', () => {
    expect(stackLists([block('a', 40, 40, 40)], 100, 0, 0)).toEqual([
      [{listId: 'a', cardIds: ['a0', 'a1'], continued: false}],
      [{listId: 'a', cardIds: ['a2'], continued: true}],
    ]);
  });

  it('never leaves a header alone at the bottom of a column', () => {
    // After a (10 + 70 = 80), b's header fits but not its first card.
    expect(stackLists([block('a', 70), block('b', 30)], 100, 0, 0)).toEqual([
      [{listId: 'a', cardIds: ['a0'], continued: false}],
      [{listId: 'b', cardIds: ['b0'], continued: false}],
    ]);
  });

  it('gives a card taller than a column a column of its own', () => {
    expect(stackLists([block('a', 20, 500, 20)], 100, 0, 0)).toEqual([
      [{listId: 'a', cardIds: ['a0'], continued: false}],
      [{listId: 'a', cardIds: ['a1'], continued: true}],
      [{listId: 'a', cardIds: ['a2'], continued: true}],
    ]);
  });
});
