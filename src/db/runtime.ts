/**
 * Browser runtime for the sql.js database (spec §3 "browser preview" driver).
 * The whole SQLite database is serialized to bytes and stored in IndexedDB, so
 * data survives a reload / app restart (§81). Production (Tauri) will instead
 * persist to a real file via tauri-plugin-sql; the rest of the app is unchanged.
 */
import { createSqlJsDatabase, type SqlJsHandle, type AppDatabase } from './drivers/sqljs';

const IDB_NAME = 'progress-db';
const STORE = 'kv';
const KEY = 'sqlite-bytes';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const db = await openIdb();
  try {
    return await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: Uint8Array): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

let handle: SqlJsHandle | null = null;
let initPromise: Promise<SqlJsHandle> | null = null;

/** Open the database once, restoring previously saved bytes if any. */
export function initRuntime(): Promise<SqlJsHandle> {
  if (!initPromise) {
    initPromise = (async () => {
      // A failed read must never silently become a new, empty database.
      const bytes = await idbGet(KEY);
      handle = await createSqlJsDatabase(bytes);
      return handle;
    })();
  }
  return initPromise;
}

export function getDb(): AppDatabase {
  if (!handle) throw new Error('Database not initialized — call initRuntime() first.');
  return handle.db;
}

/** Serialize and persist the database to IndexedDB (spec §57 autosave). */
export async function save(): Promise<void> {
  if (!handle) return;
  await idbSet(KEY, handle.export());
}

/** Called only after isolated validation and a user-requested safety backup. */
export async function replaceStoredDatabase(bytes: Uint8Array): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const previous = store.get(KEY);
      previous.onsuccess = () => {
        if (previous.result) store.put(previous.result, 'restore-safety-bytes');
        store.put(bytes, KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Restore aborted'));
    });
  } finally {
    db.close();
  }
}

export function readSafetyBackup(): Promise<Uint8Array | undefined> {
  return idbGet('restore-safety-bytes');
}
