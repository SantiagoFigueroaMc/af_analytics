const DATABASE_PREFIX = "csv_";
const STORE_NAME = "rows";
const METADATA_STORE_NAME = "metadata";
const DATABASE_VERSION = 2;

export function getDatabaseNameFromFileName(fileName) {
    return `${DATABASE_PREFIX}${fileName
        .replace(/\.csv$/i, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_|_$/g, "") || "file"}`;
}

export async function getAvailableDatabases() {
    if (typeof indexedDB.databases !== "function") {
        throw new Error("This browser does not support listing IndexedDB databases");
    }

    const databases = await indexedDB.databases();
    const databaseNames = databases
        .map(({ name }) => name)
        .filter((name) => name?.startsWith(DATABASE_PREFIX))
        .sort();

    return Promise.all(databaseNames.map(async (name) => ({
        name,
        createdAt: await getDatabaseCreatedAt(name),
    })));
}

export function openDatabase(databaseName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, DATABASE_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
                const metadataStore = database.createObjectStore(METADATA_STORE_NAME, {
                    keyPath: "key",
                });
                metadataStore.put({
                    key: "createdAt",
                    value: new Date().toISOString(),
                });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getDatabaseCreatedAt(databaseName) {
    const database = await openDatabase(databaseName);

    try {
        return await new Promise((resolve, reject) => {
            const request = database
                .transaction(METADATA_STORE_NAME, "readonly")
                .objectStore(METADATA_STORE_NAME)
                .get("createdAt");
            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    } finally {
        database.close();
    }
}

export function deleteDatabase(databaseName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("La base de datos está siendo utilizada"));
    });
}

export async function renameDatabase(databaseName, newLabel) {
    const targetName = getDatabaseNameFromFileName(
        newLabel.toLowerCase().endsWith(".csv") ? newLabel : `${newLabel}.csv`,
    );

    if (targetName === databaseName) {
        return targetName;
    }

    const existingNames = (await indexedDB.databases()).map(({ name }) => name);
    if (existingNames.includes(targetName)) {
        throw new Error("Ya existe un archivo con ese nombre");
    }

    const rows = await loadDatabase(databaseName);
    const createdAt = await getDatabaseCreatedAt(databaseName);

    const target = await openDatabase(targetName);
    try {
        await saveRows(target, rows);
        await new Promise((resolve, reject) => {
            const transaction = target.transaction(METADATA_STORE_NAME, "readwrite");
            transaction.objectStore(METADATA_STORE_NAME).put({
                key: "createdAt",
                value: createdAt || new Date().toISOString(),
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        target.close();
    }

    await deleteDatabase(databaseName);
    return targetName;
}

export function loadDatabase(databaseName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);

        request.onsuccess = () => {
            const database = request.result;
            let rowsRequest;

            try {
                rowsRequest = database
                    .transaction(STORE_NAME, "readonly")
                    .objectStore(STORE_NAME)
                    .getAll();
            } catch (error) {
                database.close();
                reject(error);
                return;
            }

            rowsRequest.onsuccess = () => {
                database.close();
                resolve(rowsRequest.result.map(({ data }) => data));
            };
            rowsRequest.onerror = () => {
                database.close();
                reject(rowsRequest.error);
            };
        };
        request.onerror = () => reject(request.error);
    });
}

export function saveRows(database, rows) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        store.clear();
        rows.forEach((data, id) => store.put({ id, data }));

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}
