import type {TranslationKey} from '../i18n';
import type {KeyValueStore} from '../storage/keyValueStore';

/**
 * Changes to the data an older version of s-INK left on the tablet, offered
 * once after an update. Each migration belongs to the version that brought
 * it: updating from an earlier version offers it, if there is something to
 * change on this tablet. The user turns each one on or off in a popup that
 * says what it does and what skipping it risks; the choice is kept, so a
 * migration is never offered twice.
 */
export interface Migration {
  /** Stable name, under which the user's choice is kept. */
  id: string;
  /** Version that brought it (`x.y.z`). */
  version: string;
  title: TranslationKey;
  /** What it changes. */
  description: TranslationKey;
  /** What may go wrong if it is run, if anything. */
  caution?: TranslationKey;
  /** What may go wrong if it is skipped. */
  risk: TranslationKey;
  /**
   * Whether there is anything to change on this tablet; `null` when this
   * cannot be told yet (no access to the files, say): it is looked at
   * again at the next opening. Never prompts.
   */
  isNeeded(context: MigrationContext): Promise<boolean | null>;
  /** Makes the change. May prompt: the plugin view is shown. */
  run(context: MigrationContext): Promise<MigrationOutcome>;
}

export interface MigrationContext {
  /** Where the plugin keeps its settings. */
  store: KeyValueStore;
}

/** What a migration did, in the user's language. */
export interface MigrationOutcome {
  ok: boolean;
  message: TranslationKey;
  params?: Record<string, string | number>;
}

/** What the user chose for a migration; kept, so it is not asked again. */
export type MigrationDecision = 'done' | 'declined';

/** Last version whose migrations were all settled. */
export const MIGRATIONS_VERSION_KEY = 'supertrello.migrations.version';
/** The user's choices, by migration id (JSON). */
export const MIGRATIONS_DECISIONS_KEY = 'supertrello.migrations.decisions';

/**
 * Compares two `x.y.z` versions: negative if `a` comes before `b`, zero if
 * they are the same, positive after. Missing or unreadable parts count as 0.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) =>
    version.split('.').map(part => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

async function loadDecisions(
  store: KeyValueStore,
): Promise<Record<string, MigrationDecision>> {
  try {
    const parsed: unknown = JSON.parse(
      (await store.getItem(MIGRATIONS_DECISIONS_KEY)) ?? '{}',
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const decisions: Record<string, MigrationDecision> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (value === 'done' || value === 'declined') {
        decisions[id] = value;
      }
    }
    return decisions;
  } catch {
    return {};
  }
}

/**
 * The migrations to offer after an update to `currentVersion`: those
 * brought by a version after the last one settled on this tablet (all of
 * them on a first run, or after an update from a version without
 * migrations), up to the current one, not chosen already, and with
 * something to change here. Once nothing is left to offer nor to look at
 * again, the current version is kept as settled, so that the next openings
 * look at nothing.
 */
export async function findPendingMigrations(
  store: KeyValueStore,
  currentVersion: string,
  migrations: readonly Migration[],
): Promise<Migration[]> {
  const settled = await store.getItem(MIGRATIONS_VERSION_KEY);
  if (settled && compareVersions(settled, currentVersion) >= 0) {
    return [];
  }
  const decisions = await loadDecisions(store);
  const pending: Migration[] = [];
  let unknown = false;
  for (const migration of migrations) {
    if (
      (settled && compareVersions(migration.version, settled) <= 0) ||
      compareVersions(migration.version, currentVersion) > 0 ||
      decisions[migration.id]
    ) {
      continue;
    }
    let needed: boolean | null;
    try {
      needed = await migration.isNeeded({store});
    } catch (error) {
      console.warn(`[sINK] Migration ${migration.id} check failed`, error);
      needed = null;
    }
    if (needed === null) {
      unknown = true;
    } else if (needed) {
      pending.push(migration);
    }
  }
  if (pending.length === 0 && !unknown) {
    await store.setItem(MIGRATIONS_VERSION_KEY, currentVersion);
  }
  return pending;
}

/**
 * Keeps the user's choices, so that these migrations are not offered
 * again; once the offered ones are all chosen, the current version is kept
 * as settled. A migration whose need could not be told at this opening
 * keeps the version unsettled: it is looked at again next time.
 */
export async function recordMigrationDecisions(
  store: KeyValueStore,
  currentVersion: string,
  chosen: Readonly<Record<string, MigrationDecision>>,
  migrations: readonly Migration[],
): Promise<void> {
  const decisions = {...(await loadDecisions(store)), ...chosen};
  await store.setItem(MIGRATIONS_DECISIONS_KEY, JSON.stringify(decisions));
  // Whatever was not offered had nothing to change, or will be looked at
  // again: the next check settles the version itself.
  const remaining = await findPendingMigrations(
    store,
    currentVersion,
    migrations,
  );
  if (remaining.length > 0) {
    console.warn(
      `[sINK] Migrations still pending: ${remaining.map(m => m.id).join(', ')}`,
    );
  }
}
