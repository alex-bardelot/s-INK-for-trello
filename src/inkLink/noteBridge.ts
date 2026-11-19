import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
  type Point,
  PointUtils,
} from 'sn-plugin-lib';

import {FALLBACK_PAGE_SIZE} from '../plugin/lassoText';
import {openInkLinkIntent} from '../plugin/launchIntent';
import {ensurePermission, Permission} from '../plugin/permissions';
import {cardNotesRoot} from '../startWork/noteFiles';
import {logInkLink} from './diagnostics';
import {clearPendingBinding} from './lassoBinding';
import {
  findInkLinks,
  inkLinkAt,
  mergeInkLinks,
  NoteElementType,
  PageElement,
  Rect,
} from './hitTest';
import {
  layoutCenteredLink,
  layoutTitleLink,
  LINK_FONT_SIZE,
  linkBounds,
  LinkLayout,
} from './linkLayout';
import {getDeviceStore} from '../storage/stores';
import {formatInkLink, InkLinkTarget} from './inkLink';
import {
  acceptsTool,
  getLinkTrigger,
  loadLinkTrigger,
  setLinkTrigger,
} from './trigger';
import {
  MotionAction,
  normalizeTouch,
  TapDetector,
  TouchSample,
} from './tapDetector';

interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

function unwrap<T>(response: unknown): T | null {
  const value = response as SdkResponse<T> | null | undefined;
  return value && value.success ? value.result ?? null : null;
}

function errorOf(response: unknown): string {
  const value = response as SdkResponse<unknown> | null | undefined;
  if (!value) {
    return `no response (${typeof response})`;
  }
  return `error ${value.error?.code ?? '?'}: ${value.error?.message ?? ''}`;
}

/** The app icon, copied next to the bundle by the build. */
const ICON_FILE_NAME = 'icon.png';

type Size = {width: number; height: number};

async function currentPage(): Promise<{path: string; page: number} | null> {
  const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
  const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
  return typeof path === 'string' && typeof page === 'number'
    ? {path, page}
    : null;
}

/** Page size used to convert between screen and EMR coordinates. */
async function pageSize(location: {path: string; page: number}): Promise<Size> {
  try {
    const size = unwrap<Size>(
      await PluginFileAPI.getPageSize(location.path, location.page),
    );
    if (size && size.width > 0 && size.height > 0) {
      return size;
    }
  } catch (error) {
    console.warn('[sINK] Failed to read the page size', error);
  }
  return FALLBACK_PAGE_SIZE;
}

/** Converts a rectangle between coordinate systems, whatever the rotation. */
function convertRect(rect: Rect, convert: (point: Point) => Point): Rect {
  const a = convert({x: rect.left, y: rect.top});
  const b = convert({x: rect.right, y: rect.bottom});
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

async function createElement(
  type: number,
): Promise<Record<string, any> | null> {
  const created = await PluginCommAPI.createElement(type);
  const element = unwrap<Record<string, any>>(created);
  if (!element) {
    logInkLink(`insert: createElement(${type}) ${errorOf(created)}`);
  }
  return element;
}

/**
 * Note page a link is placed on: the page shown in the note app, or a page
 * of a note file that is not open (a card's new note).
 */
interface LinkDestination {
  location: {path: string; page: number};
  insert(element: Record<string, any>): Promise<unknown>;
  read(): Promise<PageElement[] | null>;
  modify(elements: PageElement[]): Promise<unknown>;
  save(): Promise<unknown>;
}

const currentNoteDestination = (location: {
  path: string;
  page: number;
}): LinkDestination => ({
  location,
  insert: element => PluginCommAPI.insertPageElements([element], location.page),
  read: async () => (await readPageElements())?.elements ?? null,
  modify: elements =>
    PluginCommAPI.modifyPageElements(elements as any[], location.page),
  save: () => PluginNoteAPI.saveCurrentNote(),
});

const noteFileDestination = (location: {
  path: string;
  page: number;
}): LinkDestination => ({
  location,
  insert: element =>
    PluginFileAPI.insertElements(location.path, location.page, [element]),
  read: async () => {
    const response = await PluginFileAPI.getElements(
      location.page,
      location.path,
    );
    const elements = unwrap<PageElement[]>(response);
    if (!Array.isArray(elements)) {
      logInkLink(`insert: getElements ${errorOf(response)}`);
      return null;
    }
    return elements;
  },
  modify: elements =>
    PluginFileAPI.modifyElements(
      location.path,
      location.page,
      elements as any[],
    ),
  // The file is written by each call: there is no open note to save.
  save: async () => ({success: true}),
});

async function insertElement(
  element: Record<string, any>,
  destination: LinkDestination,
  what: string,
): Promise<boolean> {
  const inserted = await destination.insert(element);
  const ok = (inserted as SdkResponse<unknown> | null)?.success === true;
  if (!ok) {
    logInkLink(`insert ${what}: ${errorOf(inserted)}`);
  }
  return ok;
}

/** Places the app icon before the text; the link works without it. */
async function insertIcon(
  link: string,
  rect: Rect,
  destination: LinkDestination,
): Promise<string> {
  const {location} = destination;
  const picturePath = await sharedIconPath();
  if (!picturePath) {
    return 'no plugin dir';
  }
  const element = await createElement(NoteElementType.Picture);
  if (!element) {
    return 'not created';
  }
  const size = await pageSize(location);
  element.userData = link;
  element.pageNum = location.page;
  element.picture = {
    ...(element.picture ?? {}),
    picturePath,
    rect: convertRect(rect, point => PointUtils.androidPoint2Emr(point, size)),
  };
  return (await insertElement(element, destination, 'icon'))
    ? `ok (${picturePath})`
    : 'failed';
}

/** Name of the icon's copy next to the card notes, hidden by its dot. */
const SHARED_ICON_NAME = '.s-INK-icon.png';

/**
 * Path of the app icon for the note app. The copy next to the bundle lies
 * in the plugin host's private folder, which the note app may not read
 * (the icon was accepted but not drawn): it is copied once to the shared
 * `Note/s-INK for Trello` folder. Falls back on the private copy.
 */
async function sharedIconPath(): Promise<string | null> {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) {
    return null;
  }
  const source = `${dir.replace(/\/+$/, '')}/${ICON_FILE_NAME}`;
  try {
    const notesDir = cardNotesRoot(await FileUtils.getExportPath());
    const shared = `${notesDir}/${SHARED_ICON_NAME}`;
    if (await FileUtils.exists(shared)) {
      return shared;
    }
    if (!(await ensurePermission(Permission.FileWrite))) {
      logInkLink('icon: no write permission, private copy used');
      return source;
    }
    await FileUtils.makeDir(notesDir);
    const copied = await FileUtils.copyFile(source, shared);
    const exists = await FileUtils.exists(shared);
    logInkLink(`icon: copy to ${shared}: ${copied}, exists ${exists}`);
    return exists ? shared : source;
  } catch (error) {
    logInkLink(`icon: copy failed (${String(error)}), private copy used`);
    return source;
  }
}

function close(
  a: Rect | null | undefined,
  b: Rect,
  tolerance: number,
): boolean {
  return (
    !!a &&
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.right - b.right) <= tolerance &&
    Math.abs(a.bottom - b.bottom) <= tolerance
  );
}

/**
 * Writes the link again in the `userData` of the elements just inserted:
 * the host may not keep a value given at insertion, while one written by
 * `modifyPageElements` survives moves and copies.
 */
async function rewriteUserData(
  link: string,
  text: string,
  iconRect: Rect,
  destination: LinkDestination,
): Promise<string> {
  const elements = await destination.read();
  if (!elements) {
    return 'page not read';
  }
  const size = await pageSize(destination.location);
  const icon = convertRect(iconRect, point =>
    PointUtils.androidPoint2Emr(point, size),
  );
  const inserted = elements.filter(
    element =>
      element.userData !== link &&
      ((element.type === NoteElementType.Text &&
        element.textBox?.textContentFull === text) ||
        (element.type === NoteElementType.Picture &&
          close(element.picture?.rect, icon, 4))),
  );
  let result = `${inserted.length} without it`;
  if (inserted.length > 0) {
    inserted.forEach(element => {
      element.userData = link;
    });
    const modified = await destination.modify(inserted);
    result += `, modify ${
      (modified as SdkResponse<unknown>)?.success ? 'ok' : errorOf(modified)
    }`;
  }
  recycle(elements);
  return result;
}

/**
 * Inserts an s-INK link to a card or board in the middle of the current
 * page of the open note: the app icon, then a text box sized to the name
 * and the link. Both elements also hold the link in their `userData`.
 *
 * @returns The rectangle of the link on the page (screen pixels), to
 * select it, or `null` if the host refused the text box.
 */
export async function insertInkLink(
  target: InkLinkTarget,
  name: string,
): Promise<Rect | null> {
  try {
    const location = await currentPage();
    if (!location) {
      logInkLink('insert: no open note page');
      return null;
    }
    const {width, height} = await pageSize(location);
    const layout = layoutCenteredLink(
      name,
      formatInkLink(target),
      width,
      height,
    );
    return (await placeInkLink(
      target,
      name,
      currentNoteDestination(location),
      layout,
    ))
      ? linkBounds(layout)
      : null;
  } catch (error) {
    logInkLink(`insert: ${String(error)}`);
    return null;
  }
}

/** Space kept around a link when it is selected. */
const SELECTION_MARGIN = 12;

/** How long the lasso is asked again while the plugin view goes away. */
const LASSO_RETRY_MS = 3000;
/**
 * How long the lasso is asked again once it caught something else than
 * the link: the note shown before is still there, the new one is coming.
 */
const LASSO_WRONG_NOTE_MS = 10000;
/** Upper bound of lasso attempts, should the host answer at once. */
const LASSO_MAX_ATTEMPTS = 200;
/** Lasso box state removing the selection altogether. */
const LASSO_BOX_REMOVED = 2;
/** How long a new selection is watched, to make it again if it goes. */
const LASSO_WATCH_MS = 2500;
/** Upper bound of checks while watching, should the host answer at once. */
const LASSO_MAX_WATCH_CHECKS = 1000;
/** Times a lost selection is made again: the user may be dropping it. */
const LASSO_MAX_REDO = 3;

/** A link just placed on a page, to select with the lasso. */
export interface PlacedLink {
  /** Where it lies on the page (screen pixels). */
  rect: Rect;
  /** The link itself (`s-INK/c/{shortLink}`), to know it was selected. */
  link: string;
}

/**
 * Closes the plugin view, then selects a link just placed on the current
 * page with the lasso, so that it can be moved at once. The view must be
 * closed first: the host drops the lasso while it shows.
 */
export async function closeViewAndSelect(
  placed: PlacedLink | null,
): Promise<void> {
  try {
    await PluginManager.closePluginView();
  } catch (error) {
    logInkLink(`close view: ${String(error)}`);
  }
  if (placed) {
    await selectInkLink(placed);
  }
}

/**
 * What the lasso caught: the link, something else (the note shown is not
 * the one the link was placed in), or `unknown` when the selection cannot
 * be read.
 */
async function lassoCaught(link: string): Promise<'link' | 'other' | 'unknown'> {
  try {
    const elements = unwrap<PageElement[]>(
      await PluginCommAPI.getLassoElements(),
    );
    if (!Array.isArray(elements)) {
      return 'unknown';
    }
    const found = elements.some(
      element =>
        element.userData === link ||
        !!element.textBox?.textContentFull?.includes(link),
    );
    recycle(elements);
    return found ? 'link' : 'other';
  } catch {
    return 'unknown';
  }
}

/** Removes a selection made on the wrong note, which would keep it shown. */
async function dropLasso(): Promise<void> {
  try {
    await PluginCommAPI.setLassoBoxState(LASSO_BOX_REMOVED);
  } catch (error) {
    logInkLink(`lasso drop: ${String(error)}`);
  }
}

/**
 * Selects a link of the current page with the lasso, with a small margin.
 * Called once the plugin view is closed, when JavaScript timers may no
 * longer fire (the plugin is in the background): instead of waiting with
 * `setTimeout`, the lasso is asked again until it succeeds or the time is
 * up, each attempt being a call to the host.
 *
 * Right after `openFile`, the host may already name the new note as the
 * current one while the note app still shows the one before: the lasso
 * then catches what lies at the same place there (its own title), and that
 * selection holds the note app on it. Such a selection is removed, and the
 * lasso asked again until the new note shows.
 */
export async function selectInkLink({rect, link}: PlacedLink): Promise<boolean> {
  const padded = {
    left: rect.left - SELECTION_MARGIN,
    top: rect.top - SELECTION_MARGIN,
    right: rect.right + SELECTION_MARGIN,
    bottom: rect.bottom + SELECTION_MARGIN,
  };
  const started = Date.now();
  let deadline = started + LASSO_RETRY_MS;
  let attempts = 0;
  let wrong = 0;
  let answer = '';
  while (attempts < LASSO_MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const response = await PluginCommAPI.lassoElements(padded);
      if ((response as SdkResponse<unknown> | null)?.success === true) {
        const caught = await lassoCaught(link);
        if (caught !== 'other') {
          answer = caught === 'link' ? 'ok' : 'ok (selection not read)';
          break;
        }
        wrong += 1;
        answer = 'caught another note';
        await dropLasso();
        deadline = started + LASSO_WRONG_NOTE_MS;
      } else {
        answer = errorOf(response);
      }
    } catch (error) {
      answer = String(error);
    }
    if (Date.now() > deadline) {
      break;
    }
  }
  logInkLink(
    `lasso ${Math.round(padded.left)},${Math.round(padded.top)}-${Math.round(
      padded.right,
    )},${Math.round(padded.bottom)}: ${answer} after ${attempts} attempt(s)${
      wrong ? `, ${wrong} on another note` : ''
    }, ${Date.now() - started} ms`,
  );
  if (!answer.startsWith('ok')) {
    return false;
  }
  await keepSelected(padded, link);
  return true;
}

/**
 * Watches a new selection for a moment and makes it again when it goes:
 * the lasso was seen on the page, then dropped by itself, probably by the
 * note app finishing to show the note (or the plugin view going away).
 * Timers do not fire then, so the host is asked again and again.
 */
async function keepSelected(rect: Rect, link: string): Promise<void> {
  const started = Date.now();
  let checks = 0;
  let redone = 0;
  let lostAt: number[] = [];
  while (
    Date.now() - started < LASSO_WATCH_MS &&
    checks < LASSO_MAX_WATCH_CHECKS &&
    redone < LASSO_MAX_REDO
  ) {
    checks += 1;
    if (await lassoActive()) {
      continue;
    }
    lostAt = [...lostAt, Date.now() - started];
    redone += 1;
    try {
      await PluginCommAPI.lassoElements(rect);
      if ((await lassoCaught(link)) === 'other') {
        logInkLink('lasso again: caught another note, dropped');
        await dropLasso();
        break;
      }
    } catch (error) {
      logInkLink(`lasso again: ${String(error)}`);
    }
  }
  logInkLink(
    `lasso kept: ${checks} check(s) in ${Date.now() - started} ms, ${
      redone
        ? `made again ${redone} time(s), lost at ${lostAt.join(', ')} ms`
        : 'never lost'
    }, active at the end ${await lassoActive()}`,
  );
}

/**
 * Places an s-INK link centred at the top of a page of a note file that is
 * not open, as its title: used for the note created for a card.
 *
 * @returns The rectangle of the title on the page (screen pixels), or
 * `null` if the host refused the text box.
 */
export async function insertInkLinkInNoteFile(
  path: string,
  page: number,
  target: InkLinkTarget,
  name: string,
): Promise<Rect | null> {
  try {
    const destination = noteFileDestination({path, page});
    const {width} = await pageSize(destination.location);
    const layout = layoutTitleLink(name, formatInkLink(target), width);
    return (await placeInkLink(target, name, destination, layout))
      ? linkBounds(layout)
      : null;
  } catch (error) {
    logInkLink(`insert in ${path}: ${String(error)}`);
    return null;
  }
}

async function placeInkLink(
  target: InkLinkTarget,
  name: string,
  destination: LinkDestination,
  layout: LinkLayout,
): Promise<boolean> {
  const link = formatInkLink(target);
  const {location} = destination;
  const element = await createElement(NoteElementType.Text);
  if (!element) {
    return false;
  }
  element.userData = link;
  element.pageNum = location.page;
  element.textBox = {
    ...(element.textBox ?? {}),
    textContentFull: layout.text,
    textRect: layout.textRect,
    fontSize: LINK_FONT_SIZE,
  };
  if (!(await insertElement(element, destination, 'text'))) {
    return false;
  }
  const icon = await insertIcon(link, layout.iconRect, destination);
  const userData = await rewriteUserData(
    link,
    layout.text,
    layout.iconRect,
    destination,
  ).catch(error => String(error));
  const saved = await destination.save();
  logInkLink(
    `insert: ${link} in ${location.path} page ${
      location.page
    }, icon ${icon}, userData ${userData}, save ${
      (saved as SdkResponse<unknown>)?.success ? 'ok' : errorOf(saved)
    }`,
  );
  return true;
}

async function readPageElements(): Promise<{
  elements: PageElement[];
  location: {path: string; page: number};
} | null> {
  const location = await currentPage();
  if (!location) {
    logInkLink('tap: no open note page');
    return null;
  }
  const response = await PluginFileAPI.getElements(
    location.page,
    location.path,
  );
  const elements = unwrap<PageElement[]>(response);
  if (!Array.isArray(elements)) {
    logInkLink(`tap: getElements ${errorOf(response)}`);
    return null;
  }
  return {elements, location};
}

function recycle(elements: readonly PageElement[]): void {
  for (const element of elements) {
    const recyclable = element as {recycle?: () => Promise<void>};
    recyclable.recycle?.().catch(() => undefined);
  }
}

/** Raw touch events written to the diagnostics log. */
const RAW_EVENTS_LOGGED = 3;

function rawText(event: unknown): string {
  try {
    return JSON.stringify(event).slice(0, 300);
  } catch {
    return String(event);
  }
}

/** Whether a lasso selection is shown: the host only gives its bounds then. */
async function lassoActive(): Promise<boolean> {
  try {
    const rect = unwrap<Rect>(await PluginCommAPI.getLassoRect());
    return !!rect && rect.right > rect.left && rect.bottom > rect.top;
  } catch {
    return false;
  }
}

/** Native links described per tap. */
const NATIVE_LINKS_LOGGED = 3;

/**
 * Logs the native links of the page, whatever their target, to see what
 * the note app stores for a link to a website (docs/ink-link-tracking.md).
 */
function logNativeLinks(elements: readonly PageElement[]): void {
  const native = elements.filter(
    element => element.type === NoteElementType.Link,
  );
  if (native.length === 0) {
    return;
  }
  const described = native.slice(0, NATIVE_LINKS_LOGGED).map(element => {
    try {
      return JSON.stringify(element.link).slice(0, 160);
    } catch {
      return String(element.link);
    }
  });
  logInkLink(`tap: ${native.length} native links: ${described.join(' | ')}`);
}

/** A tap still handled after this long no longer blocks the next ones. */
const TAP_TIMEOUT_MS = 5000;

/** Start time of the tap being handled, or 0. */
let busySince = 0;

async function handleTap(x: number, y: number): Promise<void> {
  const now = Date.now();
  if (busySince) {
    if (now - busySince < TAP_TIMEOUT_MS) {
      logInkLink(`tap ${Math.round(x)},${Math.round(y)}: previous tap busy`);
      return;
    }
    logInkLink(
      `tap ${Math.round(x)},${Math.round(y)}: previous tap stuck for ${
        now - busySince
      } ms, ignored`,
    );
  }
  const started = now;
  busySince = started;
  logInkLink(`tap ${Math.round(x)},${Math.round(y)}: reading the page`);
  try {
    // Never prompt from a tap: the permission is asked when the view opens.
    const permission = await PluginManager.hasPermission(Permission.FileRead);
    if (permission !== 1 && permission !== 2) {
      logInkLink(
        `tap ${Math.round(x)},${Math.round(y)}: no file read permission`,
      );
      return;
    }
    // With a lasso selection, taps go to the lasso toolbar (its "Link to
    // Trello" button may lie over a link): they open nothing.
    if (await lassoActive()) {
      logInkLink(
        `tap ${Math.round(x)},${Math.round(y)}: lasso active, ignored`,
      );
      return;
    }
    const page = await readPageElements();
    if (!page) {
      return;
    }
    const {elements, location} = page;
    // Picture bounds are in EMR coordinates: the page size converts them.
    const size = elements.some(element => element.picture?.rect)
      ? await pageSize(location)
      : null;
    const links = mergeInkLinks(
      findInkLinks(
        elements,
        size
          ? rect =>
              convertRect(rect, point =>
                PointUtils.emrPoint2Android(point, size),
              )
          : undefined,
      ),
    );
    logNativeLinks(elements);
    recycle(elements);
    const hit = inkLinkAt(links, x, y);
    logInkLink(
      `tap ${Math.round(x)},${Math.round(y)}: ${elements.length} elements, ${
        links.length
      } links${
        links.length
          ? ` (${links
              .map(
                ({rect, source}) =>
                  `${source} ${Math.round(rect.left)},${Math.round(
                    rect.top,
                  )}-${Math.round(rect.right)},${Math.round(rect.bottom)}`,
              )
              .join('; ')})`
          : ''
      }${hit ? ` -> ${formatInkLink(hit.target)}` : ''}`,
    );
    if (hit) {
      // A selection still waiting to be linked is given up.
      clearPendingBinding();
      openInkLinkIntent(hit.target);
      await PluginManager.showPluginView();
    }
  } catch (error) {
    logInkLink(`tap: ${String(error)}`);
  } finally {
    // A stuck tap that ends late must not release a newer one.
    if (busySince === started) {
      busySince = 0;
    }
  }
}

/**
 * Reads the saved link trigger at startup, only if note read access is
 * already granted: a permission prompt must not appear while writing. The
 * plugin view reads it again when it opens.
 */
async function restoreLinkTrigger(): Promise<void> {
  try {
    const permission = await PluginManager.hasPermission(Permission.FileRead);
    if (permission === 1 || permission === 2) {
      setLinkTrigger(await loadLinkTrigger(getDeviceStore()));
    }
  } catch (error) {
    console.warn('[sINK] Failed to restore the link trigger', error);
  }
}

/**
 * Listens to the touches on the note and opens the plugin when an s-INK
 * link is tapped with the tool chosen in Settings (finger, pen or both).
 * Must be called once, after `PluginManager.init()`.
 */
export function startInkLinkTaps(): void {
  restoreLinkTrigger();
  const detector = new TapDetector(toolType =>
    acceptsTool(getLinkTrigger(), toolType),
  );
  let received = 0;
  let unreadable = 0;
  const actions = new Map<number, number>();
  try {
    PluginManager.registerMotionListener(1, {
      onMsg: (event: TouchSample) => {
        received += 1;
        // The first raw events show what the host really sends.
        if (received <= RAW_EVENTS_LOGGED) {
          logInkLink(`raw event ${received}: ${rawText(event)}`);
        }
        const touch = normalizeTouch(event);
        if (!touch) {
          unreadable += 1;
          if (unreadable <= RAW_EVENTS_LOGGED) {
            logInkLink(`unreadable event: ${rawText(event)}`);
          }
          return;
        }
        actions.set(touch.action, (actions.get(touch.action) ?? 0) + 1);
        const tap = detector.feed(touch);
        if (touch.action === MotionAction.Up) {
          const release = detector.lastRelease;
          logInkLink(
            `release ${Math.round(touch.x)},${Math.round(touch.y)} tool ${
              touch.toolType
            }: ${
              release
                ? `${Math.round(release.durationMs)} ms, ${Math.round(
                    release.distancePx,
                  )} px, ${release.tap ? 'tap' : 'not a tap'}`
                : acceptsTool(getLinkTrigger(), touch.toolType)
                ? 'no press seen'
                : `ignored (links open with: ${getLinkTrigger()})`
            } (events ${received}, by action ${Array.from(actions)
              .map(([action, count]) => `${action}:${count}`)
              .join(' ')})`,
          );
        }
        if (tap) {
          handleTap(tap.x, tap.y);
        }
      },
    });
    logInkLink('motion listener registered');
  } catch (error) {
    logInkLink(`motion listener refused: ${String(error)}`);
  }
}
