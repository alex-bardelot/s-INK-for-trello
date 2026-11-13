import {KeyValueStore} from './keyValueStore';

/**
 * File operations the store relies on. The Supernote SDK exposes them
 * through `FileUtils`; they are injected to keep the store testable.
 */
export interface DirectoryFileSystem {
  makeDir(dirPath: string): Promise<boolean>;
  /**
   * Entries of a directory, `null` if missing. Typed as strings by the SDK,
   * but the Android host returns `{path, type}` objects: see
   * {@link listedPath}.
   */
  listFiles(
    dirPath: string,
  ): Promise<ReadonlyArray<unknown> | null | undefined>;
  deleteDir(dirPath: string): Promise<boolean>;
  deleteFile?(filePath: string): Promise<boolean>;
  exists?(path: string): Promise<boolean>;
  copyFile?(sourcePath: string, destPath: string): Promise<boolean>;
}

export interface DirectoryStoreOptions {
  /**
   * Called right before something is created or deleted; resolves `false`
   * if writing is not allowed. Reads and no-op removals skip it, so the
   * user is only asked when something is actually written.
   */
  ensureWritable?: () => Promise<boolean>;
  /** Called before listing the directory; resolves `false` if refused. */
  ensureReadable?: () => Promise<boolean>;
  /**
   * Existing file copied to create file entries, used when directory
   * entries cannot be listed back on this host.
   */
  findSeedFile?: () => Promise<string | null>;
}

type EntryKind = 'directory' | 'file';

/** Separates the key, the chunk index and the chunk in an entry name. */
const SEPARATOR = '~';
/** Encoded characters per entry, well below the 255-byte name limit. */
const CHUNK_LENGTH = 180;
const INDEX_DIGITS = 3;

/**
 * Encodes any string into the characters `[A-Za-z0-9_-%]`, which are valid
 * in a file name on every file system and never contain the separator.
 */
export function encodeName(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*.~]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Path of an entry returned by `FileUtils.listFiles`. The SDK typings
 * declare strings, but the Android host resolves `{path, type}` maps (and
 * some firmware returns bare names), so every shape is accepted.
 *
 * @returns The path or name, or `null` for an unknown shape.
 */
export function listedPath(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry;
  }
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    for (const field of ['path', 'filePath', 'name', 'fileName']) {
      if (typeof record[field] === 'string') {
        return record[field] as string;
      }
    }
  }
  return null;
}

function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

interface Entry {
  name: string;
  /** Decoded-key-free part used for diagnostics. */
  key: string;
  index: number;
  chunk: string;
}

function parseName(name: string): Entry | null {
  const first = name.indexOf(SEPARATOR);
  if (first < 0) {
    return null;
  }
  const rest = name.slice(first + 1);
  if (rest.indexOf(SEPARATOR) !== INDEX_DIGITS) {
    return null;
  }
  const index = Number(rest.slice(0, INDEX_DIGITS));
  return Number.isInteger(index)
    ? {
        name,
        key: name.slice(0, first),
        index,
        chunk: rest.slice(INDEX_DIGITS + 1),
      }
    : null;
}

function entryName(encodedKey: string, index: number, chunk: string): string {
  return [encodedKey, String(index).padStart(INDEX_DIGITS, '0'), chunk].join(
    SEPARATOR,
  );
}

function splitChunks(encoded: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < encoded.length; start += CHUNK_LENGTH) {
    chunks.push(encoded.slice(start, start + CHUNK_LENGTH));
  }
  return chunks.length > 0 ? chunks : [''];
}

function decodeEntries(entries: Entry[]): string | null {
  if (entries.length === 0) {
    return null;
  }
  return decodeURIComponent(entries.map(e => e.chunk).join(''));
}

/**
 * Store that keeps each value in the *names* of entries of a directory.
 *
 * Plugins cannot write file contents: the SDK only lets them create, copy,
 * list and delete entries. A value is therefore encoded (see
 * {@link encodeName}), split into chunks and stored as `<key>~<index>~<chunk>`
 * entries under `rootDir`: empty directories, or copies of a seed file when
 * the host does not list directories back. Every write is read back to make
 * sure it can be found again. Values are stored unencrypted.
 *
 * @param getRootDir Resolves the directory holding the entries, or `null`
 *   when it is not available.
 */
export function createDirectoryStore(
  getRootDir: () => Promise<string | null>,
  fs: DirectoryFileSystem,
  options: DirectoryStoreOptions = {},
): KeyValueStore {
  const {
    ensureWritable = async () => true,
    ensureReadable = async () => true,
    findSeedFile,
  } = options;
  let entryKind: EntryKind = 'directory';

  // Operations run one after the other so a read never sees half a write.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  const rootDir = async (): Promise<string> => {
    const dir = await getRootDir();
    if (!dir) {
      throw new Error('getPluginDirPath() returned nothing');
    }
    return dir;
  };

  const checkWritable = async () => {
    if (!(await ensureWritable())) {
      throw new Error('FILE:WRITE / FILE:DELETE permission refused');
    }
  };

  const listAll = async (dir: string): Promise<Entry[]> => {
    if (!(await ensureReadable())) {
      throw new Error('FILE:READ permission refused');
    }
    const paths = (await fs.listFiles(dir)) ?? [];
    return paths
      .map(listedPath)
      .filter((path): path is string => path !== null)
      .map(path => parseName(baseName(path)))
      .filter((entry): entry is Entry => entry !== null);
  };

  const entriesOf = async (dir: string, key: string): Promise<Entry[]> => {
    const encodedKey = encodeName(key);
    return (await listAll(dir))
      .filter(entry => entry.key === encodedKey)
      .sort((a, b) => a.index - b.index);
  };

  const deleteEntry = async (path: string): Promise<boolean> =>
    (await fs.deleteDir(path)) ||
    (fs.deleteFile ? await fs.deleteFile(path) : false);

  const removeNames = async (dir: string, names: string[]) => {
    if (names.length > 0) {
      await checkWritable();
    }
    for (const name of names) {
      if (!(await deleteEntry(`${dir}/${name}`))) {
        throw new Error(`Could not delete ${name.split(SEPARATOR)[0]}`);
      }
    }
  };

  const createEntry = async (
    path: string,
    kind: EntryKind,
    seed: string | null,
  ): Promise<boolean> => {
    if (kind === 'directory') {
      return fs.makeDir(path);
    }
    return seed && fs.copyFile ? fs.copyFile(seed, path) : false;
  };

  /** Writes the entries, then checks they are listed back. */
  const writeAndVerify = async (
    dir: string,
    key: string,
    value: string,
    kind: EntryKind,
  ): Promise<string | null> => {
    const seed = kind === 'file' && findSeedFile ? await findSeedFile() : null;
    if (kind === 'file' && !seed) {
      return 'no seed file to copy';
    }
    const encodedKey = encodeName(key);
    const names = splitChunks(encodeName(value)).map((chunk, index) =>
      entryName(encodedKey, index, chunk),
    );
    const created: string[] = [];
    for (const name of names) {
      if (!(await createEntry(`${dir}/${name}`, kind, seed))) {
        await removeNames(dir, created).catch(() => undefined);
        return `${kind} entry not created`;
      }
      created.push(name);
    }
    let listed: string | null = null;
    try {
      listed = decodeEntries(await entriesOf(dir, key));
    } catch {
      listed = null;
    }
    if (listed === value) {
      return null;
    }
    const visible =
      fs.exists && created.length > 0
        ? await fs.exists(`${dir}/${created[0]}`)
        : undefined;
    // Not listed back: remove what was written by name.
    await removeNames(dir, created).catch(() => undefined);
    return `${kind} entries created but not listed back (exists: ${visible})`;
  };

  return {
    persistent: true,
    backend: 'pluginDirectory',
    getItem: key =>
      serialize(async () => {
        const entries = await entriesOf(await rootDir(), key);
        try {
          return decodeEntries(entries);
        } catch (error) {
          console.warn(`[sINK] Corrupted stored value: ${key}`, error);
          return null;
        }
      }),
    setItem: (key, value) =>
      serialize(async () => {
        const dir = await rootDir();
        await checkWritable();
        // Returns false when the directory already exists: not an error.
        await fs.makeDir(dir);
        if (fs.exists && !(await fs.exists(dir))) {
          throw new Error('The state directory could not be created');
        }
        await removeNames(
          dir,
          (await entriesOf(dir, key)).map(entry => entry.name),
        );

        const kinds: EntryKind[] =
          entryKind === 'file' ? ['file'] : ['directory', 'file'];
        const failures: string[] = [];
        for (const kind of kinds) {
          const failure = await writeAndVerify(dir, key, value, kind);
          if (!failure) {
            entryKind = kind;
            return;
          }
          failures.push(failure);
        }
        throw new Error(failures.join('; '));
      }),
    removeItem: key =>
      serialize(async () => {
        const dir = await rootDir();
        await removeNames(
          dir,
          (await entriesOf(dir, key)).map(entry => entry.name),
        );
      }),
  };
}
