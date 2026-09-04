import { loadDatabase } from "./database.js";

const PAGE_SIZE = 50;

let eventValues = [];
let currentPage = 0;

function showMessage(tableElement, message) {
    const row = tableElement.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 1;
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

function renderPage(tableElement) {
    const body = tableElement.tBodies[0] || tableElement.createTBody();
    body.replaceChildren();

    const start = currentPage * PAGE_SIZE;
    eventValues.slice(start, start + PAGE_SIZE).forEach((value) => {
        const row = body.insertRow();
        row.insertCell().textContent = value;
    });
}

function renderPagination(tableElement) {
    document.querySelector(".events-pagination")?.remove();
    const totalPages = Math.ceil(eventValues.length / PAGE_SIZE);
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
    onStatus("Leyendo eventos...");

    const rows = await loadDatabase(indexedDbName);
    const eventHeader = getEventHeader(rows);
    if (!eventHeader) {
        showMessage(tableElement, 'The selected CSV file does not contain an "Event Value" column.');
        onStatus();
        return;
    }

    eventValues = rows.map((row) => String(row[eventHeader] ?? ""));
    currentPage = 0;

    const headerRow = tableElement.createTHead().insertRow();
    const headerCell = headerRow.insertCell();
    headerCell.scope = "col";
    headerCell.textContent = "Event Value";

    if (eventValues.length === 0) {
        showMessage(tableElement, "The selected CSV file has no events.");
    } else {
        renderPage(tableElement);
        renderPagination(tableElement);
    }
    onStatus();
}
