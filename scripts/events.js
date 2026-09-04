import { loadDatabase } from "./database.js";

const PAGE_SIZE = 50;

let eventRows = [];
let eventHeaders = [];
let currentPage = 0;

function showMessage(tableElement, message, columnCount = 1) {
    const row = tableElement.insertRow();
    const cell = row.insertCell();
    cell.colSpan = columnCount;
    cell.textContent = message;
}

function getEventHeader(rows) {
    const exactHeader = rows.flatMap((row) => Object.keys(row))
        .find((header) => header === "Event Value");
    if (exactHeader) {
        return exactHeader;
    }

    return rows.flatMap((row) => Object.keys(row))
        .find((header) => header.toLowerCase() === "event value");
}

function parseEventValues(rows, eventHeader) {
    const validRows = [];
    const invalidRows = [];

    rows.forEach((row, index) => {
        const rawValue = String(row[eventHeader] ?? "").trim();
        if (!rawValue) {
            invalidRows.push(index + 1);
            return;
        }

        let parsedValue;
        try {
            parsedValue = JSON.parse(rawValue);
        } catch {
            invalidRows.push(index + 1);
            return;
        }

        if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
            invalidRows.push(index + 1);
            return;
        }

        validRows.push(parsedValue);
    });

    return { validRows, invalidRows };
}

function getEventHeaders(rows) {
    return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function formatCellValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderPage(tableElement) {
    const body = tableElement.tBodies[0] || tableElement.createTBody();
    body.replaceChildren();

    const start = currentPage * PAGE_SIZE;
    eventRows.slice(start, start + PAGE_SIZE).forEach((eventRow) => {
        const row = body.insertRow();
        eventHeaders.forEach((header) => {
            row.insertCell().textContent = formatCellValue(eventRow[header]);
        });
    });
}

function renderPagination(tableElement) {
    document.querySelector(".events-pagination")?.remove();
    const totalPages = Math.ceil(eventRows.length / PAGE_SIZE);
    if (totalPages <= 1) {
        return;
    }

    const controls = document.createElement("div");
    controls.className = "table-pagination events-pagination";

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.textContent = "Previous";
    previousButton.disabled = currentPage === 0;
    previousButton.addEventListener("click", () => {
        currentPage -= 1;
        renderPage(tableElement);
        renderPagination(tableElement);
    });

    const pageStatus = document.createElement("span");
    pageStatus.textContent = `Page ${currentPage + 1} of ${totalPages}`;

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = "Next";
    nextButton.disabled = currentPage === totalPages - 1;
    nextButton.addEventListener("click", () => {
        currentPage += 1;
        renderPage(tableElement);
        renderPagination(tableElement);
    });

    controls.append(previousButton, pageStatus, nextButton);
    tableElement.after(controls);
}

export async function loadDataToEvents(indexedDbName, { onStatus = () => {} } = {}) {
    const tableElement = document.querySelector("table#events-table");

    if (!tableElement) {
        throw new Error("Events table element was not found");
    }
    if (!indexedDbName) {
        throw new Error("A database name is required");
    }

    tableElement.replaceChildren();
    document.querySelector(".events-pagination")?.remove();
    document.querySelector(".events-warning")?.remove();
    onStatus("Leyendo eventos...");

    const rows = await loadDatabase(indexedDbName);
    const eventHeader = getEventHeader(rows);
    if (!eventHeader) {
        showMessage(tableElement, 'The selected CSV file does not contain an "Event Value" column.');
        onStatus();
        return;
    }

    const { validRows, invalidRows } = parseEventValues(rows, eventHeader);
    eventRows = validRows;
    eventHeaders = getEventHeaders(eventRows);
    currentPage = 0;

    if (invalidRows.length > 0) {
        const warning = document.createElement("p");
        warning.className = "events-warning";
        warning.textContent = `${invalidRows.length} evento(s) omitido(s) porque su Event Value no es un objeto JSON válido.`;
        tableElement.before(warning);
        console.warn("Invalid Event Value rows omitted", invalidRows);
    }

    if (eventRows.length === 0) {
        showMessage(tableElement, "No se encontraron eventos válidos para mostrar.");
    } else if (eventHeaders.length === 0) {
        showMessage(tableElement, "The selected CSV file has no event object keys.");
    } else {
        const headerRow = tableElement.createTHead().insertRow();
        eventHeaders.forEach((header) => {
            const headerCell = document.createElement("th");
            headerCell.scope = "col";
            headerCell.textContent = header;
            headerRow.append(headerCell);
        });
        renderPage(tableElement);
        renderPagination(tableElement);
    }
    onStatus();
}
