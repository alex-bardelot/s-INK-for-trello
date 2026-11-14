import {
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';

import {openInkLinkIntent} from '../plugin/launchIntent';
import {Permission} from '../plugin/permissions';
import {logInkLink} from './diagnostics';
import {findInkLinks, inkLinkAt, NoteElementType, PageElement} from './hitTest';
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

/** Glyph shown before the name: ≡ for a card, ▥ for a board. */
const KIND_GLYPH = {card: '≡', board: '▥'} as const;

/** Where a new link goes on the page, in page pixels (Manta page 1920 wide). */
const NEW_LINK_RECT = {left: 160, top: 160, right: 1160, bottom: 300};
const NEW_LINK_FONT_SIZE = 36;

async function currentPage(): Promise<{path: string; page: number} | null> {
  const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
  const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
  return typeof path === 'string' && typeof page === 'number'
    ? {path, page}
    : null;
}

/**
 * Inserts an s-INK link to a card or board on the current page of the
 * open note: a text box showing the name and the link, with the link also
 * stored in its `userData`.
 *
 * @returns `true` if the host accepted the element.
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
    const created = await PluginCommAPI.createElement(NoteElementType.Text);
    const element = unwrap<Record<string, any>>(created);
    if (!element) {
      logInkLink(`insert: createElement ${errorOf(created)}`);
      return false;
    }
    element.userData = link;
    element.pageNum = location.page;
    element.textBox = {
      ...(element.textBox ?? {}),
      textContentFull: `${KIND_GLYPH[target.kind]} ${name}\n${link}`,
      textRect: NEW_LINK_RECT,
      fontSize: NEW_LINK_FONT_SIZE,
    };
    const inserted = await PluginCommAPI.insertPageElements(
      [element],
      location.page,
    );
    if (!(inserted as SdkResponse<unknown> | null)?.success) {
      logInkLink(`insert: insertPageElements ${errorOf(inserted)}`);
      return false;
    }
    const saved = await PluginNoteAPI.saveCurrentNote();
    logInkLink(
      `insert: ${link} on page ${location.page}, save ${
        (saved as SdkResponse<unknown>)?.success ? 'ok' : errorOf(saved)
      }`,
    );
    return true;
  } catch (error) {
    logInkLink(`insert: ${String(error)}`);
    return false;
  }
}

async function readPageElements(): Promise<PageElement[] | null> {
  const location = await currentPage();
  if (!location) {
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
  return elements;
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

let busy = false;

async function handleTap(x: number, y: number): Promise<void> {
  if (busy) {
    return;
  }
  busy = true;
  try {
    // Never prompt from a tap: the permission is asked when the view opens.
    const permission = await PluginManager.hasPermission(Permission.FileRead);
    if (permission !== 1 && permission !== 2) {
      logInkLink(
        `tap ${Math.round(x)},${Math.round(y)}: no file read permission`,
      );
      return;
    }
    const elements = await readPageElements();
    if (!elements) {
      return;
    }
    const links = findInkLinks(elements);
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
      openInkLinkIntent(hit.target);
      await PluginManager.showPluginView();
    }
  } catch (error) {
    logInkLink(`tap: ${String(error)}`);
  } finally {
    busy = false;
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
