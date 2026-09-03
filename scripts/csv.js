import {
    getDatabaseNameFromFileName,
    openDatabase,
    saveRows,
} from "./database.js";

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

async function parseCSVAsync(text, onProgress = () => {}) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    const chunkSize = 100_000;

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

        if (index > 0 && index % chunkSize === 0) {
            onProgress(Math.round((index / text.length) * 100));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (quoted) {
        throw new Error("CSV contains an unterminated quoted field");
    }

    if (value || row.length > 0) {
        row.push(value);
        rows.push(row);
    }
    onProgress(100);
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

export async function processCSV(file, { onProgress = () => {} } = {}) {
    if (!(file instanceof File)) {
        throw new Error("processCSV received an invalid file");
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Only CSV files are supported");
    }

    onProgress("Leyendo archivo...");
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const parsedRows = await parseCSVAsync(text, (progress) => (
        onProgress(`Procesando archivo... ${progress}%`)
    ));
    const headers = createHeaders(parsedRows.shift() || []);
    const rows = [];
    for (let index = 0; index < parsedRows.length; index += 1) {
        const row = parsedRows[index];
        if (row.some((value) => value.trim() !== "")) {
            rows.push(Object.fromEntries(
                headers.map((header, columnIndex) => [header, row[columnIndex] || ""]),
            ));
        }
        if (index > 0 && index % 2_000 === 0) {
            onProgress(`Preparando datos... ${Math.round((index / parsedRows.length) * 100)}%`);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    const databaseName = getDatabaseNameFromFileName(file.name);
    const database = await openDatabase(databaseName);

    try {
        onProgress("Guardando archivo...");
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

export { createHeaders, parseCSV };
