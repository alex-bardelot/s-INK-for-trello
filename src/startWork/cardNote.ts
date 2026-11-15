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
import {insertInkLink, insertInkLinkInNoteFile} from '../inkLink/noteBridge';
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
  fileNameOf,
  isCardNoteFile,
} from './noteFiles';

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

async function notesDir(): Promise<string> {
  let exportPath: string | null = null;
  try {
    exportPath = await FileUtils.getExportPath();
  } catch (error) {
    logInkLink(`note: no export path (${String(error)})`);
  }
  return cardNotesDir(exportPath);
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

/** Template of a blank page in the orientation the tablet is held in. */
/**
 * Blank page templates packaged with the plugin, at the Manta's screen
 * size: `createNote` needs a template file on the tablet (error 802
 * "Background template file does not exist!" with the host's
 * `android.resource://` URIs). Metro copies them next to the bundle, in
 * `drawable-mdpi/` under names made from their path.
 */
const PACKAGED_TEMPLATES = {
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
  try {
    const response: unknown = await PluginCommAPI.getNoteSystemTemplates();
    const list = Array.isArray(response)
      ? response
      : (response as {result?: unknown} | null)?.result;
    logInkLink(
      `note: ${Array.isArray(list) ? list.length : 'no'} templates listed`,
    );
    if (Array.isArray(list)) {
      const blank = list.find(
        (template: {name?: string}) => template?.name === BLANK_TEMPLATE,
      ) as {vUri?: string; hUri?: string} | undefined;
      const uri = portrait ? blank?.vUri : blank?.hUri;
      if (uri) {
        candidates.push(uri);
      }
    }
  } catch (error) {
    logInkLink(`note: templates failed (${String(error)})`);
  }
  candidates.push(BLANK_TEMPLATE);
  return candidates;
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

export type CreatedNote =
  | {ok: true; path: string; created: boolean; titled: boolean}
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
export async function createCardNote(card: NoteCard): Promise<CreatedNote> {
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
      return {ok: true, path: existing, created: false, titled: true};
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
    let made: string;
    try {
      made = String(await FileUtils.makeDir(dir));
    } catch (error) {
      made = `threw ${String(error)}`;
    }
    const dirExists = await fileExists(dir);
    logInkLink(`note: dir ${dir}, makeDir ${made}, exists ${dirExists}`);
    if (dirExists === 'false') {
      return fail(`folder ${dir} could not be created (makeDir ${made})`);
    }

    const path = `${dir}/${cardNoteFileName(card.name, card.shortLink)}`;
    const {width, height} = Dimensions.get('window');
    const portrait = height >= width;
    let lastAnswer = '';
    let created = false;
    for (const template of await blankTemplates(portrait)) {
      const response = await PluginFileAPI.createNote({
        notePath: path,
        template,
        mode: 0,
        isPortrait: portrait,
      });
      const exists = await fileExists(path);
      lastAnswer = `${describe(response)}, file exists ${exists}`;
      logInkLink(
        `note: createNote ${path} portrait ${portrait} template ${template}: ${lastAnswer}`,
      );
      // A file written despite a failed answer is used all the same.
      if (succeeded(response) || exists === 'true') {
        created = true;
        break;
      }
    }
    if (!created) {
      return fail(`createNote: ${lastAnswer}`);
    }

    const titled = await insertInkLinkInNoteFile(
      path,
      0,
      {kind: 'card', shortLink: card.shortLink},
      card.name,
    );
    logInkLink(`note: created ${path}, title ${titled ? 'ok' : 'missing'}`);
    return {ok: true, path, created: true, titled};
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

/**
 * Opens a card's note in the note app and closes the plugin view to show
 * it. When the title could not be written into the closed file, it is
 * placed once the note is open.
 *
 * @returns `false` if the host refused to open the note.
 */
export async function openCardNote(
  path: string,
  missingTitle?: {target: InkLinkTarget; name: string},
): Promise<boolean> {
  try {
    const opened = await PluginFileAPI.openFile(path, missingTitle ? 0 : -1);
    if (!succeeded(opened)) {
      logInkLink(`note: openFile ${path}: ${describe(opened)}`);
      return false;
    }
    if (missingTitle) {
      const current = await waitForCurrentFile(path);
      const titled =
        current &&
        (await insertInkLink(missingTitle.target, missingTitle.name));
      logInkLink(
        `note: title placed after opening: ${
          titled ? 'ok' : current ? 'failed' : 'note not current'
        }`,
      );
    }
    await PluginManager.closePluginView();
    return true;
  } catch (error) {
    logInkLink(`note: open ${path}: ${String(error)}`);
    return false;
  }
}
