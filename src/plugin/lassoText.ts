import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {ensureFileReadPermission} from './permissions';

/** Element types, from `Element.TYPE_*` in the Supernote SDK. */
const ElementType = {
  Stroke: 0,
  Text: 500,
  TextDigestQuote: 501,
  TextDigestCreate: 502,
} as const;

const TEXT_TYPES = new Set<number>([
  ElementType.Text,
  ElementType.TextDigestQuote,
  ElementType.TextDigestCreate,
]);

/** Page size of the Supernote Manta, used if the real size is unavailable. */
export const FALLBACK_PAGE_SIZE = {width: 1920, height: 2560};

interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

interface LassoElement {
  type: number;
  textBox?: {textContentFull?: string | null} | null;
}

type Size = {width: number; height: number};

/** Why no text could be taken from the lasso selection. */
export type LassoTextError =
  | 'noSelection'
  | 'recognitionFailed'
  | 'permissionDenied';

export type LassoTextResult =
  | {ok: true; text: string}
  | {ok: false; error: LassoTextError; diagnostics: string};

function asResponse<T>(response: unknown): SdkResponse<T> | null {
  return response && typeof response === 'object'
    ? (response as SdkResponse<T>)
    : null;
}

function unwrap<T>(response: unknown): T | null {
  const value = asResponse<T>(response);
  return value?.success ? value.result ?? null : null;
}

/** Short description of an SDK response, for the diagnostics. */
function describe(response: unknown): string {
  const value = asResponse<unknown>(response);
  if (!value) {
    return `no response (${typeof response})`;
  }
  if (!value.success) {
    return `error ${value.error?.code ?? '?'}: ${value.error?.message ?? ''}`;
  }
  const result = value.result;
  if (typeof result === 'string') {
    return `ok, ${result.trim().length} chars`;
  }
  return `ok, result ${result === null ? 'null' : typeof result}`;
}

/** Extracts recognized text, whatever shape the host returns it in. */
export function recognizedText(response: unknown): string {
  const result = unwrap<unknown>(response);
  if (typeof result === 'string') {
    return result.trim();
  }
  if (result && typeof result === 'object') {
    const candidate =
      (result as {text?: unknown; content?: unknown}).text ??
      (result as {content?: unknown}).content;
    if (typeof candidate === 'string') {
      return candidate.trim();
    }
  }
  return '';
}

/** Size of the current page, which handwriting recognition is based on. */
async function getCurrentPageSize(log: string[]): Promise<Size | null> {
  try {
    const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
    const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
    if (path && typeof page === 'number') {
      const response = await PluginFileAPI.getPageSize(path, page);
      const size = unwrap<Size>(response);
      if (size?.width && size.height) {
        log.push(`page ${page}: ${size.width}x${size.height}`);
        return size;
      }
      log.push(`page size: ${describe(response)}`);
    } else {
      log.push(`page: path=${path ? 'yes' : 'no'} num=${page}`);
    }
  } catch (error) {
    log.push(`page size threw: ${String(error)}`);
  }
  return null;
}

async function recognize(
  elements: LassoElement[],
  size: Size,
  label: string,
  log: string[],
): Promise<string> {
  try {
    const response = await PluginCommAPI.recognizeElements(elements, size);
    log.push(`${label} ${size.width}x${size.height}: ${describe(response)}`);
    return recognizedText(response);
  } catch (error) {
    log.push(`${label} threw: ${String(error)}`);
    return '';
  }
}

/** Typed text of the selection, read from the elements or the note API. */
async function readTypedText(
  elements: LassoElement[],
  log: string[],
): Promise<string[]> {
  const typed = elements
    .filter(e => TEXT_TYPES.has(e.type))
    .map(e => e.textBox?.textContentFull?.trim() ?? '')
    .filter(Boolean);
  if (typed.length > 0) {
    return typed;
  }
  try {
    const response = await PluginNoteAPI.getLassoText();
    const boxes = unwrap<Array<{textContentFull?: string | null}>>(response);
    log.push(`getLassoText: ${describe(response)}`);
    return (Array.isArray(boxes) ? boxes : [])
      .map(box => box?.textContentFull?.trim() ?? '')
      .filter(Boolean);
  } catch (error) {
    log.push(`getLassoText threw: ${String(error)}`);
    return [];
  }
}

function countTypes(elements: LassoElement[]): string {
  const counts = new Map<number, number>();
  for (const element of elements) {
    counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => `${type}×${count}`).join(', ');
}

/**
 * Reads the text of the current lasso selection: handwriting is converted
 * by the device's recognition engine, text boxes are read as is.
 * Several strategies are tried in turn, since the SDK documents little.
 *
 * @param onCaptured - Called once the selection itself is read (elements,
 *   typed text, page size), before the slow handwriting recognition, which
 *   no longer needs the lasso. Not called if the selection cannot be read.
 */
export async function readLassoText(
  onCaptured: () => void = () => {},
): Promise<LassoTextResult> {
  // getLassoElements is a file read API: without FILE:READ the host rejects it.
  if (
    !(await ensureFileReadPermission(i18n.t('card.filePermissionRationale')))
  ) {
    return {
      ok: false,
      error: 'permissionDenied',
      diagnostics: 'FILE:READ permission not granted',
    };
  }
  const log: string[] = [];
  let elements: LassoElement[] = [];
  try {
    const response = await PluginCommAPI.getLassoElements();
    const result = unwrap<LassoElement[]>(response);
    elements = Array.isArray(result) ? result : [];
    log.push(`lasso: ${describe(response)}, ${elements.length} elements`);
    if (elements.length > 0) {
      log.push(`types: ${countTypes(elements)}`);
    }
  } catch (error) {
    log.push(`lasso threw: ${String(error)}`);
  }

  const typed = await readTypedText(elements, log);
  const strokes = elements.filter(e => e.type === ElementType.Stroke);
  // Unknown types may still be handwriting: let the engine sort them out.
  const others = elements.filter(e => !TEXT_TYPES.has(e.type));
  const handwritingCandidates = strokes.length > 0 ? strokes : others;

  // Read while the note is still in front, before the view is shown.
  const pageSize =
    handwritingCandidates.length > 0 ? await getCurrentPageSize(log) : null;
  onCaptured();

  let handwriting = '';
  if (handwritingCandidates.length > 0) {
    const sizes = [pageSize ?? FALLBACK_PAGE_SIZE];
    if (
      pageSize &&
      (pageSize.width !== FALLBACK_PAGE_SIZE.width ||
        pageSize.height !== FALLBACK_PAGE_SIZE.height)
    ) {
      sizes.push(FALLBACK_PAGE_SIZE);
    }
    for (const size of sizes) {
      handwriting = await recognize(
        handwritingCandidates,
        size,
        'recognize strokes',
        log,
      );
      if (handwriting) {
        break;
      }
    }
    if (!handwriting && handwritingCandidates.length !== elements.length) {
      handwriting = await recognize(elements, sizes[0], 'recognize all', log);
    }
  }

  const text = [handwriting, ...typed].filter(Boolean).join('\n');
  if (text) {
    return {ok: true, text};
  }
  const diagnostics = log.join('\n');
  console.warn('[sINK] No text in the lasso selection\n' + diagnostics);
  return {
    ok: false,
    error:
      handwritingCandidates.length > 0 ? 'recognitionFailed' : 'noSelection',
    diagnostics,
  };
}
