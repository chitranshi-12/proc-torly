/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IndexedDB Offline Queue Manager
 * Persists violation logs and captured screenshots during network disconnects,
 * and automatically drains and syncs to Firebase once connectivity is restored.
 */

const DB_NAME = 'omni_proctor_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'queued_violations';

export interface QueuedViolationItem {
  id: string;
  sessionId: string;
  examId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  type: string;
  severity: string;
  details: string;
  timestamp: string;
  screenBase64?: string;
  webcamBase64?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueViolationOffline(item: QueuedViolationItem): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('📦 Violation queued to IndexedDB for offline sync:', item.type);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to write to IndexedDB:', err);
  }
}

export async function getQueuedViolations(): Promise<QueuedViolationItem[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return [];
  }
}

export async function removeQueuedViolation(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to delete from IndexedDB:', err);
  }
}
