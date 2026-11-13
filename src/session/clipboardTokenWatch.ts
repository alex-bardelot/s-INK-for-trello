import {normalizeToken} from '../trello';

/** Delay between two clipboard reads, in milliseconds. */
export const CLIPBOARD_POLL_INTERVAL_MS = 1500;

export interface ClipboardTokenWatchOptions {
  /** Reads the clipboard text; `null` when empty or unreadable. */
  read: () => Promise<string | null>;
  /** Called with the raw clipboard text when a new token shows up. */
  onToken: (text: string) => void;
  /** While it returns `true`, reads are skipped (e.g. a connection runs). */
  isPaused?: () => boolean;
  intervalMs?: number;
}

/**
 * Polls the clipboard and reports a token as soon as one is copied, so the
 * user can copy it in the browser and come back without pressing Paste.
 *
 * A clipboard text is reported at most once: a token already rejected by
 * Trello is not tried again until something else is copied. The text found
 * on the first read counts as new, so a token copied before opening the
 * page is picked up too.
 *
 * @returns A function that stops watching.
 */
export function watchClipboardForToken({
  read,
  onToken,
  isPaused = () => false,
  intervalMs = CLIPBOARD_POLL_INTERVAL_MS,
}: ClipboardTokenWatchOptions): () => void {
  let stopped = false;
  let reading = false;
  let lastSeen: string | null = null;

  const check = async () => {
    if (stopped || reading || isPaused()) {
      return;
    }
    reading = true;
    try {
      const text = await read();
      if (stopped || text === null || text === lastSeen) {
        return;
      }
      lastSeen = text;
      if (normalizeToken(text)) {
        onToken(text);
      }
    } finally {
      reading = false;
    }
  };

  check();
  const timer = setInterval(check, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
