import {useSyncExternalStore} from 'react';
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {FALLBACK_PAGE_SIZE} from '../plugin/lassoText';
import {ensureFileReadPermission} from '../plugin/permissions';
import {logInkLink} from './diagnostics';
import {boundsOf, PageElement, Rect, underlineOf, unionOf} from './hitTest';
import {formatInkLink, InkLinkTarget, parseInkLink} from './inkLink';

/**
 * Links a lasso selection (handwriting, text boxes) to a Trello card or
 * board, see docs/ink-link-tracking.md: the link is written in the
 * `userData` of the selected elements, which the note app keeps when they
 * are moved or copied.
 *
 * The selection is read when the lasso button is pressed, since the host
 * drops the lasso once the plugin view opens. It is kept as page numbers
 * of the elements (`numInPage`), which stay valid while the note is not
 * edited, that is while the plugin view is shown.
 */

interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

function unwrap<T>(response: unknown): T | null {
  const value = response as SdkResponse<T> | null | undefined;
  return value && value.success ? value.result ?? null : null;
}

function status(response: unknown): string {
  const value = response as SdkResponse<unknown> | null | undefined;
  if (!value) {
    return `no response (${typeof response})`;
  }
  return value.success
    ? 'ok'
    : `error ${value.error?.code ?? '?'}: ${value.error?.message ?? ''}`;
}

interface NoteElement {
  type?: number;
  numInPage?: number;
  userData?: string | null;
  recycle?: () => Promise<void>;
}

/** A lasso selection waiting for the card or board to link it to. */
export interface PendingBinding {
  path: string;
  page: number;
  /** Page numbers of the selected elements. */
  elements: readonly number[];
}

type Listener = () => void;

let pending: PendingBinding | null = null;
const listeners = new Set<Listener>();

function setPending(value: PendingBinding | null): void {
  pending = value;
  listeners.forEach(listener => listener());
}

export function getPendingBinding(): PendingBinding | null {
  return pending;
}

/** Forgets the selection waiting to be linked. */
export function clearPendingBinding(): void {
  if (pending) {
    setPending(null);
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the selection waiting to be linked, if any. */
export function usePendingBinding(): PendingBinding | null {
  return useSyncExternalStore(subscribe, getPendingBinding);
}

function recycle(elements: readonly NoteElement[]): void {
  for (const element of elements) {
    element.recycle?.().catch(() => undefined);
  }
}

/**
 * Reads the lasso selection to link. Must run in the button listener,
 * before the plugin view is shown.
 *
 * @returns `true` if a selection is now waiting to be linked.
 */
export async function captureLassoSelection(): Promise<boolean> {
  setPending(null);
  try {
    if (
      !(await ensureFileReadPermission(i18n.t('card.filePermissionRationale')))
    ) {
      logInkLink('bind: no file read permission');
      return false;
    }
    const response = await PluginCommAPI.getLassoElements();
    const result = unwrap<NoteElement[]>(response);
    const elements = Array.isArray(result) ? result : [];
    const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
    const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
    const numbers = elements
      .map(element => element.numInPage)
      .filter((value): value is number => typeof value === 'number');
    recycle(elements);
    if (typeof path !== 'string' || typeof page !== 'number') {
      logInkLink('bind: no open note page');
      return false;
    }
    if (numbers.length === 0) {
      logInkLink(`bind: empty selection (${status(response)})`);
      return false;
    }
    setPending({path, page, elements: numbers});
    logInkLink(`bind: ${numbers.length} elements selected on page ${page}`);
    return true;
  } catch (error) {
    logInkLink(`bind: ${String(error)}`);
    return false;
  }
}

/** Dark gray, technical pen: the look of the note app's own links. */
const UNDERLINE_STYLE = {penColor: 0x9d, penType: 10, penWidth: 200};

const GEOMETRY = 700;

type Size = {width: number; height: number};

async function pageSizeOf(selection: PendingBinding): Promise<Size> {
  const size = unwrap<Size>(
    await PluginFileAPI.getPageSize(selection.path, selection.page),
  );
  return size && size.width > 0 && size.height > 0 ? size : FALLBACK_PAGE_SIZE;
}

/**
 * Draws a line under a linked selection, so it shows as a link. The line
 * carries the link too: moved or copied with the selection, it stays part
 * of it. Geometry points are screen pixels.
 *
 * @returns A short result for the log.
 */
async function drawUnderline(
  link: string,
  bounds: Rect,
  selection: PendingBinding,
): Promise<string> {
  const size = await pageSizeOf(selection);
  const created = unwrap<Record<string, any>>(
    await PluginCommAPI.createElement(GEOMETRY),
  );
  if (!created) {
    return 'not created';
  }
  const points = underlineOf(bounds, size.width, size.height);
  created.userData = link;
  created.pageNum = selection.page;
  created.geometry = {
    ...(created.geometry ?? {}),
    ...UNDERLINE_STYLE,
    type: 'straightLine',
    points,
    ellipseCenterPoint: null,
    ellipseMajorAxisRadius: 0,
    ellipseMinorAxisRadius: 0,
    ellipseAngle: 0,
  };
  const inserted = await PluginCommAPI.insertPageElements(
    [created],
    selection.page,
  );
  if ((inserted as SdkResponse<unknown> | null)?.success !== true) {
    return `insert ${status(inserted)}`;
  }
  // A value given at insertion may not be kept: write it again.
  const page = unwrap<NoteElement[]>(
    await PluginFileAPI.getElements(selection.page, selection.path),
  );
  const elements = Array.isArray(page) ? page : [];
  const line = elements
    .filter(element => element.type === GEOMETRY && element.userData !== link)
    .sort((a, b) => (b.numInPage ?? 0) - (a.numInPage ?? 0))[0];
  let result = `${Math.round(points[0].x)},${Math.round(
    points[0].y,
  )}-${Math.round(points[1].x)},${Math.round(points[1].y)}`;
  if (line) {
    line.userData = link;
    const modified = await PluginCommAPI.modifyPageElements(
      [line] as any[],
      selection.page,
    );
    const stored = (line as {geometry?: {points?: unknown}}).geometry?.points;
    result += `, userData ${status(modified)}, stored ${JSON.stringify(
      stored ?? null,
    ).slice(0, 80)}`;
  } else {
    result += ', line not found';
  }
  recycle(elements);
  return result;
}

/**
 * Writes the link to a card or board in the `userData` of the selection
 * waiting to be linked, then saves the note.
 *
 * @returns `true` if the host accepted the change.
 */
export async function bindPendingSelection(
  target: InkLinkTarget,
): Promise<boolean> {
  const selection = pending;
  if (!selection) {
    return false;
  }
  const link = formatInkLink(target);
  let elements: NoteElement[] = [];
  try {
    const response = await PluginFileAPI.getElements(
      selection.page,
      selection.path,
    );
    const result = unwrap<NoteElement[]>(response);
    elements = Array.isArray(result) ? result : [];
    const wanted = new Set(selection.elements);
    const selected = elements.filter(
      element =>
        typeof element.numInPage === 'number' &&
        wanted.has(element.numInPage),
    );
    if (selected.length === 0) {
      logInkLink(
        `bind ${link}: selection not found on page ${selection.page} (${status(
          response,
        )})`,
      );
      return false;
    }
    // A selection linked before already holds its line: it is kept.
    const underlined = selected.some(
      element =>
        element.type === GEOMETRY && parseInkLink(element.userData) !== null,
    );
    selected.forEach(element => {
      element.userData = link;
    });
    const modified = await PluginCommAPI.modifyPageElements(
      selected,
      selection.page,
    );
    if ((modified as SdkResponse<unknown> | null)?.success !== true) {
      logInkLink(`bind ${link}: modify ${status(modified)}`);
      return false;
    }
    const bounds = unionOf(
      selected
        .map(element => boundsOf(element as PageElement))
        .filter((rect): rect is Rect => rect !== null),
    );
    const underline = underlined
      ? 'kept'
      : bounds
      ? await drawUnderline(link, bounds, selection).catch(error =>
          String(error),
        )
      : 'no bounds';
    const saved = await PluginNoteAPI.saveCurrentNote();
    logInkLink(
      `bind ${link}: ${selected.length}/${
        selection.elements.length
      } elements on page ${
        selection.page
      }, underline ${underline}, save ${status(saved)}`,
    );
    setPending(null);
    return true;
  } catch (error) {
    logInkLink(`bind ${link}: ${String(error)}`);
    return false;
  } finally {
    recycle(elements);
  }
}
