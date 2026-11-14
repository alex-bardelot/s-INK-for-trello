import {
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
  type Point,
  PointUtils,
} from 'sn-plugin-lib';

import {FALLBACK_PAGE_SIZE} from '../plugin/lassoText';
import {openInkLinkIntent} from '../plugin/launchIntent';
import {Permission} from '../plugin/permissions';
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
import {layoutLink, LINK_FONT_SIZE} from './linkLayout';
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

/** Top left corner of a new link on the page, in screen pixels. */
const NEW_LINK_ORIGIN = {x: 160, y: 160};

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

async function insertElement(
  element: Record<string, any>,
  page: number,
  what: string,
): Promise<boolean> {
  const inserted = await PluginCommAPI.insertPageElements([element], page);
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
  location: {path: string; page: number},
): Promise<string> {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) {
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
    picturePath: `${dir.replace(/\/+$/, '')}/${ICON_FILE_NAME}`,
    rect: convertRect(rect, point => PointUtils.androidPoint2Emr(point, size)),
  };
  return (await insertElement(element, location.page, 'icon'))
    ? 'ok'
    : 'failed';
}

function close(a: Rect | null | undefined, b: Rect, tolerance: number): boolean {
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
  location: {path: string; page: number},
): Promise<string> {
  const page = await readPageElements();
  if (!page) {
    return 'page not read';
  }
  const size = await pageSize(location);
  const icon = convertRect(iconRect, point =>
    PointUtils.androidPoint2Emr(point, size),
  );
  const inserted = page.elements.filter(
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
    const modified = await PluginCommAPI.modifyPageElements(
      inserted as any[],
      location.page,
    );
    result += `, modify ${
      (modified as SdkResponse<unknown>)?.success ? 'ok' : errorOf(modified)
    }`;
  }
  recycle(page.elements);
  return result;
}

/**
 * Inserts an s-INK link to a card or board on the current page of the
 * open note: the app icon, then a text box sized to the name and the link.
 * Both elements also hold the link in their `userData`.
 *
 * @returns `true` if the host accepted the text box.
 */
export async function insertInkLink(
  target: InkLinkTarget,
  name: string,
): Promise<boolean> {
  const link = formatInkLink(target);
  try {
    const location = await currentPage();
    if (!location) {
      logInkLink('insert: no open note page');
      return false;
    }
    const layout = layoutLink(name, link, NEW_LINK_ORIGIN);
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
    if (!(await insertElement(element, location.page, 'text'))) {
      return false;
    }
    const icon = await insertIcon(link, layout.iconRect, location);
    const userData = await rewriteUserData(
      link,
      layout.text,
      layout.iconRect,
      location,
    ).catch(error => String(error));
    const saved = await PluginNoteAPI.saveCurrentNote();
    logInkLink(
      `insert: ${link} on page ${
        location.page
      }, icon ${icon}, userData ${userData}, save ${
        (saved as SdkResponse<unknown>)?.success ? 'ok' : errorOf(saved)
      }`,
    );
    return true;
  } catch (error) {
    logInkLink(`insert: ${String(error)}`);
    return false;
  }
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
      logInkLink(`tap ${Math.round(x)},${Math.round(y)}: lasso active, ignored`);
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
            convertRect(rect, point => PointUtils.emrPoint2Android(point, size))
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
