import {useSyncExternalStore} from 'react';

/**
 * In-memory log of the s-INK link prototype (taps received, links found,
 * insertions), shown in Settings > About to check on the tablet what the
 * host really sends.
 */

const MAX_LINES = 60;
/**
 * Lines of the plugin startup, kept apart so that the taps logged while
 * writing do not push them out: they tell whether the buttons work.
 */
const STARTUP_PREFIX = 'startup:';
const MAX_STARTUP_LINES = 20;

let lines: readonly string[] = [];
let startupLines: readonly string[] = [];
/** What the log shows: recent lines, then the startup ones (oldest last). */
let snapshot: readonly string[] = [];
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = [...lines, ...startupLines];
  listeners.forEach(listener => listener());
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds(),
  )}`;
}

/** Adds a line, newest first. */
export function logInkLink(message: string): void {
  console.log(`[sINK] link: ${message}`);
  const line = `${timestamp()} ${message}`;
  if (message.startsWith(STARTUP_PREFIX)) {
    startupLines = [line, ...startupLines].slice(0, MAX_STARTUP_LINES);
  } else {
    lines = [line, ...lines].slice(0, MAX_LINES);
  }
  publish();
}

/** Clears the recent lines; the startup ones stay, as they still apply. */
export function clearInkLinkLog(): void {
  lines = [];
  publish();
}

/** The lines shown, newest first, startup lines last. */
export function getInkLinkLog(): readonly string[] {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the log lines, newest first. */
export function useInkLinkLog(): readonly string[] {
  return useSyncExternalStore(subscribe, () => snapshot);
}
