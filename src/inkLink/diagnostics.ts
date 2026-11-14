import {useSyncExternalStore} from 'react';

/**
 * In-memory log of the s-INK link prototype (taps received, links found,
 * insertions), shown in Settings > About to check on the tablet what the
 * host really sends.
 */

const MAX_LINES = 60;

let lines: readonly string[] = [];
const listeners = new Set<() => void>();

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
  lines = [`${timestamp()} ${message}`, ...lines].slice(0, MAX_LINES);
  listeners.forEach(listener => listener());
}

export function clearInkLinkLog(): void {
  lines = [];
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the log lines, newest first. */
export function useInkLinkLog(): readonly string[] {
  return useSyncExternalStore(subscribe, () => lines);
}
