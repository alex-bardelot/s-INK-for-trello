import {
  createDirectoryStore,
  DirectoryFileSystem,
  encodeName,
} from '../src/storage/directoryStore';

const ROOT = '/plugin/state';

/** In-memory directory tree; `listFiles` returns full paths like the SDK. */
function makeFileSystem() {
  const dirs = new Set<string>();
  const fs: DirectoryFileSystem = {
    makeDir: jest.fn(async (path: string) => {
      if (dirs.has(path)) {
        return false;
      }
      dirs.add(path);
      return true;
    }),
    listFiles: jest.fn(async (path: string) => {
      if (!dirs.has(path)) {
        return null;
      }
      return [...dirs].filter(
        dir =>
          dir.startsWith(`${path}/`) &&
          !dir.slice(path.length + 1).includes('/'),
      );
    }),
    deleteDir: jest.fn(async (path: string) => dirs.delete(path)),
  };
  return {fs, dirs};
}

describe('encodeName', () => {
  it('only produces file-name-safe characters', () => {
    const encoded = encodeName('a.b~c/d e:"é"*!');
    expect(encoded).toMatch(/^[A-Za-z0-9_%-]+$/);
    expect(decodeURIComponent(encoded)).toBe('a.b~c/d e:"é"*!');
  });
});

describe('createDirectoryStore', () => {
  it('stores, reads back and removes a value', async () => {
    const {fs, dirs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs);

    expect(await store.getItem('token')).toBeNull();
    await store.setItem('token', 'ATTA1234');
    expect(await store.getItem('token')).toBe('ATTA1234');
    expect(dirs.has(`${ROOT}/token~000~ATTA1234`)).toBe(true);

    await store.removeItem('token');
    expect(await store.getItem('token')).toBeNull();
  });

  it('replaces a previous value and keeps keys apart', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs);
    await store.setItem('a', 'first');
    await store.setItem('ab', 'other');
    await store.setItem('a', 'second');
    expect(await store.getItem('a')).toBe('second');
    expect(await store.getItem('ab')).toBe('other');
  });

  it('splits long values into several entries', async () => {
    const {fs, dirs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs);
    const value = JSON.stringify({
      lastListByBoard: Object.fromEntries(
        Array.from({length: 20}, (_, i) => [`board${i}`, `list${i}`]),
      ),
    });
    await store.setItem('prefs', value);
    expect([...dirs].filter(d => d.includes('/prefs~')).length).toBeGreaterThan(
      1,
    );
    expect(await store.getItem('prefs')).toBe(value);

    await store.setItem('prefs', 'short');
    expect([...dirs].filter(d => d.includes('/prefs~'))).toHaveLength(1);
    expect(await store.getItem('prefs')).toBe('short');
  });

  it('stores empty strings', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs);
    await store.setItem('empty', '');
    expect(await store.getItem('empty')).toBe('');
  });

  it('fails when the plugin directory is unknown', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => null, fs);
    await expect(store.setItem('token', 'x')).rejects.toThrow();
  });

  it('fails when an entry cannot be created', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, {
      ...fs,
      makeDir: async path => path === ROOT,
    });
    await expect(store.setItem('token', 'x')).rejects.toThrow();
  });
});

describe('createDirectoryStore permissions', () => {
  it('asks for write access only when something is written', async () => {
    const {fs} = makeFileSystem();
    const ensureWritable = jest.fn(async () => true);
    const store = createDirectoryStore(async () => ROOT, fs, ensureWritable);

    await store.getItem('token');
    await store.removeItem('token');
    expect(ensureWritable).not.toHaveBeenCalled();

    await store.setItem('token', 'x');
    expect(ensureWritable).toHaveBeenCalled();
  });

  it('fails without writing when access is refused', async () => {
    const {fs, dirs} = makeFileSystem();
    const store = createDirectoryStore(
      async () => ROOT,
      fs,
      async () => false,
    );
    await expect(store.setItem('token', 'x')).rejects.toThrow();
    expect(dirs.size).toBe(0);
  });
});
