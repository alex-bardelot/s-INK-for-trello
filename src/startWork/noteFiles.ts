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
  const root = exportPath
    ? exportPath.replace(/\/+$/, '').replace(/\/EXPORT$/i, '')
    : '';
  return `${root || DEFAULT_STORAGE_ROOT}/${CARD_NOTES_FOLDER}`;
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
