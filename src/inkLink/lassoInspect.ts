import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {ensureFileReadPermission} from '../plugin/permissions';
import {logInkLink} from './diagnostics';
import {
  boundsOf,
  describeElement,
  Point,
  presentKeys,
  RawElement,
  StrokeProbe,
  strokeFingerprint,
} from './elementProbe';

/**
 * Diagnostic lasso button (see docs/ink-link-tracking.md): logs what the
 * host returns for the selected elements, so that a selection can be
 * compared before and after a lasso move. If no selected element carries
 * `userData`, each one is tagged with `s-INK/diag/{time}-{n}`, which is
 * no link (`parseInkLink` ignores it), to see whether a value written by
 * the plugin survives the move.
 */

interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

/** Elements described per press; the log keeps 60 lines. */
const MAX_ELEMENTS = 12;
/** Stroke points read for the bounds and the fingerprint. */
const MAX_POINTS = 4000;

const STROKE = 0;

function unwrap<T>(response: unknown): T | null {
  const value = response as SdkResponse<T> | null | undefined;
  return value && value.success ? value.result ?? null : null;
}

function status(response: unknown): string {
  const value = response as SdkResponse<unknown> | null | undefined;
  if (!value) {
    return `no response (${typeof response})`;
  }
  if (value.success) {
    const result = value.result;
    return `ok ${
      Array.isArray(result) ? `[${result.join(',')}]` : String(result)
    }`;
  }
  return `error ${value.error?.code ?? '?'}: ${value.error?.message ?? ''}`;
}

interface PointAccessor {
  size(): Promise<number>;
  getRange(start: number, count: number): Promise<Point[]>;
}

async function probeStroke(element: RawElement): Promise<StrokeProbe | null> {
  const points = (element.stroke as {points?: PointAccessor} | undefined)
    ?.points;
  if (element.type !== STROKE || !points?.size) {
    return null;
  }
  try {
    const pointCount = await points.size();
    const sampled = await points.getRange(0, Math.min(pointCount, MAX_POINTS));
    return {
      pointCount,
      bounds: boundsOf(sampled),
      fingerprint: pointCount <= MAX_POINTS ? strokeFingerprint(sampled) : null,
    };
  } catch (error) {
    logInkLink(`inspect: points ${String(error)}`);
    return null;
  }
}

function tagOf(index: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `s-INK/diag/${pad(now.getHours())}${pad(now.getMinutes())}${pad(
    now.getSeconds(),
  )}-${index + 1}`;
}

/** Writes a diagnostic tag in the `userData` of untagged elements. */
async function tagElements(
  elements: RawElement[],
  page: number | null,
): Promise<void> {
  if (page === null) {
    logInkLink('inspect: no page number, nothing tagged');
    return;
  }
  elements.forEach((element, index) => {
    element.userData = tagOf(index);
  });
  const modified = await PluginCommAPI.modifyPageElements(elements, page);
  const saved = await PluginNoteAPI.saveCurrentNote();
  logInkLink(
    `inspect: tagged ${elements.length}, modify ${status(
      modified,
    )}, save ${status(saved)}`,
  );
}

/**
 * Logs the lasso selection. Must run in the button listener, before any
 * view is shown: the host drops the lasso when the plugin view opens.
 */
export async function inspectLassoSelection(): Promise<void> {
  try {
    if (
      !(await ensureFileReadPermission(i18n.t('card.filePermissionRationale')))
    ) {
      logInkLink('inspect: no file read permission');
      return;
    }
    const response = await PluginCommAPI.getLassoElements();
    const result = unwrap<RawElement[]>(response);
    const elements = Array.isArray(result) ? result : [];
    const rect = unwrap<unknown>(await PluginCommAPI.getLassoRect());
    const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
    const links = unwrap<unknown[]>(await PluginNoteAPI.getLassoLinks());
    logInkLink(
      `inspect: page ${page ?? '?'}, ${elements.length} elements (${status(
        response,
      ).slice(0, 40)}), lasso ${JSON.stringify(rect)}, ${
        Array.isArray(links) ? links.length : '?'
      } native links`,
    );
    if (elements.length > 0) {
      logInkLink(`inspect: keys ${presentKeys(elements[0])}`);
    }
    const shown = elements.slice(0, MAX_ELEMENTS);
    for (const [index, element] of shown.entries()) {
      const stroke = await probeStroke(element);
      logInkLink(`inspect #${index + 1}: ${describeElement(element, stroke)}`);
    }
    if (Array.isArray(links)) {
      for (const link of links.slice(0, 3)) {
        logInkLink(`inspect link: ${JSON.stringify(link).slice(0, 200)}`);
      }
    }
    if (shown.length > 0 && shown.every(element => !element.userData)) {
      await tagElements(shown, page);
    }
  } catch (error) {
    logInkLink(`inspect: ${String(error)}`);
  }
}
