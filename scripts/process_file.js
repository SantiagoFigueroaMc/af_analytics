const DATABASE_PREFIX = "csv_";
const STORE_NAME = "rows";

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

function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const nextCharacter = text[index + 1];

        if (character === '"') {
            if (quoted && nextCharacter === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(value);
            value = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && nextCharacter === "\n") {
                index += 1;
            }
            row.push(value);
            rows.push(row);
            row = [];
            value = "";
        } else {
            value += character;
        }
    }

    if (quoted) {
        throw new Error("CSV contains an unterminated quoted field");
    }

    if (value || row.length > 0) {
        row.push(value);
        rows.push(row);
    }

    return rows;
}

function createHeaders(headerRow) {
    const usedHeaders = new Map();

    return headerRow.map((header, index) => {
        const baseHeader = header.trim() || `column_${index + 1}`;
        const count = usedHeaders.get(baseHeader) || 0;
        usedHeaders.set(baseHeader, count + 1);
        return count === 0 ? baseHeader : `${baseHeader}_${count + 1}`;
    });
}

function openDatabase(databaseName) {
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

function saveRows(database, rows) {
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

export async function processCSV(file) {
    if (!(file instanceof File)) {
        throw new Error("processCSV received an invalid file");
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Only CSV files are supported");
    }

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const parsedRows = parseCSV(text);
    const headers = createHeaders(parsedRows.shift() || []);
    const rows = parsedRows
        .filter((row) => row.some((value) => value.trim() !== ""))
        .map((row) => Object.fromEntries(
            headers.map((header, index) => [header, row[index] || ""]),
        ));
    const databaseName = `${DATABASE_PREFIX}${file.name
        .replace(/\.csv$/i, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_|_$/g, "") || "file"}`;
    const database = await openDatabase(databaseName);

    try {
        await saveRows(database, rows);
    } finally {
        database.close();
    }

    return {
        ok: true,
        message: "file parsed",
        fileName: file.name,
        databaseName,
        rowCount: rows.length,
        rows,
    };
}