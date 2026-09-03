const DATABASE_PREFIX = "csv_";
const STORE_NAME = "rows";

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
    return databases
        .map(({ name }) => name)
        .filter((name) => name?.startsWith(DATABASE_PREFIX))
        .sort();
}

export function openDatabase(databaseName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
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
