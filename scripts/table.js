import { loadDatabase } from "./database.js";

const PAGE_SIZE = 20;
const MAX_CELL_LENGTH = 20;
const ALL_FILTER_VALUE = "";
const NON_EMPTY_FILTER_VALUE = "__non-empty__";
const COLUMN_CONFIG_PREFIX = "csv-column-config:";

let currentPage = 0;
let allRows = [];
let currentRows = [];
let currentHeaders = [];
let visibleHeaders = [];
const activeFilters = new Map();
let reportStatus = () => { };

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

function formatCellValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function showCellDetails(value) {
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
    preview.className = "event-cell-preview";
    preview.textContent = value.slice(0, MAX_CELL_LENGTH);
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "event-details-button";
    detailsButton.textContent = "Ver más";
    detailsButton.addEventListener("click", () => showCellDetails(value));
    cell.append(preview, detailsButton);
}

function showMessage(tableElement, message) {
    const row = tableElement.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 1;
    cell.textContent = message;
}

function renderPage(tableElement) {
    const body = tableElement.tBodies[0] || tableElement.createTBody();
    body.replaceChildren();

    if (currentRows.length === 0) {
        const row = body.insertRow();
        const cell = row.insertCell();
        cell.colSpan = currentHeaders.length || 1;
        cell.textContent = "No rows match the selected filters.";
        return;
    }

    const start = currentPage * PAGE_SIZE;
    currentRows.slice(start, start + PAGE_SIZE).forEach((row) => {
        const tableRow = body.insertRow();
        visibleHeaders.forEach((header) => {
            const cell = tableRow.insertCell();
            renderCell(cell, formatCellValue(row[header]));
        });
    });
}

function getColumnConfig(databaseName, headers) {
    const savedConfig = localStorage.getItem(`${COLUMN_CONFIG_PREFIX}${databaseName}`);

    if (!savedConfig) {
        return [...headers];
    }

    try {
        const savedHeaders = JSON.parse(savedConfig);
        if (Array.isArray(savedHeaders)) {
            const configuredHeaders = headers.filter((header) => savedHeaders.includes(header));
            if (configuredHeaders.length > 0) {
                return configuredHeaders;
            }
        }
    } catch (error) {
        console.warn("Ignoring invalid column configuration", error);
    }

    return [...headers];
}

function saveColumnConfig(databaseName) {
    localStorage.setItem(
        `${COLUMN_CONFIG_PREFIX}${databaseName}`,
        JSON.stringify(visibleHeaders),
    );
}

function renderColumnMenu(databaseName, headers, tableElement) {
    const existingMenu = document.querySelector(".column-menu");
    const wasOpen = existingMenu?.open || false;
    existingMenu?.remove();

    const menu = document.createElement("details");
    menu.className = "column-menu";
    menu.open = wasOpen;
    const summary = document.createElement("summary");
    summary.textContent = "Displayed columns";
    menu.append(summary);

    const actions = document.createElement("div");
    actions.className = "column-menu-actions";
    const selectAllButton = document.createElement("button");
    selectAllButton.type = "button";
    selectAllButton.textContent = "Select all";
    const selectNoneButton = document.createElement("button");
    selectNoneButton.type = "button";
    selectNoneButton.textContent = "Select none";
    actions.append(selectAllButton, selectNoneButton);
    menu.append(actions);

    const grid = document.createElement("div");
    grid.className = "column-grid";
    menu.append(grid);

    const updateColumns = async (nextHeaders) => {
        visibleHeaders = nextHeaders;
        activeFilters.clear();
        saveColumnConfig(databaseName);
        renderColumnMenu(databaseName, headers, tableElement);
        reportStatus("Actualizando columnas...");
        await applyFilters();
        currentPage = 0;
        await renderTableHeader(tableElement);
        renderPage(tableElement);
        renderPagination(tableElement);
        reportStatus();
    };

    selectAllButton.addEventListener("click", () => updateColumns([...headers]));
    selectNoneButton.addEventListener("click", () => updateColumns([]));

    headers.forEach((header) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visibleHeaders.includes(header);
        checkbox.addEventListener("change", async () => {
            const checkboxes = [...grid.querySelectorAll("input")];
            checkboxes.forEach((input) => { input.disabled = true; });
            try {
                visibleHeaders = headers.filter((column) => (
                    column === header ? checkbox.checked : visibleHeaders.includes(column)
                ));
                await updateColumns(visibleHeaders);
            } finally {
                checkboxes.forEach((input) => { input.disabled = false; });
                reportStatus();
            }
        });
        label.append(checkbox, ` ${header}`);
        grid.append(label);
    });

    const tableContainer = tableElement.closest(".container");
    tableContainer?.before(menu);
}

async function renderTableHeader(tableElement) {
    tableElement.tHead?.remove();
    if (visibleHeaders.length === 0) {
        return;
    }
    const headerRow = tableElement.createTHead().insertRow();

    for (const header of visibleHeaders) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.append(`${header} `);

        const filter = document.createElement("select");
        filter.setAttribute("aria-label", `Filter ${header}`);

        const allOption = document.createElement("option");
        allOption.value = ALL_FILTER_VALUE;
        allOption.textContent = "All";
        filter.append(allOption);

        const nonEmptyOption = document.createElement("option");
        nonEmptyOption.value = NON_EMPTY_FILTER_VALUE;
        nonEmptyOption.dataset.filterValue = NON_EMPTY_FILTER_VALUE;
        nonEmptyOption.textContent = "No vacío";
        filter.append(nonEmptyOption);

        const valuesSet = new Set();
        for (let index = 0; index < allRows.length; index += 1) {
            valuesSet.add(String(allRows[index][header] ?? ""));
            if (index > 0 && index % 5_000 === 0) {
                reportStatus(`Preparando filtro de ${header}...`);
                await yieldToBrowser();
            }
        }
        const values = [...valuesSet].sort((first, second) => first.localeCompare(second));
        values.slice(0, 2_000).forEach((value, index) => {
            const option = document.createElement("option");
            option.value = `value-${index}`;
            option.dataset.filterValue = value;
            option.textContent = value || "(empty)";
            filter.append(option);
        });
        if (values.length > 2_000) {
            const option = document.createElement("option");
            option.disabled = true;
            option.textContent = `(${values.length - 2_000} valores omitidos)`;
            filter.append(option);
        }

        const selectedValue = activeFilters.get(header);
        if (selectedValue !== undefined) {
            const selectedOption = [...filter.options].find(
                (option) => option.dataset.filterValue === selectedValue,
            );
            if (selectedOption) {
                filter.value = selectedOption.value;
            }
        }

        filter.addEventListener("change", async () => {
            if (filter.value !== ALL_FILTER_VALUE) {
                activeFilters.set(header, filter.selectedOptions[0].dataset.filterValue);
            } else {
                activeFilters.delete(header);
            }
            reportStatus("Aplicando filtro...");
            await applyFilters();
            currentPage = 0;
            renderPage(tableElement);
            renderPagination(tableElement);
            reportStatus();
        });

        cell.append(filter);
        headerRow.append(cell);
    }
}

async function applyFilters() {
    const filters = [...activeFilters];
    currentRows = [];
    for (let index = 0; index < allRows.length; index += 1) {
        const row = allRows[index];
        if (filters.every(([header, value]) => value === NON_EMPTY_FILTER_VALUE
            ? String(row[header] ?? "") !== ""
            : String(row[header] ?? "") === value)) {
            currentRows.push(row);
        }
        if (index > 0 && index % 5_000 === 0) {
            await yieldToBrowser();
        }
    }
}

function renderPagination(tableElement) {
    const totalPages = Math.ceil(currentRows.length / PAGE_SIZE);
    const existingControls = document.querySelector(".table-pagination");
    existingControls?.remove();

    if (totalPages <= 1) {
        return;
    }

    const controls = document.createElement("div");
    controls.className = "table-pagination";

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

export async function loadDataToTable(indexedDbName, { onStatus = () => { } } = {}) {
    const tableElement = document.querySelector("table#main-table");

    if (!tableElement) {
        throw new Error("Main table element was not found");
    }
    if (!indexedDbName) {
        throw new Error("A database name is required");
    }

    reportStatus = onStatus;
    reportStatus("Leyendo archivo seleccionado...");
    tableElement.replaceChildren();
    document.querySelector(".table-pagination")?.remove();
    document.querySelector(".column-menu")?.remove();
    activeFilters.clear();

    let rows;
    try {
        rows = await loadDatabase(indexedDbName);
    } catch (error) {
        showMessage(tableElement, "Unable to load the selected CSV file.");
        throw error;
    }

    if (rows.length === 0) {
        showMessage(tableElement, "The selected CSV file has no data.");
        reportStatus();
        return;
    }

    currentRows = rows;
    allRows = rows;
    currentHeaders = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    visibleHeaders = getColumnConfig(indexedDbName, currentHeaders);
    currentPage = 0;
    renderColumnMenu(indexedDbName, currentHeaders, tableElement);
    reportStatus("Preparando columnas...");
    await renderTableHeader(tableElement);
    renderPage(tableElement);
    renderPagination(tableElement);
    reportStatus();
}
