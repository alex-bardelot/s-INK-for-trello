import {TrelloBoard} from '../trello';

/**
 * Layout of the boards page: sections of board tiles laid out in a grid and
 * split into pages that fit the screen, so that the E Ink display never has
 * to scroll.
 */

/** Greys a board background is reduced to, from light to dark. */
export const BOARD_SHADES = ['#E2E2E2', '#AFAFAF', '#7C7C7C', '#4A4A4A'] as const;

/** Grey used when a board gives no background color. */
export const DEFAULT_BOARD_SHADE = '#C8C8C8';

/** Parses `#rgb` or `#rrggbb` into its channels, or returns `null`. */
export function parseHexColor(
  color: string | null | undefined,
): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color?.trim() ?? '');
  if (!match) {
    return null;
  }
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map(c => c + c)
          .join('')
      : match[1];
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/**
 * Grey standing for the board background on the E Ink display: its relative
 * luminance mapped to one of a few well separated shades, so that boards of
 * different colors stay distinguishable.
 */
export function boardShade(board: Pick<TrelloBoard, 'prefs'>): string {
  const prefs = board.prefs;
  const rgb = parseHexColor(
    prefs?.backgroundColor ??
      prefs?.backgroundBottomColor ??
      prefs?.backgroundTopColor,
  );
  if (!rgb) {
    return DEFAULT_BOARD_SHADE;
  }
  const [r, g, b] = rgb.map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Thresholds tuned on Trello's palette: light colors (sky, lime) get the
  // lightest shade; green, orange and grey (luminance 0.24–0.34) the next;
  // blue, purple and red (0.14–0.17) the third; dark gradients the darkest.
  if (luminance > 0.5) {
    return BOARD_SHADES[0];
  }
  if (luminance > 0.2) {
    return BOARD_SHADES[1];
  }
  if (luminance > 0.06) {
    return BOARD_SHADES[2];
  }
  return BOARD_SHADES[3];
}

/**
 * URL of the board background photo to show on a tile `minWidth` pixels
 * wide: the smallest scaled version at least that wide (to save bandwidth),
 * else the largest one, else the full size image. `null` for plain colors.
 */
export function boardImageUrl(
  board: Pick<TrelloBoard, 'prefs'>,
  minWidth: number,
): string | null {
  const scaled = [...(board.prefs?.backgroundImageScaled ?? [])]
    .filter(image => image?.url && image.width > 0)
    .sort((a, b) => a.width - b.width);
  if (scaled.length > 0) {
    return (
      scaled.find(image => image.width >= minWidth) ??
      scaled[scaled.length - 1]
    ).url;
  }
  return board.prefs?.backgroundImage || null;
}

/** One row of the boards page. */
export type DirectoryRow =
  | {kind: 'header'; key: string; section: DirectorySection}
  | {kind: 'roadmap'; key: string}
  | {kind: 'tiles'; key: string; boards: TrelloBoard[]}
  | {kind: 'message'; key: string};

export type DirectorySection = 'starred' | 'all';

/**
 * Rows of the boards page: the Supernote roadmap card, the starred boards,
 * then the other boards (each board appears once), the tiles grouped
 * `columns` per row. When `boards` is `null` (loading, failure), a message
 * row stands for the user's boards. The roadmap card is left out when
 * `showRoadmap` is `false`.
 */
export function buildDirectoryRows(
  boards: readonly TrelloBoard[] | null,
  columns: number,
  showRoadmap = true,
): DirectoryRow[] {
  const rows: DirectoryRow[] = showRoadmap
    ? [{kind: 'roadmap', key: 'roadmap'}]
    : [];
  const addSection = (
    section: DirectorySection,
    list: readonly TrelloBoard[],
  ) => {
    rows.push({kind: 'header', key: `header:${section}`, section});
    const perRow = Math.max(1, columns);
    for (let i = 0; i < list.length; i += perRow) {
      rows.push({
        kind: 'tiles',
        key: `${section}:${i}`,
        boards: list.slice(i, i + perRow),
      });
    }
  };

  if (!boards || boards.length === 0) {
    rows.push({kind: 'header', key: 'header:all', section: 'all'});
    rows.push({kind: 'message', key: 'message'});
    return rows;
  }
  const starred = boards.filter(board => board.starred);
  const others = boards.filter(board => !board.starred);
  if (starred.length > 0) {
    addSection('starred', starred);
  }
  if (others.length > 0) {
    addSection('all', others);
  }
  return rows;
}

/** Fixed heights of the rows, in pixels, so that pages can be computed upfront. */
export interface RowHeights {
  header: number;
  roadmap: number;
  tiles: number;
  message: number;
  /** Space between two rows. */
  gap: number;
}

/**
 * Splits rows into pages that fit `available` pixels. A section header is
 * never left alone at the bottom of a page: it moves to the next page with
 * the first row of its section. Every page holds at least one row.
 */
export function paginateRows(
  rows: readonly DirectoryRow[],
  available: number,
  heights: RowHeights,
): DirectoryRow[][] {
  const pages: DirectoryRow[][] = [];
  let page: DirectoryRow[] = [];
  let used = 0;

  const heightOf = (row: DirectoryRow) => heights[row.kind];
  const fits = (height: number) =>
    page.length === 0 || used + heights.gap + height <= available;
  const add = (row: DirectoryRow) => {
    used += (page.length === 0 ? 0 : heights.gap) + heightOf(row);
    page.push(row);
  };
  const turn = () => {
    pages.push(page);
    page = [];
    used = 0;
  };

  rows.forEach((row, index) => {
    const next = rows[index + 1];
    const needed =
      row.kind === 'header' && next
        ? heightOf(row) + heights.gap + heightOf(next)
        : heightOf(row);
    if (!fits(needed)) {
      turn();
    }
    add(row);
  });
  if (page.length > 0 || pages.length === 0) {
    pages.push(page);
  }
  return pages;
}

/** Tiles per row of the grid: three in portrait, four in landscape. */
export function directoryColumns(width: number, height: number): number {
  return width > height ? 4 : 3;
}
