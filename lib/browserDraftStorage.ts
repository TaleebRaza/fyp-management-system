import { isRecord } from './security/input';

const PORTAL_DRAFT_PREFIX = 'fyp-portal:';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FILE_DATABASE_NAME = 'fyp-portal-browser-drafts';
const FILE_DATABASE_VERSION = 1;
const FILE_STORE_NAME = 'draft-files';

type StoredDraft<T> = {
  version: number;
  savedAt: number;
  data: T;
};

type StoredFileDraft = {
  key: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  savedAt: number;
};

export function isBrowserDraftExpired(savedAt: unknown, now = Date.now()) {
  return !Number.isFinite(savedAt) || now - Number(savedAt) > DRAFT_MAX_AGE_MS;
}

function parseStoredDraft<T>(raw: string): StoredDraft<T> | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.version !== DRAFT_VERSION || isBrowserDraftExpired(parsed.savedAt) || !('data' in parsed)) {
    return null;
  }

  return {
    version: DRAFT_VERSION,
    savedAt: Number(parsed.savedAt),
    data: parsed.data as T,
  };
}

export function readBrowserDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const draft = parseStoredDraft<T>(raw);
    if (!draft) {
      window.localStorage.removeItem(key);
      return null;
    }

    return draft.data;
  } catch {
    return null;
  }
}

export function writeBrowserDraft<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), data })
    );
  } catch {
    // Storage can be unavailable or full. The in-memory form remains usable.
  }
}

export function clearBrowserDraft(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing useful can be recovered from an unavailable browser store.
  }
}

function openFileDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(FILE_DATABASE_NAME, FILE_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
        database.createObjectStore(FILE_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open browser file storage.'));
  });
}

export async function cleanupBrowserDrafts(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(PORTAL_DRAFT_PREFIX)));
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw || !parseStoredDraft(raw)) window.localStorage.removeItem(key);
    }
  } catch {
    // A denied storage area should not block the dashboard.
  }

  const database = await openFileDatabase();
  if (!database) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
      const request = transaction.objectStore(FILE_STORE_NAME).openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;

        const record = cursor.value as StoredFileDraft;
        if (
          typeof record.key !== 'string' ||
          (record.key.startsWith(PORTAL_DRAFT_PREFIX) && isBrowserDraftExpired(record.savedAt))
        ) {
          cursor.delete();
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to remove expired browser drafts.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser draft cleanup was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export async function writeBrowserFileDraft(key: string, file: File): Promise<void> {
  const database = await openFileDatabase();
  if (!database) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
      transaction.objectStore(FILE_STORE_NAME).put({
        key,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        blob: file,
        savedAt: Date.now(),
      } satisfies StoredFileDraft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to save selected file.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser file save was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export async function readBrowserFileDraft(key: string): Promise<File | null> {
  const database = await openFileDatabase();
  if (!database) return null;

  let result: StoredFileDraft | null = null;
  try {
    result = await new Promise<StoredFileDraft | null>((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(FILE_STORE_NAME).get(key);

      request.onsuccess = () => resolve((request.result as StoredFileDraft | undefined) || null);
      request.onerror = () => reject(request.error || new Error('Unable to restore selected file.'));
    });
  } finally {
    database.close();
  }

  if (!result?.blob || isBrowserDraftExpired(result.savedAt)) {
    if (result) await clearBrowserFileDraft(key);
    return null;
  }
  return new File([result.blob], result.name, {
    type: result.type || result.blob.type,
    lastModified: result.lastModified || Date.now(),
  });
}

export async function clearBrowserFileDraft(key: string): Promise<void> {
  const database = await openFileDatabase();
  if (!database) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
      transaction.objectStore(FILE_STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to clear selected file.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser file clear was cancelled.'));
    });
  } finally {
    database.close();
  }
}
