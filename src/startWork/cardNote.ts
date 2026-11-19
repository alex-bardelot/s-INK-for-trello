import {Dimensions, Image} from 'react-native';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {logInkLink} from '../inkLink/diagnostics';
import {InkLinkTarget} from '../inkLink/inkLink';
import {Rect} from '../inkLink/hitTest';
import {
  insertInkLink,
  closeViewAndSelect,
  insertInkLinkInNoteFile,
} from '../inkLink/noteBridge';
import {
  ensureFileReadPermission,
  ensurePermission,
  hasPermission,
  Permission,
} from '../plugin/permissions';
import {listedPath} from '../storage/directoryStore';
import {formatInkLink, parseInkLink} from '../inkLink/inkLink';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  boardNotesDir,
  cardNoteFileName,
  cardNoteKey,
  cardNotesRoot,
  customTemplatesDir,
  fileNameOf,
  isCardNoteFile,
  isNoteFile,
  isTemplateFile,
  legacyCardNotesDir,
  matchSystemTemplate,
  MAX_SAME_NAME_NOTES,
  namedCardNoteFileName,
  namedNoteCardName,
  noteNameShortLink,
} from './noteFiles';
import {NoteTemplateChoice} from './settings';

/** A card a note is made for. */
export interface NoteCard {
  name: string;
  shortLink: string;
  /** Name of the card's board, which names the folder of its note. */
  boardName: string;
}

/** Blank page template of the note app. */
const BLANK_TEMPLATE = 'style_white';

/** How long to wait for an opened note to become the current one. */
const OPEN_TIMEOUT_MS = 5000;
/** Upper bound of checks, should the host answer at once. */
const OPEN_MAX_ATTEMPTS = 2000;

function succeeded(response: unknown): boolean {
  const value = response as {success?: boolean; result?: unknown} | null;
  return value?.success === true && value.result !== false;
}

/** What the host answered, short enough for the log and the report. */
function describe(response: unknown): string {
  const value = response as {error?: {code?: number; message?: string}} | null;
  if (value?.error) {
    return `error ${value.error.code ?? '?'}: ${value.error.message ?? ''}`;
  }
  try {
    return String(JSON.stringify(response) ?? response).slice(0, 160);
  } catch {
    return String(response);
  }
}

/** The host's export folder, which lies at the storage root. */
async function exportPath(): Promise<string | null> {
  try {
    return await FileUtils.getExportPath();
  } catch (error) {
    logInkLink(`note: no export path (${String(error)})`);
    return null;
  }
}

/** Full paths of the entries of a folder; none if it does not exist. */
async function listEntries(dir: string): Promise<string[]> {
  // Before the first note, the folder does not exist: no entry, no error.
  if ((await fileExists(dir)) === 'false') {
    return [];
  }
  return ((await FileUtils.listFiles(dir)) ?? [])
    .map(listedPath)
    .filter((path): path is string => !!path)
    .map(path => (path.includes('/') ? path : `${dir}/${path}`));
}

/**
 * Short link of the card whose s-INK link titles the first page of a note,
 * or `null`: this is how a note is known to belong to a card.
 */
async function noteOwner(path: string): Promise<string | null> {
  try {
    const elements = unwrapResult<
      {
        userData?: string | null;
        textBox?: {textContentFull?: string | null} | null;
        recycle?: () => Promise<void>;
      }[]
    >(await PluginFileAPI.getElements(0, path));
    if (!Array.isArray(elements)) {
      return null;
    }
    let owner: string | null = null;
    for (const element of elements) {
      const target =
        parseInkLink(element.userData) ??
        parseInkLink(element.textBox?.textContentFull);
      if (!owner && target?.kind === 'card') {
        owner = target.shortLink;
      }
      element.recycle?.().catch(() => undefined);
    }
    return owner;
  } catch (error) {
    logInkLink(`note: reading ${path} failed (${String(error)})`);
    return null;
  }
}

async function remember(
  store: KeyValueStore,
  shortLink: string,
  path: string,
): Promise<void> {
  try {
    await store.setItem(cardNoteKey(shortLink), path);
  } catch (error) {
    logInkLink(`note: path not remembered (${String(error)})`);
  }
}

/**
 * Path of the note made for a card, or `null` if it has none (or the notes
 * cannot be read). The card's short link in a note's name comes first: it
 * is looked for in the board's folder, then (after the path remembered
 * when the note was made) in the other boards' folders, for a renamed
 * board, and among the notes of 0.45.x–0.46.x. Notes of 0.47.0–0.71.0,
 * named after the card alone, are found at `{board}/{card}.note` (and its
 * `(2)`… namesakes) when their title links to the card.
 *
 * @param prompt - Asks for note access if needed; otherwise a missing
 * permission answers `null`.
 * @param scan - Also reads the title of every card note, to find a note of
 * 0.47.0–0.71.0 whose card or board was renamed since: only before making
 * a note.
 */
export async function findCardNote(
  card: NoteCard,
  store: KeyValueStore,
  {prompt, scan}: {prompt: boolean; scan: boolean},
): Promise<string | null> {
  try {
    const allowed = prompt
      ? await ensureFileReadPermission(i18n.t('startWork.notePermission'))
      : await hasPermission(Permission.FileRead);
    if (!allowed) {
      return null;
    }
    const exported = await exportPath();
    const boardDir = boardNotesDir(exported, card.boardName);
    const ofCard = (path: string) =>
      isCardNoteFile(fileNameOf(path), card.shortLink);

    // By the card's short link in its name, in the board's folder.
    const inBoard = (await listEntries(boardDir)).find(ofCard);
    if (inBoard) {
      return inBoard;
    }

    const remembered = await store.getItem(cardNoteKey(card.shortLink));
    if (remembered && (await fileExists(remembered)) !== 'false') {
      return remembered;
    }

    // By the short link, under a former name of the board, then among
    // the notes of 0.45.x–0.46.x: folders are listed, notes not opened.
    const boardFolders = (await listEntries(cardNotesRoot(exported))).filter(
      folder => !isNoteFile(folder) && !fileNameOf(folder).startsWith('.'),
    );
    for (const folder of [...boardFolders, legacyCardNotesDir(exported)]) {
      const found = (await listEntries(folder)).find(ofCard);
      if (found) {
        logInkLink(`note: found by its short link ${found}`);
        await remember(store, card.shortLink, found);
        return found;
      }
    }

    // A note of 0.47.0–0.71.0, named after the card alone.
    for (let rank = 1; rank <= MAX_SAME_NAME_NOTES; rank++) {
      const path = `${boardDir}/${namedCardNoteFileName(card.name, rank)}`;
      if ((await fileExists(path)) === 'false') {
        break;
      }
      if ((await noteOwner(path)) === card.shortLink) {
        await remember(store, card.shortLink, path);
        return path;
      }
    }

    if (scan) {
      for (const folder of boardFolders) {
        for (const path of await listEntries(folder)) {
          if (isNoteFile(path) && (await noteOwner(path)) === card.shortLink) {
            logInkLink(`note: found by its title ${path}`);
            await remember(store, card.shortLink, path);
            return path;
          }
        }
      }
    }
  } catch (error) {
    logInkLink(`note: looking for the note failed (${String(error)})`);
  }
  return null;
}

/**
 * Short links of the cards of a board that have a note, to mark them on
 * the board. Cheap enough for every card: the board's note folder (and the
 * legacy one) is listed once, and a card counts when a note there carries
 * its short link, when the note remembered for it still exists, or when a
 * note of 0.47.0–0.71.0 there bears its name. Notes are not opened. Never
 * prompts: without note access, no card is marked.
 */
export async function findBoardCardNotes(
  cards: readonly {shortLink?: string; name: string}[],
  boardName: string,
  store: KeyValueStore,
): Promise<Set<string>> {
  const found = new Set<string>();
  try {
    if (!(await hasPermission(Permission.FileRead))) {
      return found;
    }
    const exported = await exportPath();
    const boardDir = boardNotesDir(exported, boardName);
    const boardNotes = new Set((await listEntries(boardDir)).map(fileNameOf));
    const legacyNotes = (await listEntries(legacyCardNotesDir(exported))).map(
      fileNameOf,
    );
    const linked = [...boardNotes, ...legacyNotes];
    const remembered = await Promise.all(
      cards.map(card =>
        card.shortLink
          ? store.getItem(cardNoteKey(card.shortLink)).catch(() => null)
          : Promise.resolve(null),
      ),
    );
    for (const [i, card] of cards.entries()) {
      const shortLink = card.shortLink;
      if (!shortLink) {
        continue;
      }
      const path = remembered[i];
      const has =
        linked.some(name => isCardNoteFile(name, shortLink)) ||
        boardNotes.has(namedCardNoteFileName(card.name)) ||
        (!!path &&
          (path.startsWith(`${boardDir}/`)
            ? boardNotes.has(fileNameOf(path))
            : // Made under the board's former name: checked on its own.
              (await fileExists(path)) === 'true'));
      if (has) {
        found.add(shortLink);
      }
    }
  } catch (error) {
    logInkLink(`note: listing the board's notes failed (${String(error)})`);
  }
  return found;
}

/**
 * Card notes named after their card alone (`{board}/{card}.note`, made by
 * 0.47.0–0.71.0), to be given the card's short link. `null` when the notes
 * cannot be read without asking. Folders are listed, notes not opened.
 */
export async function listNotesWithoutShortLink(): Promise<string[] | null> {
  if (!(await hasPermission(Permission.FileRead))) {
    return null;
  }
  const notes: string[] = [];
  for (const folder of await listEntries(cardNotesRoot(await exportPath()))) {
    if (isNoteFile(folder) || fileNameOf(folder).startsWith('.')) {
      continue;
    }
    for (const path of await listEntries(folder)) {
      if (isNoteFile(path) && noteNameShortLink(path) === null) {
        notes.push(path);
      }
    }
  }
  return notes;
}

/** What renaming the card notes did. */
export interface NoteRenameReport {
  renamed: number;
  /** Without an s-INK link in their title: their card is not known. */
  untitled: number;
  /** Open in the notes app, a namesake already there, or refused. */
  failed: number;
}

/**
 * Gives the notes of 0.47.0–0.71.0 their card's short link:
 * `{board}/{card} (2).note` becomes `{board}/{card} [{short link}].note`.
 * The card is the one the s-INK link of the note's title points to; a note
 * without one is left as it is, and so is the note open in the notes app.
 * The path remembered for the card follows the note. Each note goes to the
 * Diagnostics log (`note:` lines).
 */
export async function addShortLinksToNoteNames(
  store: KeyValueStore,
): Promise<NoteRenameReport> {
  const report: NoteRenameReport = {renamed: 0, untitled: 0, failed: 0};
  const notes = (await listNotesWithoutShortLink()) ?? [];
  if (notes.length === 0) {
    return report;
  }
  if (
    !(await ensurePermission(
      Permission.FileWrite,
      i18n.t('startWork.notePermission'),
    ))
  ) {
    logInkLink('note: rename refused, no write permission');
    report.failed = notes.length;
    return report;
  }
  let openNote: unknown = null;
  try {
    const response = (await PluginCommAPI.getCurrentFilePath()) as {
      result?: unknown;
    } | null;
    openNote = response?.result ?? null;
  } catch {
    // No note open: nothing to keep away from.
  }
  for (const path of notes) {
    // Paths may start differently (`/sdcard`, `/storage/emulated/0`): the
    // board's folder and the note's name are compared.
    const tail = (value: string) => value.split('/').slice(-2).join('/');
    if (typeof openNote === 'string' && tail(openNote) === tail(path)) {
      logInkLink(`note: rename skipped, open in the notes app ${path}`);
      report.failed++;
      continue;
    }
    const owner = await noteOwner(path);
    if (!owner) {
      logInkLink(`note: rename skipped, no s-INK title ${path}`);
      report.untitled++;
      continue;
    }
    const folder = path.slice(0, path.lastIndexOf('/'));
    const target = `${folder}/${cardNoteFileName(
      namedNoteCardName(path),
      owner,
    )}`;
    if ((await fileExists(target)) !== 'false') {
      logInkLink(`note: rename skipped, ${target} already there`);
      report.failed++;
      continue;
    }
    let renamed = false;
    try {
      renamed =
        (await FileUtils.renameToFile(path, target)) &&
        (await fileExists(target)) === 'true';
    } catch (error) {
      logInkLink(`note: rename threw (${String(error)})`);
    }
    if (renamed) {
      logInkLink(`note: renamed ${path} to ${target}`);
      await remember(store, owner, target);
      report.renamed++;
    } else {
      logInkLink(`note: rename failed ${path}`);
      report.failed++;
    }
  }
  return report;
}

/**
 * Blank page templates packaged with the plugin, at the Manta's screen
 * size: `createNote` needs a template file on the tablet (error 802
 * "Background template file does not exist!" with the host's
 * `android.resource://` URIs). Metro copies them next to the bundle, in
 * `drawable-mdpi/` under names made from their path.
 */
export const PACKAGED_TEMPLATES = {
  portrait: {
    asset: require('../../assets/blank-page-portrait.png'),
    file: 'drawable-mdpi/assets_blankpageportrait.png',
  },
  landscape: {
    asset: require('../../assets/blank-page-landscape.png'),
    file: 'drawable-mdpi/assets_blankpagelandscape.png',
  },
};

/** Paths of the packaged blank template that exist on the tablet. */
async function packagedTemplates(portrait: boolean): Promise<string[]> {
  const template = PACKAGED_TEMPLATES[portrait ? 'portrait' : 'landscape'];
  const candidates: string[] = [];
  const dir = await PluginManager.getPluginDirPath();
  if (dir) {
    candidates.push(`${dir.replace(/\/+$/, '')}/${template.file}`);
  }
  const uri = Image.resolveAssetSource(template.asset)?.uri ?? '';
  if (uri.startsWith('file://')) {
    candidates.push(uri.slice('file://'.length));
  } else if (uri.startsWith('/')) {
    candidates.push(uri);
  }
  const found: string[] = [];
  for (const path of new Set(candidates)) {
    const exists = await fileExists(path);
    logInkLink(`note: packaged template ${path} exists ${exists}`);
    if (exists === 'true') {
      found.push(path);
    }
  }
  if (!candidates.length) {
    logInkLink(`note: packaged template not located (uri ${uri})`);
  }
  return found;
}

/**
 * Templates tried for a blank page, best first: the blank page packaged
 * with the plugin, then the template URI the host lists for the
 * orientation, then the bare template name (the SDK calls the parameter a
 * "template path" without saying which form it takes).
 */
async function blankTemplates(portrait: boolean): Promise<string[]> {
  const candidates: string[] = await packagedTemplates(portrait);
  const blank = (await listSystemTemplates()).find(
    template => template.name === BLANK_TEMPLATE,
  );
  const uri = portrait ? blank?.vUri : blank?.hUri;
  if (uri) {
    candidates.push(uri);
  }
  candidates.push(BLANK_TEMPLATE);
  return candidates;
}

/** One of the tablet's own templates, as the host lists them. */
export interface SystemTemplate {
  /** Identifier, e.g. `style_8mm_ruled_line`. */
  name: string;
  /** Image of the portrait page (`android.resource://…`). */
  vUri?: string;
  /** Image of the landscape page. */
  hUri?: string;
}

/** The tablet's own templates (ruled, grid, dots…), in the host's order. */
export async function listSystemTemplates(): Promise<SystemTemplate[]> {
  try {
    const response: unknown = await PluginCommAPI.getNoteSystemTemplates();
    const list = Array.isArray(response)
      ? response
      : (response as {result?: unknown} | null)?.result;
    if (!Array.isArray(list)) {
      logInkLink(`note: no templates listed (${describe(response)})`);
      return [];
    }
    return list.filter(
      (template): template is SystemTemplate =>
        typeof template?.name === 'string' && template.name !== '',
    );
  } catch (error) {
    logInkLink(`note: templates failed (${String(error)})`);
    return [];
  }
}

/**
 * The user's own templates: the PNG files of the tablet's `MyStyle`
 * folder, sorted by name. Asks for note access if needed.
 */
export async function listCustomTemplates(): Promise<{
  dir: string;
  paths: string[];
}> {
  const dir = customTemplatesDir(await exportPath());
  try {
    if (
      !(await ensureFileReadPermission(i18n.t('startWork.notePermission'))) ||
      (await fileExists(dir)) === 'false'
    ) {
      return {dir, paths: []};
    }
    const paths = ((await FileUtils.listFiles(dir)) ?? [])
      .map(listedPath)
      .filter((path): path is string => !!path && isTemplateFile(path))
      .map(path => (path.includes('/') ? path : `${dir}/${path}`))
      .sort((a, b) =>
        fileNameOf(a).localeCompare(fileNameOf(b), undefined, {
          sensitivity: 'base',
        }),
      );
    return {dir, paths};
  } catch (error) {
    logInkLink(`note: listing ${dir} failed (${String(error)})`);
    return {dir, paths: []};
  }
}

/** Raw state of a permission (0 refused, 1 this time, 2 always), for the log. */
async function permissionState(
  permission: (typeof Permission)[keyof typeof Permission],
): Promise<string> {
  try {
    return String(await PluginManager.hasPermission(permission));
  } catch (error) {
    return `n/a (${String(error)})`;
  }
}

async function fileExists(path: string): Promise<string> {
  try {
    return String(await FileUtils.exists(path));
  } catch (error) {
    return `n/a (${String(error)})`;
  }
}

/** Tries each template in turn until `createNote` makes the note. */
async function createNoteFile(
  path: string,
  portrait: boolean,
  templates: readonly string[],
): Promise<{created: boolean; answer: string}> {
  let answer = 'no template to try';
  for (const template of templates) {
    const response = await PluginFileAPI.createNote({
      notePath: path,
      template,
      mode: 0,
      isPortrait: portrait,
    });
    const exists = await fileExists(path);
    answer = `${describe(response)}, file exists ${exists}`;
    logInkLink(
      `note: createNote ${path} portrait ${portrait} template ${template}: ${answer}`,
    );
    // A file written despite a failed answer is used all the same.
    if (succeeded(response) || exists === 'true') {
      return {created: true, answer};
    }
  }
  return {created: false, answer};
}

function unwrapResult<T>(response: unknown): T | null {
  const value = response as {success?: boolean; result?: T} | null;
  return value?.success ? value.result ?? null : null;
}

/**
 * Gives a note made from the blank page one of the tablet's templates:
 * inserts a page with that template, then removes the blank one.
 *
 * @returns `null` when done, or what failed.
 */
async function applySystemTemplate(
  path: string,
  name: string,
): Promise<string | null> {
  let inserted: unknown = null;
  for (const page of [0, 1]) {
    inserted = await PluginFileAPI.insertNotePage({
      notePath: path,
      page,
      template: name,
    });
    logInkLink(
      `note: insertNotePage ${name} at ${page}: ${describe(inserted)}`,
    );
    if (succeeded(inserted)) {
      break;
    }
  }
  if (!succeeded(inserted)) {
    return `insertNotePage: ${describe(inserted)}`;
  }
  const total =
    unwrapResult<number>(await PluginFileAPI.getNoteTotalPageNum(path)) ?? 0;
  const pageTemplates: string[] = [];
  for (let page = 0; page < total; page++) {
    const info = unwrapResult<{name?: string}>(
      await PluginFileAPI.getNotePageTemplate(path, page),
    );
    pageTemplates.push(info?.name ?? '?');
  }
  logInkLink(`note: ${total} pages, templates ${pageTemplates.join(', ')}`);
  if (total < 2) {
    return `${total} page(s) after inserting the template page`;
  }
  // The blank page is the one without the chosen template; if the host
  // names templates otherwise, the page inserted first is kept.
  const blankPage = pageTemplates.findIndex(
    template => template !== name && !template.includes(name),
  );
  const removed = await PluginFileAPI.removeNotePage(
    path,
    blankPage >= 0 ? blankPage : 1,
  );
  logInkLink(
    `note: removeNotePage ${blankPage >= 0 ? blankPage : 1}: ${describe(
      removed,
    )}`,
  );
  return succeeded(removed) ? null : `removeNotePage: ${describe(removed)}`;
}

/**
 * Creates the note file from the chosen template. The packaged blank page
 * is the fallback of every choice.
 *
 * @returns Whether the file was made, and what went wrong with the chosen
 * template, if anything.
 */
async function createFromTemplate(
  path: string,
  portrait: boolean,
  choice: NoteTemplateChoice,
): Promise<{created: boolean; answer: string; templateWarning: string | null}> {
  if (choice.kind === 'file') {
    const exists = await fileExists(choice.path);
    const made =
      exists === 'false'
        ? {created: false, answer: `${choice.path} does not exist`}
        : await createNoteFile(path, portrait, [choice.path]);
    if (made.created) {
      return {...made, templateWarning: null};
    }
    const blank = await createNoteFile(
      path,
      portrait,
      await blankTemplates(portrait),
    );
    return {...blank, templateWarning: made.answer};
  }
  if (choice.kind === 'system') {
    // The name as the tablet spells it (the default Task list is named
    // without having been listed).
    const listed = (await listSystemTemplates()).map(template => template.name);
    const name = matchSystemTemplate(choice.name, listed) ?? choice.name;
    if (name !== choice.name) {
      logInkLink(`note: template ${choice.name} found as ${name}`);
    }
    // The host may take the template's name as it is.
    const direct = await createNoteFile(path, portrait, [name]);
    if (direct.created) {
      return {...direct, templateWarning: null};
    }
    const blank = await createNoteFile(
      path,
      portrait,
      await blankTemplates(portrait),
    );
    return {
      ...blank,
      templateWarning: blank.created
        ? await applySystemTemplate(path, name)
        : null,
    };
  }
  return {
    ...(await createNoteFile(path, portrait, await blankTemplates(portrait))),
    templateWarning: null,
  };
}

export type CreatedNote =
  | {
      ok: true;
      path: string;
      created: boolean;
      titled: boolean;
      /** Where the title lies on the first page of a new note. */
      titleRect: Rect | null;
      /** Why the chosen template could not be used (the page is blank). */
      templateWarning: string | null;
    }
  | {
      ok: false;
      /** The step that failed and what the host answered, for the report. */
      reason: string;
    };

/**
 * Creates the note of a card in
 * `Note/s-INK for Trello/{board}/{card} [{short link}].note`,
 * with the card's s-INK link at the top of its first page as a title. A
 * note the card already has is kept as it is. Every step is written to the
 * Diagnostics log (`note:` lines); on failure, the failing step is returned
 * to be shown.
 */
export async function createCardNote(
  card: NoteCard,
  template: NoteTemplateChoice,
  store: KeyValueStore,
): Promise<CreatedNote> {
  const fail = (reason: string): CreatedNote => {
    logInkLink(`note: FAILED ${reason}`);
    return {ok: false, reason};
  };
  try {
    logInkLink(
      `note: start for ${
        card.shortLink
      }, permissions read ${await permissionState(
        Permission.FileRead,
      )} write ${await permissionState(Permission.FileWrite)}`,
    );
    const existing = await findCardNote(card, store, {
      prompt: true,
      scan: true,
    });
    if (existing) {
      logInkLink(`note: already there ${existing}`);
      return {
        ok: true,
        path: existing,
        created: false,
        titled: true,
        titleRect: null,
        templateWarning: null,
      };
    }
    if (
      !(await ensurePermission(
        Permission.FileWrite,
        i18n.t('startWork.notePermission'),
      ))
    ) {
      return fail(
        `write permission refused (state ${await permissionState(
          Permission.FileWrite,
        )})`,
      );
    }
    const dir = boardNotesDir(await exportPath(), card.boardName);
    let dirMade: string;
    try {
      dirMade = String(await FileUtils.makeDir(dir));
    } catch (error) {
      dirMade = `threw ${String(error)}`;
    }
    const dirExists = await fileExists(dir);
    logInkLink(`note: dir ${dir}, makeDir ${dirMade}, exists ${dirExists}`);
    if (dirExists === 'false') {
      return fail(`folder ${dir} could not be created (makeDir ${dirMade})`);
    }

    // The card's short link in the name keeps it apart from its namesakes.
    const path = `${dir}/${cardNoteFileName(card.name, card.shortLink)}`;
    if ((await fileExists(path)) === 'true') {
      // Its folder could not be listed: the note is there all the same.
      logInkLink(`note: already there ${path}`);
      await remember(store, card.shortLink, path);
      return {
        ok: true,
        path,
        created: false,
        titled: true,
        titleRect: null,
        templateWarning: null,
      };
    }
    const {width, height} = Dimensions.get('window');
    const portrait = height >= width;
    logInkLink(`note: template ${JSON.stringify(template)}`);
    const made = await createFromTemplate(path, portrait, template);
    if (!made.created) {
      return fail(`createNote: ${made.answer}`);
    }
    if (made.templateWarning) {
      logInkLink(`note: template not used: ${made.templateWarning}`);
    }

    const titleRect = await insertInkLinkInNoteFile(
      path,
      0,
      {kind: 'card', shortLink: card.shortLink},
      card.name,
    );
    logInkLink(`note: created ${path}, title ${titleRect ? 'ok' : 'missing'}`);
    await remember(store, card.shortLink, path);
    return {
      ok: true,
      path,
      created: true,
      titled: !!titleRect,
      titleRect,
      templateWarning: made.templateWarning,
    };
  } catch (error) {
    return fail(`threw ${String(error)}`);
  }
}

/**
 * Waits for an opened note to become the current one. Once `openFile`
 * hands over to the note app, JavaScript timers stop firing (a wait with
 * `setTimeout` lasted until the next touch on the page): the host is asked
 * again and again instead, each call answering on its own, until the
 * deadline.
 */
async function waitForCurrentFile(path: string): Promise<boolean> {
  const started = Date.now();
  let attempts = 0;
  let current: unknown = null;
  while (attempts < OPEN_MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const response = (await PluginCommAPI.getCurrentFilePath()) as {
        result?: unknown;
      } | null;
      current = response?.result ?? null;
      if (current === path) {
        logInkLink(
          `note: current after ${attempts} check(s), ${
            Date.now() - started
          } ms`,
        );
        return true;
      }
    } catch (error) {
      current = String(error);
    }
    if (Date.now() - started > OPEN_TIMEOUT_MS) {
      break;
    }
  }
  logInkLink(
    `note: not current after ${attempts} check(s), ${
      Date.now() - started
    } ms (current ${String(current)})`,
  );
  return false;
}

/** What to do once a new note is open. */
export interface NewNoteTitle {
  /** What the title links to, and the name it shows. */
  target: InkLinkTarget;
  name: string;
  /**
   * Where the title placed in the file lies, to select it with the lasso;
   * `null` when the file refused it: it is placed once the note is open.
   */
  rect: Rect | null;
}

/**
 * Opens a card's note in the note app and closes the plugin view to show
 * it. For a new note, a title the closed file refused is placed first;
 * when Settings › New card asks for it (experimental), the title is then
 * selected with the lasso, ready to be moved.
 *
 * @returns `false` if the host refused to open the note.
 */
export async function openCardNote(
  path: string,
  title?: NewNoteTitle,
): Promise<boolean> {
  try {
    const opened = await PluginFileAPI.openFile(path, title ? 0 : -1);
    if (!succeeded(opened)) {
      logInkLink(`note: openFile ${path}: ${describe(opened)}`);
      return false;
    }
    let rect: Rect | null = null;
    if (title && (await waitForCurrentFile(path))) {
      // A title the file refused is placed now, in the middle of the page.
      rect = title.rect ?? (await insertInkLink(title.target, title.name));
      if (!title.rect) {
        logInkLink(
          `note: title placed after opening: ${rect ? 'ok' : 'failed'}`,
        );
      }
    } else if (title) {
      logInkLink('note: opened note not current, title not selected');
    }
    // The host drops the lasso while the plugin view shows: the view is
    // closed before the title is selected. The lasso checks it caught the
    // title: the note shown before may still be on screen.
    await closeViewAndSelect(
      title && rect ? {rect, link: formatInkLink(title.target)} : null,
    );
    return true;
  } catch (error) {
    logInkLink(`note: open ${path}: ${String(error)}`);
    return false;
  }
}
