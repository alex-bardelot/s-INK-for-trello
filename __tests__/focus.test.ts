import {
  DEFAULT_FOCUS_SETTINGS,
  FOCUS_SETTINGS_KEY,
  focusBoard,
  focusLabelChoices,
  isFocusCard,
  isReviewCard,
  loadFocusSettings,
  ModeFilter,
  modeMemberChoices,
  ReviewFilter,
  reviewBoard,
  saveFocusSettings,
  SELF_MEMBER,
  stackLists,
  toggleFocusLabel,
  toggleModeMember,
} from '../src/board/focus';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloBoardCard, TrelloList} from '../src/trello';

/** Id of the member signed in on the tablet. */
const ME = 'm-tablet';
const SELF = {id: SELF_MEMBER, name: ''};

function filter(
  labels: string[] = [],
  members = [SELF],
): ModeFilter {
  return {labels, members};
}

function review(
  completion: ReviewFilter['completion'],
  options: Partial<ModeFilter> = {},
): ReviewFilter {
  return {...filter(), ...options, completion};
}

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
  it('keeps open cards assigned to the tablet account by default', () => {
    const focus = DEFAULT_FOCUS_SETTINGS.focus;
    expect(isFocusCard(card('a', 'l'), ME, focus)).toBe(true);
    expect(isFocusCard(card('a', 'l', {members: ['other']}), ME, focus)).toBe(
      false,
    );
    expect(isFocusCard(card('a', 'l', {done: true}), ME, focus)).toBe(false);
  });

  it('requires one of the Focus labels, ignoring case', () => {
    const focus = filter(['TODO', 'WIP']);
    expect(isFocusCard(card('a', 'l', {labels: ['todo']}), ME, focus)).toBe(
      true,
    );
    expect(
      isFocusCard(card('a', 'l', {labels: ['Best Effort', 'WIP']}), ME, focus),
    ).toBe(true);
    expect(
      isFocusCard(card('a', 'l', {labels: ['Best Effort']}), ME, focus),
    ).toBe(false);
    expect(isFocusCard(card('a', 'l'), ME, focus)).toBe(false);
  });

  it('keeps the cards of any checked member, or of anyone when none is', () => {
    const others = filter([], [{id: 'x', name: 'X'}]);
    expect(isFocusCard(card('a', 'l', {members: ['x', 'y']}), ME, others)).toBe(
      true,
    );
    expect(isFocusCard(card('a', 'l'), ME, others)).toBe(false);
    const anyone = filter([], []);
    expect(isFocusCard(card('a', 'l', {members: []}), ME, anyone)).toBe(true);
  });
});

describe('isReviewCard', () => {
  it('keeps the cards of the chosen completion', () => {
    const done = card('a', 'l', {done: true});
    const open = card('b', 'l');
    expect(isReviewCard(done, ME, review('complete'))).toBe(true);
    expect(isReviewCard(open, ME, review('complete'))).toBe(false);
    expect(isReviewCard(done, ME, review('incomplete'))).toBe(false);
    expect(isReviewCard(open, ME, review('incomplete'))).toBe(true);
    expect(isReviewCard(done, ME, review('all'))).toBe(true);
    expect(isReviewCard(open, ME, review('all'))).toBe(true);
  });

  it('applies the Review labels and members', () => {
    const done = card('a', 'l', {done: true, labels: ['QA'], members: ['x']});
    expect(isReviewCard(done, ME, review('complete'))).toBe(false);
    expect(
      isReviewCard(done, ME, review('complete', {members: [], labels: ['qa']})),
    ).toBe(true);
    expect(
      isReviewCard(done, ME, review('complete', {members: [], labels: ['UX']})),
    ).toBe(false);
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
    const result = focusBoard(lists, cardsByList, ME, filter(['TODO', 'WIP']));
    expect(result.lists.map(l => l.id)).toEqual(['git']);
    expect(result.cardsByList.get('git')?.map(c => c.id)).toEqual(['g1']);
  });
});

describe('reviewBoard', () => {
  it('keeps completed cards, of anyone when no member is checked', () => {
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
    const result = reviewBoard(
      lists,
      cardsByList,
      ME,
      review('complete', {members: []}),
    );
    expect(result.lists.map(l => l.id)).toEqual(['sprint', 'done']);
    expect(result.cardsByList.get('sprint')?.map(c => c.id)).toEqual(['s1']);
    expect(result.cardsByList.get('done')?.map(c => c.id)).toEqual(['d1']);
  });
});

describe('focus labels', () => {
  it('lists distinct named labels plus the selected ones', () => {
    const names = ['WIP', 'TODO', '', 'todo', ' Best Effort '];
    expect(focusLabelChoices(names, ['Urgent', 'wip'])).toEqual([
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
      ...DEFAULT_FOCUS_SETTINGS,
      mode: 'focus',
      focus: filter(['WIP']),
    });
  });

  it('gives the single label list of older settings to Focus mode', async () => {
    const store = createMemoryStore();
    await store.setItem(
      FOCUS_SETTINGS_KEY,
      '{"mode":"review","labels":["TODO"]}',
    );
    expect(await loadFocusSettings(store)).toEqual({
      enabled: true,
      mode: 'review',
      focus: filter(['TODO']),
      review: review('complete'),
    });
  });

  it('keeps the modes on unless turned off, with no mode once off', async () => {
    const store = createMemoryStore();
    await store.setItem(FOCUS_SETTINGS_KEY, '{"mode":"focus"}');
    expect(await loadFocusSettings(store)).toMatchObject({
      enabled: true,
      mode: 'focus',
    });
    await store.setItem(FOCUS_SETTINGS_KEY, '{"enabled":true,"mode":null}');
    expect(await loadFocusSettings(store)).toMatchObject({
      enabled: true,
      mode: null,
    });
    await store.setItem(FOCUS_SETTINGS_KEY, '{"enabled":false,"mode":"focus"}');
    expect(await loadFocusSettings(store)).toMatchObject({
      enabled: false,
      mode: null,
    });
    // Before Review mode, `enabled: false` only meant Focus mode was off.
    await store.setItem(FOCUS_SETTINGS_KEY, '{"enabled":false,"labels":[]}');
    expect(await loadFocusSettings(store)).toMatchObject({
      enabled: true,
      mode: null,
    });
  });

  it('round-trips the settings and survives corrupted values', async () => {
    const store = createMemoryStore();
    expect(await loadFocusSettings(store)).toEqual(DEFAULT_FOCUS_SETTINGS);
    const saved = {
      enabled: true,
      mode: 'review' as const,
      focus: filter(['TODO', 'WIP'], []),
      review: review('all', {labels: ['QA'], members: [{id: 'x', name: 'X'}]}),
    };
    await saveFocusSettings(store, saved);
    expect(await loadFocusSettings(store)).toEqual(saved);
    await store.setItem(
      FOCUS_SETTINGS_KEY,
      '{"enabled":"yes","labels":[1],"review":{"completion":"zen","members":[{"id":""},3]}}',
    );
    expect(await loadFocusSettings(store)).toEqual({
      ...DEFAULT_FOCUS_SETTINGS,
      review: review('complete', {members: []}),
    });
    await store.setItem(FOCUS_SETTINGS_KEY, '{"mode":"zen"}');
    expect((await loadFocusSettings(store)).mode).toBeNull();
    await store.setItem(FOCUS_SETTINGS_KEY, 'not json');
    expect(await loadFocusSettings(store)).toEqual(DEFAULT_FOCUS_SETTINGS);
  });
});

describe('mode members', () => {
  it('offers the tablet account first, then the others by name', () => {
    const board = [
      {id: 'z', fullName: 'Zoé'},
      {id: ME, fullName: 'Me Myself'},
      {id: 'a', fullName: 'alice'},
    ];
    const selected = [SELF, {id: 'gone', name: 'Bob'}];
    expect(modeMemberChoices(board, selected, ME)).toEqual([
      {id: SELF_MEMBER, name: '', self: true},
      {id: 'a', name: 'alice', self: false},
      {id: 'gone', name: 'Bob', self: false},
      {id: 'z', name: 'Zoé', self: false},
    ]);
  });

  it('toggles a member', () => {
    const bob = {id: 'b', name: 'Bob'};
    expect(toggleModeMember([SELF], bob)).toEqual([SELF, bob]);
    expect(toggleModeMember([SELF, bob], SELF)).toEqual([bob]);
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
