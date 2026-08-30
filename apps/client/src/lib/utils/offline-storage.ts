export interface OfflinePendingFile {
  type: "file";
  mediaType: string;
  filename: string;
  url: string;
}

export function savePendingFiles(files: OfflinePendingFile[]): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  try {
    const request = indexedDB.open("OpenDiagramOffline", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("pending", "readwrite");
      const store = tx.objectStore("pending");
      const putReq = store.put(files, "files");
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    request.onerror = () => reject(request.error);
  } catch (err) {
    reject(err);
  }
  return promise;
}

export function getPendingFiles(): Promise<OfflinePendingFile[] | null> {
  const { promise, resolve, reject } = Promise.withResolvers<OfflinePendingFile[] | null>();
  try {
    const request = indexedDB.open("OpenDiagramOffline", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("pending", "readonly");
      const store = tx.objectStore("pending");
      const getReq = store.get("files");
      getReq.onsuccess = () => {
        const result = getReq.result as OfflinePendingFile[] | undefined;
        resolve(result || null);
      };
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  } catch (err) {
    reject(err);
  }
  return promise;
}

export function clearPendingFiles(): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  try {
    const request = indexedDB.open("OpenDiagramOffline", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("pending", "readwrite");
      const store = tx.objectStore("pending");
      const delReq = store.delete("files");
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    };
    request.onerror = () => reject(request.error);
  } catch (err) {
    reject(err);
  }
  return promise;
}
