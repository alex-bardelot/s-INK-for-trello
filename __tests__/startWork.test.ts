import {planIsEmpty, planStartWork} from '../src/startWork/plan';
import {
  cardNoteFileName,
  cardNotesDir,
  isCardNoteFile,
} from '../src/startWork/noteFiles';
import {
  addLabelName,
  DEFAULT_START_WORK_SETTINGS,
  loadStartWorkSettings,
  removeLabelName,
  saveStartWorkSettings,
  START_WORK_SETTINGS_KEY,
  startWorkDisabled,
  StartWorkSettings,
} from '../src/startWork/settings';
import {applyStartWork} from '../src/startWork/startWork';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {TrelloApiError} from '../src/trello';

const ME = 'member-me';

const settingsWith = (
  patch: Partial<StartWorkSettings> = {},
): StartWorkSettings => ({...DEFAULT_START_WORK_SETTINGS, ...patch});

const BOARD_LABELS = [
  {id: 'l-todo', name: 'TODO'},
  {id: 'l-wip', name: 'WIP'},
  {id: 'l-bug', name: 'Bug'},
];
const LISTS = [
  {id: 'list-todo', name: 'To do'},
  {id: 'list-doing', name: 'In progress'},
];

const card = {
  id: 'card-1',
  idBoard: 'board-1',
  idList: 'list-todo',
  idMembers: ['someone'],
  labels: [
    {id: 'l-todo', name: 'todo'},
    {id: 'l-bug', name: 'Bug'},
  ],
};

describe('Start work settings', () => {
  it('assigns, swaps TODO for WIP and creates a note by default, without moving', () => {
    expect(DEFAULT_START_WORK_SETTINGS).toEqual({
      assignMe: true,
      removeLabels: true,
      removeLabelNames: ['TODO'],
      addLabels: true,
      addLabelNames: ['WIP'],
      moveToList: false,
      listName: '',
      createNote: true,
    });
  });

  it('adds names once, whatever their case, and removes them', () => {
    expect(addLabelName(['WIP'], ' wip ')).toEqual(['WIP']);
    expect(addLabelName(['WIP'], '  ')).toEqual(['WIP']);
    expect(addLabelName(['WIP'], ' Review ')).toEqual(['WIP', 'Review']);
    expect(removeLabelName(['WIP', 'Review'], 'wip')).toEqual(['Review']);
  });

  it('round-trips through the store and repairs bad values', async () => {
    const store = createMemoryStore();
    expect(await loadStartWorkSettings(store)).toEqual(
      DEFAULT_START_WORK_SETTINGS,
    );
    const custom = settingsWith({
      assignMe: false,
      addLabelNames: ['Doing'],
      moveToList: true,
      listName: 'In progress',
    });
    await saveStartWorkSettings(store, custom);
    expect(await loadStartWorkSettings(store)).toEqual(custom);

    await store.setItem(
      START_WORK_SETTINGS_KEY,
      JSON.stringify({
        assignMe: 'yes',
        removeLabelNames: ['A', 3, 'a', ''],
        listName: 42,
      }),
    );
    expect(await loadStartWorkSettings(store)).toEqual(
      settingsWith({removeLabelNames: ['A']}),
    );
    await store.setItem(START_WORK_SETTINGS_KEY, '{not json');
    expect(await loadStartWorkSettings(store)).toEqual(
      DEFAULT_START_WORK_SETTINGS,
    );
  });

  it('knows when Start would do nothing', () => {
    const off = settingsWith({
      assignMe: false,
      removeLabels: false,
      addLabels: false,
      createNote: false,
    });
    expect(startWorkDisabled(off)).toBe(true);
    expect(startWorkDisabled({...off, moveToList: true, listName: ' '})).toBe(
      true,
    );
    expect(startWorkDisabled({...off, moveToList: true, listName: 'X'})).toBe(
      false,
    );
    expect(startWorkDisabled(DEFAULT_START_WORK_SETTINGS)).toBe(false);
  });
});

describe('planStartWork', () => {
  it('assigns the member, removes and adds labels by name', () => {
    const plan = planStartWork(card, settingsWith(), ME, BOARD_LABELS, LISTS);
    expect(plan).toEqual({
      assign: true,
      removedLabels: [{id: 'l-todo', name: 'todo'}],
      addedLabels: [{id: 'l-wip', name: 'WIP'}],
      createdLabelNames: [],
      moveTo: null,
      missingListName: null,
    });
  });

  it('does not assign a member already on the card', () => {
    const plan = planStartWork(
      {...card, idMembers: [ME]},
      settingsWith(),
      ME,
      BOARD_LABELS,
      LISTS,
    );
    expect(plan.assign).toBe(false);
  });

  it('creates labels missing from the board, and skips those on the card', () => {
    const plan = planStartWork(
      card,
      settingsWith({addLabelNames: ['bug', 'Doing', 'doing']}),
      ME,
      BOARD_LABELS,
      LISTS,
    );
    expect(plan.addedLabels).toEqual([]);
    expect(plan.createdLabelNames).toEqual(['Doing']);
  });

  it('keeps a label both removed and added', () => {
    const plan = planStartWork(
      card,
      settingsWith({removeLabelNames: ['TODO', 'Bug'], addLabelNames: ['bug']}),
      ME,
      BOARD_LABELS,
      LISTS,
    );
    expect(plan.removedLabels).toEqual([{id: 'l-todo', name: 'todo'}]);
    expect(plan.addedLabels).toEqual([]);
  });

  it('moves the card to the list of that name, if it is elsewhere', () => {
    const settings = settingsWith({moveToList: true, listName: 'in PROGRESS'});
    expect(planStartWork(card, settings, ME, [], LISTS).moveTo).toEqual(
      LISTS[1],
    );
    expect(
      planStartWork({...card, idList: 'list-doing'}, settings, ME, [], LISTS)
        .moveTo,
    ).toBeNull();
    const missing = planStartWork(
      card,
      settingsWith({moveToList: true, listName: 'Done'}),
      ME,
      [],
      LISTS,
    );
    expect(missing.moveTo).toBeNull();
    expect(missing.missingListName).toBe('Done');
  });

  it('changes nothing with every action turned off', () => {
    const plan = planStartWork(
      card,
      settingsWith({
        assignMe: false,
        removeLabels: false,
        addLabels: false,
        listName: 'In progress',
      }),
      ME,
      BOARD_LABELS,
      LISTS,
    );
    expect(planIsEmpty(plan)).toBe(true);
    expect(plan.missingListName).toBeNull();
  });
});

function fakeClient() {
  return {
    getBoardLabels: jest.fn(async () =>
      BOARD_LABELS.map(l => ({...l, color: null})),
    ),
    getBoardLists: jest.fn(async () =>
      LISTS.map((l, pos) => ({...l, closed: false, pos, idBoard: 'board-1'})),
    ),
    addCardMember: jest.fn(async () => undefined),
    addCardLabel: jest.fn(async () => undefined),
    removeCardLabel: jest.fn(async () => undefined),
    createCardLabel: jest.fn(async (_card: string, name: string) => ({
      id: 'new',
      name,
      color: null,
    })),
    moveCard: jest.fn(async () => undefined),
  };
}

describe('applyStartWork', () => {
  it('runs each planned change and reports it', async () => {
    const client = fakeClient();
    const result = await applyStartWork(
      client,
      card,
      settingsWith({
        addLabelNames: ['WIP', 'Doing'],
        moveToList: true,
        listName: 'In progress',
      }),
      ME,
    );
    expect(client.addCardMember).toHaveBeenCalledWith('card-1', ME);
    expect(client.removeCardLabel).toHaveBeenCalledWith('card-1', 'l-todo');
    expect(client.addCardLabel).toHaveBeenCalledWith('card-1', 'l-wip');
    expect(client.createCardLabel).toHaveBeenCalledWith('card-1', 'Doing');
    expect(client.moveCard).toHaveBeenCalledWith('card-1', 'list-doing');
    expect(result).toEqual({
      failed: false,
      steps: [
        {kind: 'assign', ok: true},
        {kind: 'removeLabel', name: 'todo', ok: true},
        {kind: 'addLabel', name: 'WIP', ok: true},
        {kind: 'createLabel', name: 'Doing', ok: true},
        {kind: 'move', name: 'In progress', ok: true},
      ],
    });
  });

  it('reads neither labels nor lists when they are not needed', async () => {
    const client = fakeClient();
    const result = await applyStartWork(
      client,
      {...card, idMembers: [ME]},
      settingsWith({removeLabels: false, addLabels: false}),
      ME,
    );
    expect(client.getBoardLabels).not.toHaveBeenCalled();
    expect(client.getBoardLists).not.toHaveBeenCalled();
    expect(result).toEqual({
      failed: false,
      steps: [{kind: 'nothingToChange'}],
    });
  });

  it('goes on after a failed change and reports a missing list', async () => {
    const client = fakeClient();
    client.addCardMember.mockRejectedValueOnce(new Error('boom'));
    const result = await applyStartWork(
      client,
      card,
      settingsWith({moveToList: true, listName: 'Done'}),
      ME,
    );
    expect(result.failed).toBe(true);
    expect(result.steps).toEqual([
      {kind: 'assign', ok: false},
      {kind: 'removeLabel', name: 'todo', ok: true},
      {kind: 'addLabel', name: 'WIP', ok: true},
      {kind: 'missingList', name: 'Done'},
    ]);
  });

  it('changes nothing when the board cannot be read', async () => {
    const client = fakeClient();
    client.getBoardLabels.mockRejectedValueOnce(
      new TrelloApiError('network', 'offline'),
    );
    const result = await applyStartWork(client, card, settingsWith(), ME);
    expect(result).toEqual({failed: true, steps: [{kind: 'boardUnreadable'}]});
    expect(client.addCardMember).not.toHaveBeenCalled();
  });

  it('lets a rejected token through, to connect again', async () => {
    const client = fakeClient();
    client.getBoardLabels.mockRejectedValueOnce(
      new TrelloApiError('unauthorized', 'expired', 401),
    );
    await expect(
      applyStartWork(client, card, settingsWith(), ME),
    ).rejects.toBeInstanceOf(TrelloApiError);
  });
});

describe('card note files', () => {
  it('lives in Note/s-INK at the storage root', () => {
    expect(cardNotesDir('/storage/emulated/0/EXPORT')).toBe(
      '/storage/emulated/0/Note/s-INK',
    );
    expect(cardNotesDir('/storage/emulated/0/EXPORT/')).toBe(
      '/storage/emulated/0/Note/s-INK',
    );
    expect(cardNotesDir(null)).toBe('/storage/emulated/0/Note/s-INK');
  });

  it('is named after the card, then its short link', () => {
    expect(cardNoteFileName('Fix the login', 'AbC123xy')).toBe(
      'Fix the login [AbC123xy].note',
    );
    expect(cardNoteFileName(' ..a/b: "c" [d]?\n', 'X1')).toBe(
      'a b c d [X1].note',
    );
    expect(cardNoteFileName('***', 'X1')).toBe('Trello [X1].note');
    expect(cardNoteFileName('x'.repeat(200), 'X1')).toBe(
      `${'x'.repeat(60)} [X1].note`,
    );
  });

  it('is found by its short link, even after a rename', () => {
    expect(isCardNoteFile('Old name [AbC123xy].note', 'AbC123xy')).toBe(true);
    expect(isCardNoteFile('Old name [AbC123xy].note', 'AbC123')).toBe(false);
    expect(isCardNoteFile('Old name [AbC123xy].pdf', 'AbC123xy')).toBe(false);
  });
});
