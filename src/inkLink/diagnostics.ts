import {useSyncExternalStore} from 'react';

/**
 * In-memory log of the s-INK link prototype (taps received, links found,
 * insertions), shown in Settings > About to check on the tablet what the
 * host really sends.
 */

const MAX_LINES = 60;

/**
 * Lines kept apart from the recent ones, so that the pen releases logged
 * while writing do not push them out. Shown after the recent lines, in
 * this order.
 */
interface PinnedGroup {
  prefixes: readonly string[];
  max: number;
  /** Whether **Clear** empties the group too. */
  clearable: boolean;
  lines: readonly string[];
}

const PINNED: PinnedGroup[] = [
  // Button presses and what they led to: they tell why a button did
  // nothing.
  {
    prefixes: ['button ', 'card:', 'bind:', 'attach:'],
    max: 30,
    clearable: true,
    lines: [],
  },
  // The plugin startup: it tells whether the buttons can work at all.
  {prefixes: ['startup:'], max: 20, clearable: false, lines: []},
];

let lines: readonly string[] = [];
/** What the log shows: recent lines, then the pinned ones (oldest last). */
let snapshot: readonly string[] = [];
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = [...lines, ...PINNED.flatMap(group => group.lines)];
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
  const group = PINNED.find(candidate =>
    candidate.prefixes.some(prefix => message.startsWith(prefix)),
  );
  if (group) {
    group.lines = [line, ...group.lines].slice(0, group.max);
  } else {
    lines = [line, ...lines].slice(0, MAX_LINES);
  }
  publish();
}

/** Clears the recent lines and the button ones; the startup ones stay. */
export function clearInkLinkLog(): void {
  lines = [];
  PINNED.forEach(group => {
    if (group.clearable) {
      group.lines = [];
    }
  });
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
