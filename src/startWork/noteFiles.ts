/**
 * Names and places of the notes created for cards. A card's note lives in
 * `Note/s-INK for Trello/{board name}/{card name} [{short link}].note` on
 * the tablet. The card's short link in the name is what ties the note to
 * the card: a renamed card or board keeps its note. Notes of 0.47.0–0.71.0
 * (`{card name}.note`) are still found by the path remembered when they
 * were made, or by the s-INK link of their title.
 */

/** Folder of the card notes, under the tablet's storage root. */
export const CARD_NOTES_FOLDER = 'Note/s-INK for Trello';

/**
 * Folder of the card notes made by 0.45.x–0.46.x, named, as now,
 * `{card name} [{short link}].note`: still found, never written.
 */
export const LEGACY_CARD_NOTES_FOLDER = 'Note/s-INK';

/** Storage root used when the host does not give its export folder. */
export const DEFAULT_STORAGE_ROOT = '/storage/emulated/0';

/** Longest folder or file name taken from a board or card name. */
export const NOTE_NAME_MAX_LENGTH = 80;

/**
 * Notes of 0.47.0–0.71.0 of cards of the same name on a board:
 * `Name (2).note` and on.
 */
export const MAX_SAME_NAME_NOTES = 20;

export const NOTE_EXTENSION = '.note';

/** Storage root of the tablet, from the host's export folder. */
function storageRoot(exportPath: string | null | undefined): string {
  const root = exportPath
    ? exportPath.replace(/\/+$/, '').replace(/\/EXPORT$/i, '')
    : '';
  return root || DEFAULT_STORAGE_ROOT;
}

/**
 * Folder of all card notes, from the host's export folder
 * (`/storage/emulated/0/EXPORT`), which lies at the storage root.
 */
export function cardNotesRoot(exportPath: string | null | undefined): string {
  return `${storageRoot(exportPath)}/${CARD_NOTES_FOLDER}`;
}

/** Folder of the card notes of 0.45.x–0.46.x. */
export function legacyCardNotesDir(
  exportPath: string | null | undefined,
): string {
  return `${storageRoot(exportPath)}/${LEGACY_CARD_NOTES_FOLDER}`;
}

/**
 * A board or card name made safe as a folder or file name: without the
 * characters file systems reject, nor a leading dot that would hide it.
 */
export function safeFileName(name: string, fallback: string): string {
  const clean = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, NOTE_NAME_MAX_LENGTH)
    // Windows and some sync tools drop trailing dots and spaces.
    .replace(/[.\s]+$/, '');
  return clean || fallback;
}

/** Folder of the notes of a board's cards. */
export function boardNotesDir(
  exportPath: string | null | undefined,
  boardName: string,
): string {
  return `${cardNotesRoot(exportPath)}/${safeFileName(boardName, 'Trello')}`;
}

/**
 * File name of a card's note: the card's name, then its short link in
 * brackets, `Fix the login [AbC123xy].note`. The short link never changes:
 * it finds the note of a renamed card, and keeps two cards of the same
 * name apart.
 */
export function cardNoteFileName(cardName: string, shortLink: string): string {
  const name = safeFileName(cardName, 'Trello');
  return `${name} [${shortLink}]${NOTE_EXTENSION}`;
}

/**
 * File name of a card's note made by 0.47.0–0.71.0: the card name alone,
 * `Name (2).note` for a second card of the same name, and so on.
 */
export function namedCardNoteFileName(cardName: string, rank = 1): string {
  const name = safeFileName(cardName, 'Trello');
  return `${name}${rank > 1 ? ` (${rank})` : ''}${NOTE_EXTENSION}`;
}

/** A Trello short link in brackets, ending a note's name. */
const SHORT_LINK_NAME = / \[([A-Za-z0-9]{8})\]\.note$/;

/**
 * Short link of the card a note's name carries (`Name [AbC123xy].note`),
 * or `null` for a note named after its card alone.
 */
export function noteNameShortLink(path: string): string | null {
  return SHORT_LINK_NAME.exec(fileNameOf(path))?.[1] ?? null;
}

/**
 * The card's name a note of 0.47.0–0.71.0 was given, without its rank:
 * `Fix the login (2).note` → `Fix the login`.
 */
export function namedNoteCardName(path: string): string {
  return fileNameOf(path)
    .replace(/\.note$/i, '')
    .replace(/ \(\d+\)$/, '');
}

/** `true` for a note file. */
export function isNoteFile(path: string): boolean {
  return path.toLowerCase().endsWith(NOTE_EXTENSION);
}

/**
 * `true` if a file is the note of the card: its name ends with the card's
 * short link in brackets, whatever the card's name was when it was made.
 */
export function isCardNoteFile(path: string, shortLink: string): boolean {
  return shortLink !== '' && path.endsWith(` [${shortLink}]${NOTE_EXTENSION}`);
}

/** Folder holding the tablet's own templates: PNG files put by the user. */
export const TEMPLATES_FOLDER = 'MyStyle';

/** Folder of the user's own templates (`/storage/emulated/0/MyStyle`). */
export function customTemplatesDir(
  exportPath: string | null | undefined,
): string {
  return `${storageRoot(exportPath)}/${TEMPLATES_FOLDER}`;
}

/** `true` for a file usable as a page template: a PNG image. */
export function isTemplateFile(path: string): boolean {
  return /\.png$/i.test(path);
}

/** Name of a template file shown to the user: without its extension. */
export function templateFileLabel(path: string): string {
  return fileNameOf(path).replace(/\.png$/i, '');
}

/**
 * Name of one of the tablet's templates shown to the user, from its
 * identifier: `style_8mm_ruled_line` → `8mm ruled line`.
 */
export function systemTemplateLabel(name: string): string {
  const words = name
    .replace(/^style_/, '')
    .replace(/_/g, ' ')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** A template identifier reduced to its words: `style_Task-List` → `tasklist`. */
function templateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^style_?/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The identifier of one of the tablet's templates as the tablet spells it:
 * the same one if listed, else the one with the same words (`style_tasklist`
 * for `style_task_list`), else `null`.
 */
export function matchSystemTemplate(
  name: string,
  listed: readonly string[],
): string | null {
  if (listed.includes(name)) {
    return name;
  }
  const key = templateKey(name);
  return listed.find(candidate => templateKey(candidate) === key) ?? null;
}

/** Last part of a path. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Storage key remembering where a card's note is. */
export function cardNoteKey(shortLink: string): string {
  return `supertrello.cardNotes.${shortLink}`;
}
