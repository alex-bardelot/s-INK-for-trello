import {useSyncExternalStore} from 'react';
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

import {FALLBACK_PAGE_SIZE} from '../plugin/lassoText';
import {hasFileReadPermission} from '../plugin/permissions';
import {logInkLink} from './diagnostics';
import {boundsOf, PageElement, Rect, unionOf} from './hitTest';
import {layoutLinkMark, MARK_LABEL_PATTERN} from './linkLayout';
import {sameSegment, Segment} from './strokeFont';
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
    // No prompt here: with the view hidden it would never show. The view
    // asks for the permission once it is open.
    if (!(await hasFileReadPermission())) {
      logInkLink('bind: no file read permission, the view will ask');
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
/** The label's letters, thinner than the line. */
const MARK_LABEL_STYLE = {penColor: 0x00, penType: 10, penWidth: 200};

const GEOMETRY = 700;
const TEXT = 500;

type Size = {width: number; height: number};

async function pageSizeOf(selection: PendingBinding): Promise<Size> {
  const size = unwrap<Size>(
    await PluginFileAPI.getPageSize(selection.path, selection.page),
  );
  return size && size.width > 0 && size.height > 0 ? size : FALLBACK_PAGE_SIZE;
}

async function readPage(selection: PendingBinding): Promise<NoteElement[]> {
  const page = unwrap<NoteElement[]>(
    await PluginFileAPI.getElements(selection.page, selection.path),
  );
  return Array.isArray(page) ? page : [];
}

async function createSegment(
  segment: Segment,
  style: typeof MARK_LINE_STYLE,
  link: string,
  page: number,
): Promise<Record<string, any> | null> {
  const element = unwrap<Record<string, any>>(
    await PluginCommAPI.createElement(GEOMETRY),
  );
  if (!element) {
    return null;
  }
  element.userData = link;
  element.pageNum = page;
  element.geometry = {
    ...(element.geometry ?? {}),
    ...style,
    type: 'straightLine',
    points: segment,
    ellipseCenterPoint: null,
    ellipseMajorAxisRadius: 0,
    ellipseMinorAxisRadius: 0,
    ellipseAngle: 0,
  };
  return element;
}

/**
 * Marks a linked selection like the note app's own links: a line under it
 * and a small `s-INK/c` or `s-INK/b` label at the line's end, drawn with
 * line segments. All of them carry the link too: moved or copied with the
 * selection, they stay part of it. Geometry points are screen pixels.
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
  const created = await Promise.all([
    createSegment(mark.line, MARK_LINE_STYLE, link, selection.page),
    ...mark.label.map(segment =>
      createSegment(segment, MARK_LABEL_STYLE, link, selection.page),
    ),
  ]);
  const elements = created.filter(
    (element): element is Record<string, any> => element !== null,
  );
  if (elements.length < created.length) {
    return `${created.length - elements.length} not created`;
  }
  const inserted = await PluginCommAPI.insertPageElements(
    elements,
    selection.page,
  );
  if ((inserted as SdkResponse<unknown> | null)?.success !== true) {
    return `insert ${status(inserted)}`;
  }
  // The new segments are found by their points: page numbers do not tell
  // them apart. A value given at insertion may not be kept, so the link is
  // written again on those that lack it.
  const after = await readPage(selection);
  const segments = [mark.line, ...mark.label];
  const drawn = after.filter(
    element =>
      element.type === GEOMETRY &&
      segments.some(segment =>
        sameSegment((element as PageElement).geometry?.points, segment),
      ),
  );
  const untagged = drawn.filter(element => element.userData !== link);
  const [from, to] = mark.line;
  let result = `${Math.round(from.x)},${Math.round(from.y)}-${Math.round(
    to.x,
  )},${Math.round(to.y)}, ${drawn.length}/${elements.length} found, ${
    untagged.length
  } untagged`;
  if (untagged.length > 0) {
    untagged.forEach(element => {
      element.userData = link;
    });
    const modified = await PluginCommAPI.modifyPageElements(
      untagged as any[],
      selection.page,
    );
    result += `, userData ${status(modified)}`;
  }
  if (drawn.length === 0) {
    const sample = after.find(element => element.type === GEOMETRY) as
      | PageElement
      | undefined;
    result += `, sample ${JSON.stringify(
      sample?.geometry?.points ?? null,
    ).slice(0, 60)}`;
  }
  recycle(after);
  return result;
}

/**
 * Whether an element is part of the mark of a linked selection: one of
 * its line segments, or the label text box of versions 0.30.x.
 */
function isMark(element: NoteElement): boolean {
  if (parseInkLink(element.userData) === null) {
    return false;
  }
  return (
    element.type === GEOMETRY ||
    (element.type === TEXT &&
      MARK_LABEL_PATTERN.test(
        (element as PageElement).textBox?.textContentFull ?? '',
      ))
  );
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
  const bound = await bindSelection(selection, target);
  if (bound) {
    setPending(null);
  }
  return bound;
}

/**
 * Writes the link to a card or board in the `userData` of a selection,
 * draws its mark, then saves the note. Used by Insert Trello Link, and by
 * New Trello Card for the selection the card was made from.
 *
 * @returns `true` if the host accepted the change.
 */
export async function bindSelection(
  selection: PendingBinding,
  target: InkLinkTarget,
): Promise<boolean> {
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
        typeof element.numInPage === 'number' && wanted.has(element.numInPage),
    );
    if (selected.length === 0) {
      logInkLink(
        `bind ${link}: selection not found on page ${selection.page} (${status(
          response,
        )})`,
      );
      return false;
    }
    // A selection linked before holds an old mark: it is replaced.
    const oldMark = selected.filter(isMark);
    const content = selected.filter(element => !isMark(element));
    if (content.length === 0) {
      logInkLink(`bind ${link}: only a link mark is selected`);
      return false;
    }
    content.forEach(element => {
      element.userData = link;
    });
    const modified = await PluginCommAPI.modifyPageElements(
      content,
      selection.page,
    );
    if ((modified as SdkResponse<unknown> | null)?.success !== true) {
      logInkLink(`bind ${link}: modify ${status(modified)}`);
      return false;
    }
    const bounds = unionOf(
      content
        .map(element => boundsOf(element as PageElement))
        .filter((rect): rect is Rect => rect !== null),
    );
    let removed = '';
    if (oldMark.length > 0) {
      const deleted = await PluginCommAPI.deletePageElements(
        oldMark
          .map(element => element.numInPage)
          .filter((value): value is number => typeof value === 'number'),
        selection.page,
      );
      removed = `, old mark ${oldMark.length} deleted ${status(deleted)}`;
    }
    const mark = bounds
      ? await drawLinkMark(link, target.kind, bounds, selection).catch(error =>
          String(error),
        )
      : 'no bounds';
    const saved = await PluginNoteAPI.saveCurrentNote();
    logInkLink(
      `bind ${link}: ${content.length}/${
        selection.elements.length
      } elements on page ${
        selection.page
      }${removed}, mark ${mark}, save ${status(saved)}`,
    );
    return true;
  } catch (error) {
    logInkLink(`bind ${link}: ${String(error)}`);
    return false;
  } finally {
    recycle(elements);
  }
}
