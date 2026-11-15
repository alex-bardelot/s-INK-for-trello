/**
 * Connection left for the browser. The plugin view is closed once the
 * browser opens (it would stay drawn over it), so the relay session and
 * the stay-connected choice are kept here: reopening s-INK goes back to the
 * connection page, which picks up the token with the same session.
 */
import {RELAY_SESSION_LIFETIME_MS, RelaySession} from './relaySession';

export interface PendingConnection {
  /** Relay session the browser page belongs to, if a relay is used. */
  session: RelaySession | null;
  /** Whether the token is to be saved on the tablet. */
  remember: boolean;
  /** When the browser was opened, in milliseconds. */
  startedAt: number;
}

let pending: PendingConnection | null = null;

/** Records the connection the browser was opened for. */
export function setPendingConnection(connection: PendingConnection): void {
  pending = connection;
}

/**
 * The connection waiting for the browser, or `null` if there is none or it
 * outlived the relay session (the relay has forgotten it by then).
 */
export function getPendingConnection(
  now: number = Date.now(),
): PendingConnection | null {
  if (pending && now - pending.startedAt >= RELAY_SESSION_LIFETIME_MS) {
    pending = null;
  }
  return pending;
}

/** Forgets the connection: signed in, given up, or session replaced. */
export function clearPendingConnection(): void {
  pending = null;
}
