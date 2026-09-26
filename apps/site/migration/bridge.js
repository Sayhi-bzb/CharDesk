(() => {
  const CANVAS_ORIGIN = 'https://canvas.chardesk.com';
  const allowedDatabase = (name) =>
    name === 'chardesk-canvas-catalog' ||
    name === 'chardesk-blackboard-workspaces' ||
    name.startsWith('chardesk-local-document-v1:') ||
    /^chardesk-room-v\d+:/u.test(name);
  const allowedKey = (key) =>
    (key.startsWith('chardesk-') || key.startsWith('ascii-canvas-')) &&
    !key.includes('lease') &&
    key !== 'chardesk-origin-migration-v1';
  const request = (operation) =>
    new Promise((resolve, reject) => {
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    });

  async function snapshotDatabase(name) {
    const database = await request(indexedDB.open(name));
    try {
      const stores = [];
      for (const storeName of database.objectStoreNames) {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const keyPath =
          store.keyPath === null
            ? null
            : typeof store.keyPath === 'string'
              ? store.keyPath
              : Array.from(store.keyPath);
        const indexes = Array.from(store.indexNames, (indexName) => {
          const index = store.index(indexName);
          return {
            name: indexName,
            keyPath: typeof index.keyPath === 'string' ? index.keyPath : Array.from(index.keyPath),
            unique: index.unique,
            multiEntry: index.multiEntry,
          };
        });
        const records = [];
        await new Promise((resolve, reject) => {
          const cursor = store.openCursor();
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            if (!cursor.result) {
              resolve();
              return;
            }
            records.push({ key: cursor.result.primaryKey, value: cursor.result.value });
            cursor.result.continue();
          };
          transaction.onabort = () => reject(transaction.error);
        });
        stores.push({
          name: storeName,
          keyPath,
          autoIncrement: store.autoIncrement,
          indexes,
          records,
        });
      }
      return { name, version: database.version, stores };
    } finally {
      database.close();
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== CANVAS_ORIGIN ||
      (event.source !== window.parent && event.source !== window.opener)) return;
    if (event.data?.type !== 'chardesk-migration-request' || typeof event.data.token !== 'string')
      return;
    const token = event.data.token;
    try {
      if (window !== window.top && typeof document.hasStorageAccess === 'function' &&
        !(await document.hasStorageAccess())) {
        throw new Error('This browser requires a transfer tab to access your old workspace');
      }
      if (typeof indexedDB.databases !== 'function')
        throw new Error('Database discovery is unavailable in this browser');
      const names = (await indexedDB.databases())
        .map(({ name }) => name)
        .filter((name) => typeof name === 'string' && allowedDatabase(name));
      const databases = [];
      for (const name of names) databases.push(await snapshotDatabase(name));
      const storage = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && allowedKey(key)) storage.push([key, localStorage.getItem(key)]);
      }
      event.source.postMessage(
        { type: 'chardesk-migration-snapshot', token, databases, storage },
        CANVAS_ORIGIN
      );
    } catch (error) {
      event.source.postMessage(
        {
          type: 'chardesk-migration-error',
          token,
          message: error instanceof Error ? error.message : 'Unable to read old workspace',
        },
        CANVAS_ORIGIN
      );
    }
  });
  if (window.opener) {
    window.opener.postMessage({ type: 'chardesk-migration-ready' }, CANVAS_ORIGIN);
  }
})();
