const FILE_DATABASE_NAME = 'fyp-portal-browser-drafts';
const FILE_DATABASE_VERSION = 1;
const FILE_STORE_NAME = 'draft-files';

type StoredFileDraft = {
  key: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  savedAt: number;
};

export function readBrowserDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { version?: number; data?: T } | T;
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return (parsed as { data?: T }).data ?? null;
    }

    return parsed as T;
  } catch (error) {
    console.warn(`Unable to read browser draft for ${key}:`, error);
    return null;
  }
}

export function writeBrowserDraft<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        data,
      })
    );
  } catch (error) {
    console.warn(`Unable to save browser draft for ${key}:`, error);
  }
}

export function clearBrowserDraft(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Unable to clear browser draft for ${key}:`, error);
  }
}

function openFileDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

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

export async function writeBrowserFileDraft(key: string, file: File): Promise<void> {
  const database = await openFileDatabase();
  if (!database) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(FILE_STORE_NAME);
    const record: StoredFileDraft = {
      key,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
      savedAt: Date.now(),
    };

    store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Unable to save selected file.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser file save was cancelled.'));
  });

  database.close();
}

export async function readBrowserFileDraft(key: string): Promise<File | null> {
  const database = await openFileDatabase();
  if (!database) return null;

  const result = await new Promise<StoredFileDraft | null>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(FILE_STORE_NAME).get(key);

    request.onsuccess = () => resolve((request.result as StoredFileDraft | undefined) || null);
    request.onerror = () => reject(request.error || new Error('Unable to restore selected file.'));
  });

  database.close();

  if (!result?.blob) return null;
  return new File([result.blob], result.name, {
    type: result.type || result.blob.type,
    lastModified: result.lastModified || Date.now(),
  });
}

export async function clearBrowserFileDraft(key: string): Promise<void> {
  const database = await openFileDatabase();
  if (!database) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
    transaction.objectStore(FILE_STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Unable to clear selected file.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser file clear was cancelled.'));
  });

  database.close();
}
