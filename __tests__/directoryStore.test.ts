import {
  createDirectoryStore,
  DirectoryFileSystem,
  encodeName,
  listedPath,
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
    const store = createDirectoryStore(async () => ROOT, fs, {ensureWritable});

    await store.getItem('token');
    await store.removeItem('token');
    expect(ensureWritable).not.toHaveBeenCalled();

    await store.setItem('token', 'x');
    expect(ensureWritable).toHaveBeenCalled();
  });

  it('fails without writing when access is refused', async () => {
    const {fs, dirs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs, {
      ensureWritable: async () => false,
    });
    await expect(store.setItem('token', 'x')).rejects.toThrow();
    expect(dirs.size).toBe(0);
  });

  it('fails to read when read access is refused', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs, {
      ensureReadable: async () => false,
    });
    await expect(store.getItem('token')).rejects.toThrow('FILE:READ');
  });
});

describe('listFiles result shapes', () => {
  it('accepts strings and the {path, type} maps of the Android host', () => {
    expect(listedPath('/a/b')).toBe('/a/b');
    expect(listedPath({path: '/a/b', type: 'dir'})).toBe('/a/b');
    expect(listedPath({name: 'b'})).toBe('b');
    expect(listedPath({type: 'dir'})).toBeNull();
    expect(listedPath(null)).toBeNull();
  });

  it('stores and reads back when listFiles returns {path, type} maps', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, {
      ...fs,
      listFiles: async path =>
        ((await fs.listFiles(path)) ?? []).map(p => ({path: p, type: 1})),
    });
    await store.setItem('token', 'ATTA1234');
    expect(await store.getItem('token')).toBe('ATTA1234');
    await store.removeItem('token');
    expect(await store.getItem('token')).toBeNull();
  });
});

describe('createDirectoryStore on hosts that do not list directories', () => {
  /** Like the SDK if `listFiles` only returned files, not directories. */
  function makeFilesOnlySystem() {
    const dirs = new Set<string>([ROOT]);
    const files = new Set<string>(['/plugin/PluginConfig.json']);
    const fs: DirectoryFileSystem = {
      makeDir: async path => !dirs.has(path) && !!dirs.add(path),
      listFiles: async path =>
        [...files].filter(
          f =>
            f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes('/'),
        ),
      deleteDir: async path => dirs.delete(path),
      deleteFile: async path => files.delete(path),
      exists: async path => dirs.has(path) || files.has(path),
      copyFile: async (source, dest) =>
        files.has(source) && !files.has(dest) && !!files.add(dest),
    };
    return {fs, dirs, files};
  }

  it('falls back to copies of a seed file and reads them back', async () => {
    const {fs, dirs, files} = makeFilesOnlySystem();
    const store = createDirectoryStore(async () => ROOT, fs, {
      findSeedFile: async () => '/plugin/PluginConfig.json',
    });
    await store.setItem('token', 'ATTA1234');
    expect(await store.getItem('token')).toBe('ATTA1234');
    expect(files.has(`${ROOT}/token~000~ATTA1234`)).toBe(true);
    // The unlisted directory entries were cleaned up.
    expect([...dirs].filter(d => d.includes('~'))).toHaveLength(0);

    await store.removeItem('token');
    expect(await store.getItem('token')).toBeNull();
    expect(store.diagnose && (await store.diagnose()).entryKind).toBe('file');
  });

  it('reports why saving failed when nothing can be listed back', async () => {
    const {fs} = makeFilesOnlySystem();
    const store = createDirectoryStore(async () => ROOT, fs);
    await expect(store.setItem('token', 'x')).rejects.toThrow(
      /not listed back.*no seed file/,
    );
    expect((await store.diagnose()).lastError).toMatch(/not listed back/);
  });

  it('masks stored values in diagnostics', async () => {
    const {fs} = makeFileSystem();
    const store = createDirectoryStore(async () => ROOT, fs);
    await store.setItem('supertrello.trello.token', 'SECRET');
    const diagnostics = await store.diagnose();
    expect(diagnostics.entries).toEqual([
      'supertrello.trello.token#0 (6 chars)',
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('SECRET');
  });
});
