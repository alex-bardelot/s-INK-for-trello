import {Dimensions} from 'react-native';
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

function describe(response: unknown): string {
  const value = response as {error?: {code?: number; message?: string}} | null;
  return value?.error
    ? `error ${value.error.code ?? '?'}: ${value.error.message ?? ''}`
    : String(JSON.stringify(response) ?? response).slice(0, 120);
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
async function blankTemplate(portrait: boolean): Promise<string> {
  try {
    const response: unknown = await PluginCommAPI.getNoteSystemTemplates();
    const list = Array.isArray(response)
      ? response
      : (response as {result?: unknown} | null)?.result;
    if (Array.isArray(list)) {
      const blank = list.find(
        (template: {name?: string}) => template?.name === BLANK_TEMPLATE,
      ) as {vUri?: string; hUri?: string} | undefined;
      const uri = portrait ? blank?.vUri : blank?.hUri;
      if (uri) {
        return uri;
      }
    }
  } catch (error) {
    logInkLink(`note: no templates (${String(error)})`);
  }
  return BLANK_TEMPLATE;
}

export type CreatedNote =
  | {ok: true; path: string; created: boolean; titled: boolean}
  | {ok: false};

/**
 * Creates the note of a card in `Note/s-INK`, with the card's s-INK link
 * at the top of its first page as a title. A note the card already has is
 * kept as it is.
 */
export async function createCardNote(card: NoteCard): Promise<CreatedNote> {
  const existing = await findCardNote(card.shortLink, true);
  if (existing) {
    return {ok: true, path: existing, created: false, titled: true};
  }
  try {
    if (
      !(await ensurePermission(
        Permission.FileWrite,
        i18n.t('startWork.notePermission'),
      ))
    ) {
      logInkLink('note: write permission refused');
      return {ok: false};
    }
    const dir = await notesDir();
    await FileUtils.makeDir(dir);
    const path = `${dir}/${cardNoteFileName(card.name, card.shortLink)}`;
    const {width, height} = Dimensions.get('window');
    const portrait = height >= width;
    const created = await PluginFileAPI.createNote({
      notePath: path,
      template: await blankTemplate(portrait),
      mode: 0,
      isPortrait: portrait,
    });
    if (!succeeded(created)) {
      logInkLink(`note: createNote ${path}: ${describe(created)}`);
      return {ok: false};
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
    logInkLink(`note: ${String(error)}`);
    return {ok: false};
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
