/**
 * Isolated storage shims backed by localStorage (all access wrapped in try/catch: private
 * mode / blocked storage degrade to an in-memory store for the session).
 *
 * IsolatedStorageSettings.applicationSettings  (WP7 IsolatedStorageSettings.ApplicationSettings)
 *   .get(key) / .set(key, value) / .contains(key) / .remove(key) / .tryGetValue(key)
 *   .keys / .count / .clear() / .save()
 *   Values are JSON-serialized: only plain data survives (class instances come back as plain
 *   objects; re-hydrate them yourself).
 *
 * IsolatedStorageFile.getUserStoreForApplication()  (text files; replaces
 *   IsolatedStorageFileStream + StreamReader/StreamWriter/XmlSerializer)
 *   .fileExists(path) / .readAllText(path) / .writeAllText(path, text) / .deleteFile(path)
 *   .getFileNames()
 */
const SETTINGS_KEY = 'continuum:settings';
const FILE_PREFIX = 'continuum:file:';

const memory = new Map<string, string>();

function lsGet(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* ignore */
  }
  return memory.has(key) ? memory.get(key)! : null;
}
function lsSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function lsRemove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
function lsKeys(): string[] {
  const keys = new Set<string>(memory.keys());
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k !== null) keys.add(k);
    }
  } catch {
    /* ignore */
  }
  return [...keys];
}

export class IsolatedStorageSettings {
  private data: Record<string, unknown>;

  private constructor() {
    this.data = {};
    const raw = lsGet(SETTINGS_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') this.data = parsed as Record<string, unknown>;
      } catch {
        /* corrupted -> start empty */
      }
    }
  }

  private static instance: IsolatedStorageSettings | null = null;
  static get applicationSettings(): IsolatedStorageSettings {
    return (IsolatedStorageSettings.instance ??= new IsolatedStorageSettings());
  }

  get count(): number {
    return Object.keys(this.data).length;
  }
  get keys(): string[] {
    return Object.keys(this.data);
  }
  contains(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }
  /** C# settings[key] getter. Throws like KeyNotFoundException when missing. */
  get<T>(key: string): T {
    if (!this.contains(key)) throw new Error(`KeyNotFoundException: ${key}`);
    return this.data[key] as T;
  }
  /** C# settings[key] = value. Persisted immediately (WP7 persisted on Save()/exit). */
  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.save();
  }
  /** C# Add(key, value): throws if the key already exists. */
  add(key: string, value: unknown): void {
    if (this.contains(key)) throw new Error(`ArgumentException: key exists: ${key}`);
    this.set(key, value);
  }
  /** C# TryGetValue(key, out value) -> returns value or undefined. */
  tryGetValue<T>(key: string): T | undefined {
    return this.contains(key) ? (this.data[key] as T) : undefined;
  }
  remove(key: string): boolean {
    if (!this.contains(key)) return false;
    delete this.data[key];
    this.save();
    return true;
  }
  clear(): void {
    this.data = {};
    this.save();
  }
  save(): void {
    try {
      lsSet(SETTINGS_KEY, JSON.stringify(this.data));
    } catch {
      /* non-serializable value; ignore */
    }
  }
}

export class IsolatedStorageFile {
  private static store: IsolatedStorageFile | null = null;
  static getUserStoreForApplication(): IsolatedStorageFile {
    return (IsolatedStorageFile.store ??= new IsolatedStorageFile());
  }
  private key(path: string): string {
    return FILE_PREFIX + path.replace(/\\/g, '/').toLowerCase();
  }
  fileExists(path: string): boolean {
    return lsGet(this.key(path)) !== null;
  }
  /** Returns the file text, or throws (like FileNotFound / IsolatedStorageException). */
  readAllText(path: string): string {
    const v = lsGet(this.key(path));
    if (v === null) throw new Error(`IsolatedStorageException: file not found: ${path}`);
    return v;
  }
  writeAllText(path: string, text: string): void {
    lsSet(this.key(path), text);
  }
  deleteFile(path: string): void {
    lsRemove(this.key(path));
  }
  getFileNames(): string[] {
    return lsKeys()
      .filter((k) => k.startsWith(FILE_PREFIX))
      .map((k) => k.slice(FILE_PREFIX.length));
  }
  /** C# `using` compatibility: no-op. */
  dispose(): void {}
}
