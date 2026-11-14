import {useSyncExternalStore} from 'react';
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {FALLBACK_PAGE_SIZE} from '../plugin/lassoText';
import {ensureFileReadPermission} from '../plugin/permissions';
import {logInkLink} from './diagnostics';
import {boundsOf, PageElement, Rect, unionOf} from './hitTest';
import {
  layoutLinkMark,
  MARK_FONT_SIZE,
  MARK_LABEL_PATTERN,
  markLabel,
} from './linkLayout';
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

/** Black and thicker than the note app's links, to read well on E Ink. */
const MARK_LINE_STYLE = {penColor: 0x00, penType: 10, penWidth: 400};

const GEOMETRY = 700;
const TEXT = 500;

type Size = {width: number; height: number};

async function pageSizeOf(selection: PendingBinding): Promise<Size> {
  const size = unwrap<Size>(
    await PluginFileAPI.getPageSize(selection.path, selection.page),
  );
  return size && size.width > 0 && size.height > 0 ? size : FALLBACK_PAGE_SIZE;
}

/** Latest element of a type, among those not holding the link yet. */
function latest(
  elements: readonly NoteElement[],
  link: string,
  matches: (element: NoteElement) => boolean,
): NoteElement | undefined {
  return elements
    .filter(element => element.userData !== link && matches(element))
    .sort((a, b) => (b.numInPage ?? 0) - (a.numInPage ?? 0))[0];
}

/**
 * Marks a linked selection like the note app's own links: a line under it
 * and a small `s-INK/c` or `s-INK/b` label at the line's end. Both carry
 * the link too: moved or copied with the selection, they stay part of it.
 * Geometry points and text box bounds are screen pixels.
 *
 * @returns A short result for the log.
 */
async function drawLinkMark(
  link: string,
  kind: InkLinkTarget['kind'],
  bounds: Rect,
  selection: PendingBinding,
): Promise<string> {
  const size = await pageSizeOf(selection);
  const mark = layoutLinkMark(bounds, kind, size.width, size.height);
  const line = unwrap<Record<string, any>>(
    await PluginCommAPI.createElement(GEOMETRY),
  );
  const label = unwrap<Record<string, any>>(
    await PluginCommAPI.createElement(TEXT),
  );
  if (!line || !label) {
    return 'not created';
  }
  line.userData = link;
  line.pageNum = selection.page;
  line.geometry = {
    ...(line.geometry ?? {}),
    ...MARK_LINE_STYLE,
    type: 'straightLine',
    points: mark.line,
    ellipseCenterPoint: null,
    ellipseMajorAxisRadius: 0,
    ellipseMinorAxisRadius: 0,
    ellipseAngle: 0,
  };
  label.userData = link;
  label.pageNum = selection.page;
  label.textBox = {
    ...(label.textBox ?? {}),
    textContentFull: mark.label,
    textRect: mark.labelRect,
    fontSize: MARK_FONT_SIZE,
  };
  const inserted = await PluginCommAPI.insertPageElements(
    [line, label],
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
  const found = [
    latest(elements, link, element => element.type === GEOMETRY),
    latest(
      elements,
      link,
      element =>
        element.type === TEXT &&
        (element as PageElement).textBox?.textContentFull === mark.label,
    ),
  ].filter((element): element is NoteElement => element !== undefined);
  const [from, to] = mark.line;
  let result = `${Math.round(from.x)},${Math.round(from.y)}-${Math.round(
    to.x,
  )},${Math.round(to.y)}, ${found.length}/2 found`;
  if (found.length > 0) {
    found.forEach(element => {
      element.userData = link;
    });
    const modified = await PluginCommAPI.modifyPageElements(
      found as any[],
      selection.page,
    );
    result += `, userData ${status(modified)}`;
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
    // A selection linked before already holds its mark: it is kept, and
    // its label follows the new target.
    const marked = selected.some(
      element =>
        element.type === GEOMETRY && parseInkLink(element.userData) !== null,
    );
    const label = markLabel(target.kind);
    selected.forEach(element => {
      element.userData = link;
      const textBox = (element as PageElement).textBox;
      if (
        element.type === TEXT &&
        textBox &&
        MARK_LABEL_PATTERN.test(textBox.textContentFull ?? '')
      ) {
        textBox.textContentFull = label;
      }
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
    const mark = marked
      ? 'kept'
      : bounds
      ? await drawLinkMark(link, target.kind, bounds, selection).catch(error =>
          String(error),
        )
      : 'no bounds';
    const saved = await PluginNoteAPI.saveCurrentNote();
    logInkLink(
      `bind ${link}: ${selected.length}/${
        selection.elements.length
      } elements on page ${selection.page}, mark ${mark}, save ${status(
        saved,
      )}`,
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
