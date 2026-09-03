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

function createHeaders(headerRow) {
    const usedHeaders = new Map();

    return headerRow.map((header, index) => {
        const baseHeader = header.trim() || `column_${index + 1}`;
        const count = usedHeaders.get(baseHeader) || 0;
        usedHeaders.set(baseHeader, count + 1);
        return count === 0 ? baseHeader : `${baseHeader}_${count + 1}`;
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
    const databaseName = getDatabaseNameFromFileName(file.name);
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

export { createHeaders, parseCSV };
