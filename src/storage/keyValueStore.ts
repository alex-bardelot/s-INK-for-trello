import {NativeModules, TurboModuleRegistry} from 'react-native';

/** Asynchronous string key/value store. */
export interface KeyValueStore {
  /** `true` if values survive a restart of the plugin host. */
  readonly persistent: boolean;
  /** Short identifier of the backend, for diagnostics. */
  readonly backend: string;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type Callback<T = void> = (errors?: unknown, result?: T) => void;

/** Legacy bridge API exposed by `@react-native-async-storage/async-storage`. */
interface AsyncStorageNativeModule {
  multiGet(
    keys: string[],
    callback: Callback<Array<[string, string | null]>>,
  ): void;
  multiSet(pairs: Array<[string, string]>, callback: Callback): void;
  multiRemove(keys: string[], callback: Callback): void;
}

/**
 * Names under which the AsyncStorage native module has been registered across
 * versions. The Supernote SDK provides no storage API and plugins cannot ship
 * native code without a custom build, so we only use AsyncStorage if the host
 * application happens to bundle it.
 */
const ASYNC_STORAGE_MODULE_NAMES = [
  'RNCAsyncStorage',
  'RNC_AsyncSQLiteDBStorage',
  'AsyncSQLiteDBStorage',
  'AsyncLocalStorage',
] as const;

function isAsyncStorageModule(
  value: unknown,
): value is AsyncStorageNativeModule {
  const module = value as Partial<AsyncStorageNativeModule> | null | undefined;
  return (
    typeof module?.multiGet === 'function' &&
    typeof module.multiSet === 'function' &&
    typeof module.multiRemove === 'function'
  );
}

function findAsyncStorageModule(): {
  name: string;
  module: AsyncStorageNativeModule;
} | null {
  for (const name of ASYNC_STORAGE_MODULE_NAMES) {
    let candidate: unknown = NativeModules[name];
    if (!candidate) {
      try {
        candidate = TurboModuleRegistry.get(name);
      } catch {
        candidate = null;
      }
    }
    if (isAsyncStorageModule(candidate)) {
      return {name, module: candidate};
    }
  }
  return null;
}

function toError(errors: unknown): Error {
  const first = Array.isArray(errors) ? errors[0] : errors;
  if (first instanceof Error) {
    return first;
  }
  const message = (first as {message?: string} | undefined)?.message;
  return new Error(message ?? String(first));
}

/** Store backed by the host's AsyncStorage native module. */
export function createNativeStore(
  name: string,
  module: AsyncStorageNativeModule,
): KeyValueStore {
  return {
    persistent: true,
    backend: name,
    getItem: key =>
      new Promise((resolve, reject) =>
        module.multiGet([key], (errors, result) =>
          errors ? reject(toError(errors)) : resolve(result?.[0]?.[1] ?? null),
        ),
      ),
    setItem: (key, value) =>
      new Promise((resolve, reject) =>
        module.multiSet([[key, value]], errors =>
          errors ? reject(toError(errors)) : resolve(),
        ),
      ),
    removeItem: key =>
      new Promise((resolve, reject) =>
        module.multiRemove([key], errors =>
          errors ? reject(toError(errors)) : resolve(),
        ),
      ),
  };
}

/**
 * Store kept in the JavaScript context. Values survive closing and reopening
 * the plugin view, but not a restart of the plugin host (e.g. a reboot).
 */
export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    persistent: false,
    backend: 'memory',
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async key => {
      values.delete(key);
    },
  };
}

let defaultStore: KeyValueStore | null = null;

/** Returns the best store available on this device (created once). */
export function getDefaultStore(): KeyValueStore {
  if (!defaultStore) {
    const found = findAsyncStorageModule();
    defaultStore = found
      ? createNativeStore(found.name, found.module)
      : createMemoryStore();
    console.info(
      `[SuperTrello] Storage backend: ${defaultStore.backend} (persistent: ${defaultStore.persistent})`,
    );
  }
  return defaultStore;
}
