/**
 * Names and places of the notes created for cards. A card's note lives in
 * `Note/s-INK for Trello/{board name}/{card name}.note` on the tablet. The
 * note is found again by the path remembered when it was made, by that
 * path, or by the s-INK link of its title, so that a renamed card or board
 * keeps its note.
 */

/** Folder of the card notes, under the tablet's storage root. */
export const CARD_NOTES_FOLDER = 'Note/s-INK for Trello';

/**
 * Folder of the card notes made by 0.45.x–0.46.x, named
 * `{card name} [{short link}].note`: still found, never written.
 */
export const LEGACY_CARD_NOTES_FOLDER = 'Note/s-INK';

/** Storage root used when the host does not give its export folder. */
export const DEFAULT_STORAGE_ROOT = '/storage/emulated/0';

/** Longest folder or file name taken from a board or card name. */
export const NOTE_NAME_MAX_LENGTH = 80;

/** Notes of cards of the same name on a board: `Name (2).note` and on. */
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
 * File name of a card's note: the card name. A second card of the same
 * name on the board gets `Name (2).note`, and so on.
 */
export function cardNoteFileName(cardName: string, rank = 1): string {
  const name = safeFileName(cardName, 'Trello');
  return `${name}${rank > 1 ? ` (${rank})` : ''}${NOTE_EXTENSION}`;
}

/** `true` for a note file. */
export function isNoteFile(path: string): boolean {
  return path.toLowerCase().endsWith(NOTE_EXTENSION);
}

/** `true` if a file of the legacy folder is the note of the card. */
export function isLegacyCardNoteFile(path: string, shortLink: string): boolean {
  return path.endsWith(` [${shortLink}]${NOTE_EXTENSION}`);
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

/** Last part of a path. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Storage key remembering where a card's note is. */
export function cardNoteKey(shortLink: string): string {
  return `supertrello.cardNotes.${shortLink}`;
}
