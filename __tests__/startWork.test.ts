import {
  cardIsStarted,
  planIsEmpty,
  planStartWork,
  previewStartWork,
  settingsForRun,
} from '../src/startWork/plan';
import {
  boardNotesDir,
  cardNoteFileName,
  cardNotesRoot,
  customTemplatesDir,
  isLegacyCardNoteFile,
  isNoteFile,
  isTemplateFile,
  legacyCardNotesDir,
  matchSystemTemplate,
  safeFileName,
  systemTemplateLabel,
  templateFileLabel,
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
  templateChoiceKey,
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
      removeLabelNames: ['TODO'],
      addLabelNames: ['WIP'],
      moveToList: false,
      listName: '',
      createNote: true,
      noteTemplate: {kind: 'system', name: 'style_task_list'},
    });
  });

  it('keeps the chosen note template and drops broken ones', async () => {
    const store = createMemoryStore();
    for (const noteTemplate of [
      {kind: 'blank'},
      {kind: 'system', name: 'style_8mm_ruled_line'},
      {
        kind: 'file',
        path: '/storage/emulated/0/MyStyle/Lines.png',
        name: 'Lines',
      },
    ] as const) {
      await saveStartWorkSettings(store, settingsWith({noteTemplate}));
      expect((await loadStartWorkSettings(store)).noteTemplate).toEqual(
        noteTemplate,
      );
    }
    for (const broken of [
      {kind: 'system', name: ''},
      {kind: 'file', path: 'relative.png'},
      {kind: 'other'},
      'blank',
    ]) {
      await store.setItem(
        START_WORK_SETTINGS_KEY,
        JSON.stringify({noteTemplate: broken}),
      );
      expect((await loadStartWorkSettings(store)).noteTemplate).toEqual(
        DEFAULT_START_WORK_SETTINGS.noteTemplate,
      );
    }
  });

  it('finds a tablet template under another spelling', () => {
    const listed = ['style_white', 'style_tasklist', 'style_8mm_ruled_line'];
    expect(matchSystemTemplate('style_8mm_ruled_line', listed)).toBe(
      'style_8mm_ruled_line',
    );
    expect(matchSystemTemplate('style_task_list', listed)).toBe(
      'style_tasklist',
    );
    expect(matchSystemTemplate('Task-List', listed)).toBe('style_tasklist');
    expect(matchSystemTemplate('style_dots', listed)).toBeNull();
  });

  it('tells template choices apart', () => {
    expect(templateChoiceKey({kind: 'blank'})).toBe('blank');
    expect(templateChoiceKey({kind: 'system', name: 'style_dots'})).toBe(
      'system:style_dots',
    );
    expect(templateChoiceKey({kind: 'file', path: '/a/b.png', name: 'b'})).toBe(
      'file:/a/b.png',
    );
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

  it('empties the label lists that a former switch turned off', async () => {
    const store = createMemoryStore();
    await store.setItem(
      START_WORK_SETTINGS_KEY,
      JSON.stringify({
        removeLabels: false,
        removeLabelNames: ['TODO'],
        addLabels: true,
        addLabelNames: ['WIP'],
      }),
    );
    const loaded = await loadStartWorkSettings(store);
    expect(loaded.removeLabelNames).toEqual([]);
    expect(loaded.addLabelNames).toEqual(['WIP']);
    expect(loaded).not.toHaveProperty('removeLabels');
  });

  it('knows when Start would do nothing', () => {
    const off = settingsWith({
      assignMe: false,
      removeLabelNames: [],
      addLabelNames: [],
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
      missingLabelNames: [],
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

  it('leaves out labels missing from the board, and skips those on the card', () => {
    const plan = planStartWork(
      card,
      settingsWith({addLabelNames: ['bug', 'Doing', 'doing']}),
      ME,
      BOARD_LABELS,
      LISTS,
    );
    expect(plan.addedLabels).toEqual([]);
    expect(plan.missingLabelNames).toEqual(['Doing']);
    expect(planIsEmpty({...plan, assign: false, removedLabels: []})).toBe(true);
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
        removeLabelNames: [],
        addLabelNames: [],
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
    moveCard: jest.fn(async () => undefined),
  };
}

describe('cardIsStarted', () => {
  const started = {
    idList: 'list-doing',
    idMembers: [ME],
    labels: [
      {id: 'l-wip', name: 'wip'},
      {id: 'l-bug', name: 'Bug'},
    ],
  };
  const settings = settingsWith({moveToList: true, listName: 'In progress'});

  it('is started once every action is done, the note included', () => {
    expect(cardIsStarted(started, 'in progress', settings, ME, true)).toBe(
      true,
    );
  });

  it('is not started while one action is left', () => {
    expect(cardIsStarted(started, 'In progress', settings, ME, false)).toBe(
      false,
    );
    expect(
      cardIsStarted(
        {...started, idMembers: []},
        'In progress',
        settings,
        ME,
        true,
      ),
    ).toBe(false);
    expect(
      cardIsStarted(
        {...started, labels: [...started.labels, {id: 'l-todo', name: 'TODO'}]},
        'In progress',
        settings,
        ME,
        true,
      ),
    ).toBe(false);
    expect(
      cardIsStarted(
        {...started, labels: []},
        'In progress',
        settings,
        ME,
        true,
      ),
    ).toBe(false);
    expect(cardIsStarted(started, 'To do', settings, ME, true)).toBe(false);
  });

  it('ignores the actions turned off', () => {
    const off = settingsWith({
      assignMe: false,
      removeLabelNames: [],
      addLabelNames: [],
      createNote: false,
    });
    expect(cardIsStarted(card, 'To do', off, ME, false)).toBe(true);
  });
});

describe('previewStartWork', () => {
  it('lists the steps Start is about to take, in its order', () => {
    const settings = settingsWith({moveToList: true, listName: ' In progress '});
    expect(previewStartWork(card, 'To do', settings, ME, false)).toEqual([
      {kind: 'assign', on: true},
      {kind: 'removeLabel', name: 'todo', on: true},
      {kind: 'addLabel', name: 'WIP', on: true},
      {kind: 'move', name: 'In progress', on: true},
      {kind: 'createNote', on: true},
    ]);
  });

  it('leaves out what is already done, and opens a note found', () => {
    const done = {
      idList: 'list-doing',
      idMembers: [ME],
      labels: [{id: 'l-wip', name: 'wip'}],
    };
    const settings = settingsWith({moveToList: true, listName: 'In progress'});
    expect(previewStartWork(done, 'in progress', settings, ME, true)).toEqual(
      [{kind: 'openNote', on: true}],
    );
  });

  it('keeps a label both taken off and put on, and skips turned off steps', () => {
    const settings = settingsWith({
      assignMe: false,
      removeLabelNames: ['Bug'],
      addLabelNames: ['bug'],
      createNote: false,
    });
    // The note is always listed, off as the settings say.
    expect(previewStartWork(card, 'To do', settings, ME, false)).toEqual([
      {kind: 'createNote', on: false},
    ]);
  });

  it('lists a label even if the board may lack it', () => {
    const settings = settingsWith({
      assignMe: false,
      removeLabelNames: [],
      addLabelNames: ['Urgent'],
      createNote: false,
    });
    expect(previewStartWork(card, 'To do', settings, ME, false)).toEqual([
      {kind: 'addLabel', name: 'Urgent', on: true},
      {kind: 'createNote', on: false},
    ]);
  });
});

describe('settingsForRun', () => {
  const settings = settingsWith({moveToList: true, listName: 'In progress'});
  const steps = previewStartWork(card, 'To do', settings, ME, false);

  it('keeps the settings when every step stays as listed', () => {
    expect(settingsForRun(settings, steps)).toEqual(settings);
  });

  it('leaves out the steps turned off, for this run alone', () => {
    const off = steps.map(step => ({...step, on: false}));
    expect(settingsForRun(settings, off)).toEqual({
      ...settings,
      assignMe: false,
      removeLabelNames: [],
      addLabelNames: [],
      moveToList: false,
      createNote: false,
    });
    // The saved settings are not touched.
    expect(settings.assignMe).toBe(true);
  });

  it('turns one label off by name, whatever its case', () => {
    const run = settingsForRun(
      settingsWith({removeLabelNames: ['TODO', 'Bug']}),
      [
        {kind: 'removeLabel', name: 'todo', on: false},
        {kind: 'removeLabel', name: 'Bug', on: true},
      ],
    );
    expect(run.removeLabelNames).toEqual(['Bug']);
  });

  it('makes the note this once when its step is turned on', () => {
    const run = settingsForRun(settingsWith({createNote: false}), [
      {kind: 'createNote', on: true},
    ]);
    expect(run.createNote).toBe(true);
  });
});

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
    expect(client.addCardLabel).toHaveBeenCalledTimes(1);
    expect(client.moveCard).toHaveBeenCalledWith('card-1', 'list-doing');
    // Doing is not on the board: reported, not created.
    expect(result).toEqual({
      failed: true,
      steps: [
        {kind: 'assign', ok: true},
        {kind: 'removeLabel', name: 'todo', ok: true},
        {kind: 'addLabel', name: 'WIP', ok: true},
        {kind: 'move', name: 'In progress', ok: true},
        {kind: 'missingLabel', name: 'Doing'},
      ],
    });
  });

  it('reads neither labels nor lists when they are not needed', async () => {
    const client = fakeClient();
    const result = await applyStartWork(
      client,
      {...card, idMembers: [ME]},
      settingsWith({removeLabelNames: [], addLabelNames: []}),
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
  it('lives in Note/s-INK for Trello/{board} at the storage root', () => {
    expect(cardNotesRoot('/storage/emulated/0/EXPORT/')).toBe(
      '/storage/emulated/0/Note/s-INK for Trello',
    );
    expect(boardNotesDir('/storage/emulated/0/EXPORT', 'SuperTrello')).toBe(
      '/storage/emulated/0/Note/s-INK for Trello/SuperTrello',
    );
    expect(boardNotesDir(null, 'R&D: 2027/Q1')).toBe(
      '/storage/emulated/0/Note/s-INK for Trello/R&D 2027 Q1',
    );
  });

  it('is named after the card, with a rank for namesakes', () => {
    expect(cardNoteFileName('Fix the login')).toBe('Fix the login.note');
    expect(cardNoteFileName('Fix the login', 2)).toBe('Fix the login (2).note');
    expect(cardNoteFileName(' ..a/b: "c" [d]?\n')).toBe('a b c [d].note');
    expect(cardNoteFileName('***')).toBe('Trello.note');
    expect(cardNoteFileName('Ends with dots...')).toBe('Ends with dots.note');
    expect(cardNoteFileName('x'.repeat(200))).toBe(`${'x'.repeat(80)}.note`);
  });

  it('makes names safe for folders and files', () => {
    expect(safeFileName('  ', 'Trello')).toBe('Trello');
    expect(safeFileName('.hidden', 'Trello')).toBe('hidden');
    expect(safeFileName('a\tb|c', 'Trello')).toBe('a b c');
  });

  it('still recognises the notes of 0.45 and 0.46', () => {
    expect(legacyCardNotesDir(null)).toBe('/storage/emulated/0/Note/s-INK');
    expect(isLegacyCardNoteFile('Old name [AbC123xy].note', 'AbC123xy')).toBe(
      true,
    );
    expect(isLegacyCardNoteFile('Old name [AbC123xy].note', 'AbC123')).toBe(
      false,
    );
    expect(isNoteFile('/x/Fix.NOTE')).toBe(true);
    expect(isNoteFile('/x/.s-INK-icon.png')).toBe(false);
  });
});

describe('note templates', () => {
  it('takes the user templates from MyStyle at the storage root', () => {
    expect(customTemplatesDir('/storage/emulated/0/EXPORT')).toBe(
      '/storage/emulated/0/MyStyle',
    );
    expect(customTemplatesDir(undefined)).toBe('/storage/emulated/0/MyStyle');
  });

  it('keeps PNG images only, named without their extension', () => {
    expect(isTemplateFile('/x/Templates_Page_1.png')).toBe(true);
    expect(isTemplateFile('/x/Lines.PNG')).toBe(true);
    expect(isTemplateFile('/x/sINKforTrello.snplg')).toBe(false);
    expect(templateFileLabel('/x/Templates_Page_1.png')).toBe(
      'Templates_Page_1',
    );
  });

  it('names the tablet templates readably', () => {
    expect(systemTemplateLabel('style_8mm_ruled_line')).toBe('8mm ruled line');
    expect(systemTemplateLabel('style_5mm_dots')).toBe('5mm dots');
    expect(systemTemplateLabel('custom')).toBe('Custom');
  });
});
