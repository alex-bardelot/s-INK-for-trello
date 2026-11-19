import {
  addShortLinksToNoteNames,
  listNotesWithoutShortLink,
} from '../startWork/cardNote';
import {Migration} from './migrations';

/**
 * 0.73.0: the card notes made by 0.47.0–0.71.0 are named after their card
 * alone; they get the card's short link, which now ties a note to its card
 * (`{card} [{short link}].note`, as made since 0.72.0).
 */
export const noteShortLinksMigration: Migration = {
  id: 'noteShortLinks',
  version: '0.73.0',
  title: 'migrations.noteShortLinks.title',
  description: 'migrations.noteShortLinks.description',
  caution: 'migrations.noteShortLinks.caution',
  risk: 'migrations.noteShortLinks.risk',
  isNeeded: async () => {
    const notes = await listNotesWithoutShortLink();
    return notes === null ? null : notes.length > 0;
  },
  run: async ({store}) => {
    const {renamed, untitled, failed} = await addShortLinksToNoteNames(store);
    return {
      ok: failed === 0,
      message: 'migrations.noteShortLinks.result',
      params: {renamed, untitled, failed},
    };
  },
};

/** Every migration, oldest first. */
export const MIGRATIONS: readonly Migration[] = [noteShortLinksMigration];
