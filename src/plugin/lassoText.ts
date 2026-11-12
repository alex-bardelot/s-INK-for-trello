import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';

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
const FALLBACK_PAGE_SIZE = {width: 1920, height: 2560};

interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

interface LassoElement {
  type: number;
  textBox?: {textContentFull?: string | null} | null;
}

/** Why no text could be taken from the lasso selection. */
export type LassoTextError = 'noSelection' | 'recognitionFailed';

export type LassoTextResult =
  | {ok: true; text: string}
  | {ok: false; error: LassoTextError};

function unwrap<T>(response: unknown): T | null {
  const value = response as SdkResponse<T> | null | undefined;
  return value?.success ? value.result ?? null : null;
}

/** Size of the current page, which handwriting recognition is based on. */
async function getCurrentPageSize(): Promise<{width: number; height: number}> {
  try {
    const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
    const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
    if (path && typeof page === 'number') {
      const size = unwrap<{width: number; height: number}>(
        await PluginFileAPI.getPageSize(path, page),
      );
      if (size?.width && size.height) {
        return size;
      }
    }
  } catch (error) {
    console.warn('[SuperTrello] Failed to read the page size', error);
  }
  return FALLBACK_PAGE_SIZE;
}

/**
 * Reads the text of the current lasso selection: handwriting is converted
 * by the device's recognition engine, text boxes are read as is.
 */
export async function readLassoText(): Promise<LassoTextResult> {
  let elements: LassoElement[];
  try {
    elements =
      unwrap<LassoElement[]>(await PluginCommAPI.getLassoElements()) ?? [];
  } catch (error) {
    console.warn('[SuperTrello] Failed to read the lasso selection', error);
    return {ok: false, error: 'noSelection'};
  }

  const strokes = elements.filter(e => e.type === ElementType.Stroke);
  const typed = elements
    .filter(e => TEXT_TYPES.has(e.type))
    .map(e => e.textBox?.textContentFull?.trim() ?? '')
    .filter(Boolean);

  let handwriting = '';
  if (strokes.length > 0) {
    try {
      const size = await getCurrentPageSize();
      handwriting =
        unwrap<string>(
          await PluginCommAPI.recognizeElements(strokes, size),
        )?.trim() ?? '';
    } catch (error) {
      console.warn('[SuperTrello] Handwriting recognition failed', error);
    }
  }

  const text = [handwriting, ...typed].filter(Boolean).join('\n');
  if (text) {
    return {ok: true, text};
  }
  return {
    ok: false,
    error: strokes.length > 0 ? 'recognitionFailed' : 'noSelection',
  };
}
