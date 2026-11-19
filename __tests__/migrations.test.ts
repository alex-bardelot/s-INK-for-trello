import {
  compareVersions,
  findPendingMigrations,
  Migration,
  MIGRATIONS_DECISIONS_KEY,
  MIGRATIONS_VERSION_KEY,
  recordMigrationDecisions,
} from '../src/migrations/migrations';
import {createMemoryStore} from '../src/storage/keyValueStore';

function migration(
  id: string,
  version: string,
  needed: boolean | null = true,
): Migration & {checks: number} {
  const made = {
    id,
    version,
    title: 'migrations.noteShortLinks.title',
    description: 'migrations.noteShortLinks.description',
    risk: 'migrations.noteShortLinks.risk',
    checks: 0,
    isNeeded: async () => {
      made.checks++;
      return needed;
    },
    run: async () => ({ok: true, message: 'migrations.doneTitle'}),
  } as Migration & {checks: number};
  return made;
}

describe('compareVersions', () => {
  it('orders versions part by part, as numbers', () => {
    expect(compareVersions('0.72.0', '0.73.0')).toBeLessThan(0);
    expect(compareVersions('0.73.0', '0.72.9')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('x', '0.0.0')).toBe(0);
  });
});

describe('findPendingMigrations', () => {
  it('offers the migrations needed since the last settled version', async () => {
    const store = createMemoryStore();
    await store.setItem(MIGRATIONS_VERSION_KEY, '0.72.0');
    const old = migration('old', '0.72.0');
    const brought = migration('brought', '0.73.0');
    const future = migration('future', '0.74.0');
    const pending = await findPendingMigrations(store, '0.73.0', [
      old,
      brought,
      future,
    ]);
    expect(pending.map(m => m.id)).toEqual(['brought']);
    expect(old.checks).toBe(0);
    expect(future.checks).toBe(0);
    // Offered, not chosen yet: the version stays unsettled.
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBe('0.72.0');
  });

  it('looks at every migration on a first run, and settles when none is needed', async () => {
    const store = createMemoryStore();
    const pending = await findPendingMigrations(store, '0.73.0', [
      migration('a', '0.50.0', false),
      migration('b', '0.73.0', false),
    ]);
    expect(pending).toEqual([]);
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBe('0.73.0');
  });

  it('looks at nothing once the version is settled', async () => {
    const store = createMemoryStore();
    await store.setItem(MIGRATIONS_VERSION_KEY, '0.73.0');
    const one = migration('a', '0.73.0');
    expect(await findPendingMigrations(store, '0.73.0', [one])).toEqual([]);
    expect(one.checks).toBe(0);
  });

  it('keeps the version unsettled while a need cannot be told', async () => {
    const store = createMemoryStore();
    const pending = await findPendingMigrations(store, '0.73.0', [
      migration('a', '0.73.0', null),
    ]);
    expect(pending).toEqual([]);
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBeNull();
  });

  it('never offers a migration already chosen', async () => {
    const store = createMemoryStore();
    await store.setItem(
      MIGRATIONS_DECISIONS_KEY,
      JSON.stringify({a: 'declined', b: 'done'}),
    );
    const pending = await findPendingMigrations(store, '0.73.0', [
      migration('a', '0.73.0'),
      migration('b', '0.73.0'),
    ]);
    expect(pending).toEqual([]);
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBe('0.73.0');
  });

  it('treats a failing check as not known yet', async () => {
    const store = createMemoryStore();
    const broken = {
      ...migration('a', '0.73.0'),
      isNeeded: async () => {
        throw new Error('no files');
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await findPendingMigrations(store, '0.73.0', [broken])).toEqual([]);
    warn.mockRestore();
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBeNull();
  });
});

describe('recordMigrationDecisions', () => {
  it('keeps the choices and settles the version', async () => {
    const store = createMemoryStore();
    const all = [migration('a', '0.73.0'), migration('b', '0.73.0')];
    await recordMigrationDecisions(
      store,
      '0.73.0',
      {a: 'done', b: 'declined'},
      all,
    );
    expect(
      JSON.parse((await store.getItem(MIGRATIONS_DECISIONS_KEY)) ?? '{}'),
    ).toEqual({a: 'done', b: 'declined'});
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBe('0.73.0');
  });

  it('leaves a failed migration to be offered again', async () => {
    const store = createMemoryStore();
    const all = [migration('a', '0.73.0'), migration('b', '0.73.0')];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await recordMigrationDecisions(store, '0.73.0', {a: 'done'}, all);
    warn.mockRestore();
    expect(await store.getItem(MIGRATIONS_VERSION_KEY)).toBeNull();
    const pending = await findPendingMigrations(store, '0.73.0', all);
    expect(pending.map(m => m.id)).toEqual(['b']);
  });
});
