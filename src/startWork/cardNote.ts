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
  insertInkLinkInNoteFile,
  selectInkLink,
} from '../inkLink/noteBridge';
import {
  ensureFileReadPermission,
  ensurePermission,
  hasPermission,
  Permission,
} from '../plugin/permissions';
import {listedPath} from '../storage/directoryStore';
import {
  cardNoteFileName,
  cardNotesDir,
  customTemplatesDir,
  fileNameOf,
  isCardNoteFile,
  isTemplateFile,
} from './noteFiles';
import {NoteTemplateChoice} from './settings';

/** A card a note is made for. */
export interface NoteCard {
  name: string;
  shortLink: string;
}

/** Blank page template of the note app. */
const BLANK_TEMPLATE = 'style_white';

/** How long to wait for an opened note to become the current one. */
const OPEN_TIMEOUT_MS = 5000;
const OPEN_POLL_MS = 250;

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

async function notesDir(): Promise<string> {
  return cardNotesDir(await exportPath());
}

/**
 * Path of the note made for a card, or `null` if it has none (or the notes
 * cannot be read).
 *
 * @param prompt - Asks for note access if needed; otherwise a missing
 * permission answers `null`.
 */
export async function findCardNote(
  shortLink: string,
  prompt: boolean,
): Promise<string | null> {
  try {
    const allowed = prompt
      ? await ensureFileReadPermission(i18n.t('startWork.notePermission'))
      : await hasPermission(Permission.FileRead);
    if (!allowed) {
      return null;
    }
    const dir = await notesDir();
    // Before the first note, the folder does not exist: no note, no error.
    if ((await fileExists(dir)) === 'false') {
      return null;
    }
    const entries = (await FileUtils.listFiles(dir)) ?? [];
    for (const entry of entries) {
      const path = listedPath(entry);
      if (path && isCardNoteFile(fileNameOf(path), shortLink)) {
        return path.includes('/') ? path : `${dir}/${path}`;
      }
    }
  } catch (error) {
    logInkLink(`note: listing failed (${String(error)})`);
  }
  return null;
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
    // The host may take the template's name as it is.
    const direct = await createNoteFile(path, portrait, [choice.name]);
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
        ? await applySystemTemplate(path, choice.name)
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
 * Creates the note of a card in `Note/s-INK`, with the card's s-INK link
 * at the top of its first page as a title. A note the card already has is
 * kept as it is. Every step is written to the Diagnostics log (`note:`
 * lines); on failure, the failing step is returned to be shown.
 */
export async function createCardNote(
  card: NoteCard,
  template: NoteTemplateChoice,
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
    const existing = await findCardNote(card.shortLink, true);
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
    const dir = await notesDir();
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

    const path = `${dir}/${cardNoteFileName(card.name, card.shortLink)}`;
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

async function waitForCurrentFile(path: string): Promise<boolean> {
  const deadline = Date.now() + OPEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = (await PluginCommAPI.getCurrentFilePath()) as {
        result?: unknown;
      } | null;
      if (response?.result === path) {
        return true;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise<void>(resolve => setTimeout(resolve, OPEN_POLL_MS));
  }
  return false;
}

/** What to do once a new note is open. */
export interface NewNoteTitle {
  /** The title placed in the file, selected with the lasso. */
  rect: Rect | null;
  /** Placed once the note is open, when the file refused it. */
  missing?: {target: InkLinkTarget; name: string};
}

/**
 * Opens a card's note in the note app and closes the plugin view to show
 * it. For a new note, its title is then selected with the lasso, ready to
 * be moved; a title the closed file refused is placed first.
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
    // The host drops the lasso while the plugin view shows: close it first.
    await PluginManager.closePluginView();
    if (title) {
      const current = await waitForCurrentFile(path);
      if (!current) {
        logInkLink('note: opened note not current, title not selected');
      } else {
        // A title the file refused is placed now, in the middle of the page.
        const rect = title.missing
          ? await insertInkLink(title.missing.target, title.missing.name)
          : title.rect;
        if (title.missing) {
          logInkLink(
            `note: title placed after opening: ${rect ? 'ok' : 'failed'}`,
          );
        }
        if (rect) {
          await selectInkLink(rect);
        }
      }
    }
    return true;
  } catch (error) {
    logInkLink(`note: open ${path}: ${String(error)}`);
    return false;
  }
}
