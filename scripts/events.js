import { loadDatabase } from "./database.js";

const PAGE_SIZE = 50;
const MAX_CELL_LENGTH = 20;
const COLUMN_CONFIG_PREFIX = "csv-event-column-config:";

let eventRows = [];
let eventHeaders = [];
let visibleHeaders = [];
const activeFilters = new Map();
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

function showEventDetails(value) {
    const dialog = document.createElement("dialog");
    dialog.className = "event-details-dialog";

    const content = document.createElement("pre");
    content.textContent = value;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Cerrar";
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });
    dialog.append(content, closeButton);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
}

function renderCell(cell, value) {
    if (value.length <= MAX_CELL_LENGTH) {
        cell.textContent = value;
        return;
    }

    const preview = document.createElement("span");
    preview.textContent = value.slice(0, MAX_CELL_LENGTH);
    preview.className = "event-cell-preview";
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "event-details-button";
    detailsButton.textContent = "Ver más";
    detailsButton.addEventListener("click", () => showEventDetails(value));
    cell.append(preview, detailsButton);
}

function getColumnConfig(databaseName) {
    const savedConfig = localStorage.getItem(`${COLUMN_CONFIG_PREFIX}${databaseName}`);
    if (!savedConfig) {
        return [...eventHeaders];
    }

    try {
        const savedHeaders = JSON.parse(savedConfig);
        if (Array.isArray(savedHeaders)) {
            const configuredHeaders = eventHeaders.filter((header) => savedHeaders.includes(header));
            if (configuredHeaders.length > 0) {
                return configuredHeaders;
            }
        }
    } catch (error) {
        console.warn("Ignoring invalid event column configuration", error);
    }

    return [...eventHeaders];
}

function saveColumnConfig(databaseName) {
    localStorage.setItem(
        `${COLUMN_CONFIG_PREFIX}${databaseName}`,
        JSON.stringify(visibleHeaders),
    );
}

function renderColumnMenu(databaseName, tableElement) {
    document.querySelector(".events-column-menu")?.remove();

    const menu = document.createElement("details");
    menu.className = "column-menu events-column-menu";
    const summary = document.createElement("summary");
    summary.textContent = "Displayed columns";
    menu.append(summary);

    const grid = document.createElement("div");
    grid.className = "column-grid";
    menu.append(grid);

    eventHeaders.forEach((header) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visibleHeaders.includes(header);
        checkbox.addEventListener("change", () => {
            if (!checkbox.checked && visibleHeaders.length === 1) {
                checkbox.checked = true;
                return;
            }

            visibleHeaders = eventHeaders.filter((column) => (
                column === header ? checkbox.checked : visibleHeaders.includes(column)
            ));
            activeFilters.delete(header);
            saveColumnConfig(databaseName);
            renderColumnMenu(databaseName, tableElement);
            renderTableHeader(tableElement);
            currentPage = 0;
            renderPage(tableElement);
            renderPagination(tableElement);
        });
        label.append(checkbox, ` ${header}`);
        grid.append(label);
    });

    tableElement.before(menu);
}

function renderPage(tableElement) {
    const body = tableElement.tBodies[0] || tableElement.createTBody();
    body.replaceChildren();

    const start = currentPage * PAGE_SIZE;
    const filteredRows = applyFilters();
    filteredRows.slice(start, start + PAGE_SIZE).forEach((eventRow) => {
        const row = body.insertRow();
        visibleHeaders.forEach((header) => {
            const cell = row.insertCell();
            renderCell(cell, formatCellValue(eventRow[header]));
        });
    });
}

function applyFilters() {
    return eventRows.filter((eventRow) => [...activeFilters].every(([header, value]) => (
        formatCellValue(eventRow[header]) === value
    )));
}

function renderTableHeader(tableElement) {
    tableElement.tHead?.remove();
    const headerRow = tableElement.createTHead().insertRow();

    visibleHeaders.forEach((header) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.append(`${header} `);

        const filter = document.createElement("select");
        filter.setAttribute("aria-label", `Filter ${header}`);

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All";
        filter.append(allOption);

        const values = [...new Set(eventRows.map((row) => formatCellValue(row[header])))]
            .sort((first, second) => first.localeCompare(second));
        values.slice(0, 2_000).forEach((value, index) => {
            const option = document.createElement("option");
            option.value = `value-${index}`;
            option.dataset.filterValue = value;
            option.textContent = value || "(empty)";
            filter.append(option);
        });

        filter.value = [...filter.options].find(
            (option) => option.dataset.filterValue === activeFilters.get(header),
        )?.value || "";

        filter.addEventListener("change", () => {
            if (filter.value) {
                activeFilters.set(header, filter.selectedOptions[0].dataset.filterValue);
            } else {
                activeFilters.delete(header);
            }
            currentPage = 0;
            renderPage(tableElement);
            renderPagination(tableElement);
        });

        cell.append(filter);
        headerRow.append(cell);
    });
}

function renderPagination(tableElement) {
    document.querySelector(".events-pagination")?.remove();
    const totalPages = Math.ceil(applyFilters().length / PAGE_SIZE);
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
    document.querySelector(".events-column-menu")?.remove();
    activeFilters.clear();
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
    visibleHeaders = getColumnConfig(indexedDbName);
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
        renderColumnMenu(indexedDbName, tableElement);
        renderTableHeader(tableElement);
        renderPage(tableElement);
        renderPagination(tableElement);
    }
    onStatus();
}
