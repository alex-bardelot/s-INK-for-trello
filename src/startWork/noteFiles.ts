/**
 * Names and places of the notes created for cards. A card's note lives in
 * the `Note/s-INK` folder of the tablet, named after the card and ending
 * with its short link in brackets (`Fix the login [AbC123xy].note`): the
 * note is found again by that ending, even after the card is renamed.
 */

/** Folder of the card notes, under the tablet's storage root. */
export const CARD_NOTES_FOLDER = 'Note/s-INK';

/** Storage root used when the host does not give its export folder. */
export const DEFAULT_STORAGE_ROOT = '/storage/emulated/0';

/** Longest part of the file name taken from the card name. */
export const NOTE_NAME_MAX_LENGTH = 60;

const NOTE_EXTENSION = '.note';

/**
 * Folder of the card notes, from the host's export folder
 * (`/storage/emulated/0/EXPORT`), which lies at the storage root.
 */
export function cardNotesDir(exportPath: string | null | undefined): string {
  return `${storageRoot(exportPath)}/${CARD_NOTES_FOLDER}`;
}

/** Folder holding the tablet's own templates: PNG files put by the user. */
export const TEMPLATES_FOLDER = 'MyStyle';

/** Storage root of the tablet, from the host's export folder. */
function storageRoot(exportPath: string | null | undefined): string {
  const root = exportPath
    ? exportPath.replace(/\/+$/, '').replace(/\/EXPORT$/i, '')
    : '';
  return root || DEFAULT_STORAGE_ROOT;
}

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

/** Ending of the file name of a card's note. */
function cardNoteSuffix(shortLink: string): string {
  return ` [${shortLink}]${NOTE_EXTENSION}`;
}

/**
 * File name of a card's note: the card name, without the characters file
 * systems reject, then the short link.
 */
export function cardNoteFileName(cardName: string, shortLink: string): string {
  const clean = cardName
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot would hide the file.
    .replace(/^\.+/, '')
    .slice(0, NOTE_NAME_MAX_LENGTH)
    .trim();
  return `${clean || 'Trello'}${cardNoteSuffix(shortLink)}`;
}

/** `true` if a listed file is the note of the card. */
export function isCardNoteFile(path: string, shortLink: string): boolean {
  return path.endsWith(cardNoteSuffix(shortLink));
}

/** Last part of a path. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
