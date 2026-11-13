import {TrelloBoard} from './types';

/**
 * Short link of Supernote's official public software roadmap board, where
 * Ratta tracks the features in development for its tablets.
 *
 * @see https://trello.com/b/l0COP24j/supernote-a5-x-a6-x-manta-nomad-software-roadmap-2025
 */
export const SUPERNOTE_ROADMAP_SHORT_LINK = 'l0COP24j';

/**
 * Name shown on the roadmap tile. The board's own name is long and changes
 * every year ("Supernote A5 X/A6 X/Manta/Nomad Software Roadmap 2026").
 */
export const SUPERNOTE_ROADMAP_NAME = 'Supernote Roadmap';

/**
 * `true` for Supernote's roadmap board. That board is read only for
 * sINK users: it is not offered for new cards, and the Focus and
 * Review modes, which are about the user's own work, are not available on it.
 */
export function isSupernoteRoadmap(
  board: Pick<TrelloBoard, 'shortLink' | 'url'>,
): boolean {
  return (
    board.shortLink === SUPERNOTE_ROADMAP_SHORT_LINK ||
    board.url.includes(`/b/${SUPERNOTE_ROADMAP_SHORT_LINK}/`)
  );
}
