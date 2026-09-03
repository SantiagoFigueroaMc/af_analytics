import { loadDatabase } from "./database.js";

const PAGE_SIZE = 20;
const ALL_FILTER_VALUE = "";
const COLUMN_CONFIG_PREFIX = "csv-column-config:";

let currentPage = 0;
let allRows = [];
let currentRows = [];
let currentHeaders = [];
let visibleHeaders = [];
const activeFilters = new Map();

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
            cell.textContent = row[header] ?? "";
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
    document.querySelector(".column-menu")?.remove();

    const menu = document.createElement("details");
    menu.className = "column-menu";
    const summary = document.createElement("summary");
    summary.textContent = "Displayed columns";
    menu.append(summary);
    const grid = document.createElement("div");
    grid.className = "column-grid";
    menu.append(grid);

    headers.forEach((header) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visibleHeaders.includes(header);
        checkbox.addEventListener("change", () => {
            if (!checkbox.checked && visibleHeaders.length === 1) {
                checkbox.checked = true;
                return;
            }

            visibleHeaders = headers.filter((column) => (
                column === header ? checkbox.checked : visibleHeaders.includes(column)
            ));
            saveColumnConfig(databaseName);
            renderTableHeader(tableElement);
            renderPage(tableElement);
        });
        label.append(checkbox, ` ${header}`);
        grid.append(label);
    });

    tableElement.before(menu);
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
        allOption.value = ALL_FILTER_VALUE;
        allOption.textContent = "All";
        filter.append(allOption);

        const values = [...new Set(allRows.map((row) => String(row[header] ?? "")))].sort(
            (first, second) => first.localeCompare(second),
        );
        values.forEach((value, index) => {
            const option = document.createElement("option");
            option.value = `value-${index}`;
            option.dataset.filterValue = value;
            option.textContent = value || "(empty)";
            filter.append(option);
        });

        const selectedValue = activeFilters.get(header);
        if (selectedValue !== undefined) {
            const selectedOption = [...filter.options].find(
                (option) => option.dataset.filterValue === selectedValue,
            );
            if (selectedOption) {
                filter.value = selectedOption.value;
            }
        }

        filter.addEventListener("change", () => {
            if (filter.value !== ALL_FILTER_VALUE) {
                activeFilters.set(header, filter.selectedOptions[0].dataset.filterValue);
            } else {
                activeFilters.delete(header);
            }
            applyFilters();
            currentPage = 0;
            renderPage(tableElement);
            renderPagination(tableElement);
        });

        cell.append(filter);
        headerRow.append(cell);
    });
}

function applyFilters() {
    currentRows = allRows.filter((row) => [...activeFilters].every(
        ([header, value]) => String(row[header] ?? "") === value,
    ));
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

export async function loadDataToTable(indexedDbName) {
    const tableElement = document.querySelector("table#main-table");

    if (!tableElement) {
        throw new Error("Main table element was not found");
    }
    if (!indexedDbName) {
        throw new Error("A database name is required");
    }

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
        return;
    }

    currentRows = rows;
    allRows = rows;
    currentHeaders = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    visibleHeaders = getColumnConfig(indexedDbName, currentHeaders);
    currentPage = 0;
    renderColumnMenu(indexedDbName, currentHeaders, tableElement);
    renderTableHeader(tableElement);
    renderPage(tableElement);
    renderPagination(tableElement);
}
