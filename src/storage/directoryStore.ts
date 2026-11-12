import {KeyValueStore} from './keyValueStore';

/**
 * Directory operations the store relies on. The Supernote SDK exposes them
 * through `FileUtils`; they are injected to keep the store testable.
 */
export interface DirectoryFileSystem {
  makeDir(dirPath: string): Promise<boolean>;
  /** Paths (or names) of the entries of a directory, `null` if missing. */
  listFiles(dirPath: string): Promise<Array<string> | null | undefined>;
  deleteDir(dirPath: string): Promise<boolean>;
}

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

function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

interface Entry {
  name: string;
  index: number;
  chunk: string;
}

function parseEntry(name: string, encodedKey: string): Entry | null {
  const prefix = `${encodedKey}${SEPARATOR}`;
  if (!name.startsWith(prefix)) {
    return null;
  }
  const rest = name.slice(prefix.length);
  const separator = rest.indexOf(SEPARATOR);
  if (separator !== INDEX_DIGITS) {
    return null;
  }
  const index = Number(rest.slice(0, separator));
  return Number.isInteger(index)
    ? {name, index, chunk: rest.slice(separator + 1)}
    : null;
}

function splitChunks(encoded: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < encoded.length; start += CHUNK_LENGTH) {
    chunks.push(encoded.slice(start, start + CHUNK_LENGTH));
  }
  return chunks.length > 0 ? chunks : [''];
}

/**
 * Store that keeps each value in the *names* of empty directories.
 *
 * Plugins cannot write files: the SDK only lets them create, list and delete
 * directories. A value is therefore encoded (see {@link encodeName}), split
 * into chunks and stored as `<key>~<index>~<chunk>` directories under
 * `rootDir`. Values are stored unencrypted.
 *
 * @param getRootDir Resolves the directory holding the entries, or `null`
 *   when it is not available.
 */
export function createDirectoryStore(
  getRootDir: () => Promise<string | null>,
  fs: DirectoryFileSystem,
  /**
   * Called right before the first directory is created or deleted; resolves
   * `false` if writing is not allowed. Reads and no-op removals skip it, so
   * the user is only asked when something is actually written.
   */
  ensureWritable: () => Promise<boolean> = async () => true,
): KeyValueStore {
  const checkWritable = async () => {
    if (!(await ensureWritable())) {
      throw new Error('Writing to the plugin directory was not allowed');
    }
  };
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
      throw new Error('The plugin directory is not available');
    }
    return dir;
  };

  const entriesOf = async (dir: string, key: string): Promise<Entry[]> => {
    const encodedKey = encodeName(key);
    const paths = (await fs.listFiles(dir)) ?? [];
    return paths
      .map(path => parseEntry(baseName(path), encodedKey))
      .filter((entry): entry is Entry => entry !== null)
      .sort((a, b) => a.index - b.index);
  };

  const removeEntries = async (dir: string, entries: Entry[]) => {
    if (entries.length > 0) {
      await checkWritable();
    }
    for (const entry of entries) {
      if (!(await fs.deleteDir(`${dir}/${entry.name}`))) {
        throw new Error(`Could not delete ${entry.name}`);
      }
    }
  };

  return {
    persistent: true,
    backend: 'pluginDirectory',
    getItem: key =>
      serialize(async () => {
        const entries = await entriesOf(await rootDir(), key);
        if (entries.length === 0) {
          return null;
        }
        try {
          return decodeURIComponent(entries.map(e => e.chunk).join(''));
        } catch (error) {
          console.warn(`[SuperTrello] Corrupted stored value: ${key}`, error);
          return null;
        }
      }),
    setItem: (key, value) =>
      serialize(async () => {
        const dir = await rootDir();
        await checkWritable();
        // Returns false when the directory already exists: not an error.
        await fs.makeDir(dir);
        await removeEntries(dir, await entriesOf(dir, key));
        const encodedKey = encodeName(key);
        const chunks = splitChunks(encodeName(value));
        for (let index = 0; index < chunks.length; index++) {
          const name = [
            encodedKey,
            String(index).padStart(INDEX_DIGITS, '0'),
            chunks[index],
          ].join(SEPARATOR);
          if (!(await fs.makeDir(`${dir}/${name}`))) {
            throw new Error(`Could not create ${name}`);
          }
        }
      }),
    removeItem: key =>
      serialize(async () => {
        const dir = await rootDir();
        await removeEntries(dir, await entriesOf(dir, key));
      }),
  };
}
