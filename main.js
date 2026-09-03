import {
    getAvailableDatabases,
    processCSV,
} from "./scripts/process_file.js";
import { loadDataToTable } from "./scripts/components.js";

const fileInput = document.querySelector("input#file-upload");
const availableDbs = document.querySelector(".available-dbs");
const selectionStatuses = document.querySelectorAll(".selection-status");
const sidebarButtons = document.querySelectorAll(".sidebar-button");

function setView(viewId) {
    document.querySelectorAll(".view-panel").forEach((view) => {
        const isActive = view.id === viewId;
        view.hidden = !isActive;
        view.classList.toggle("active", isActive);
    });

    sidebarButtons.forEach((button) => {
        const isActive = button.dataset.view === viewId;
        button.classList.toggle("active", isActive);
        if (isActive) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
}

function setSelectionStatus(fileName) {
    selectionStatuses.forEach((status) => {
        status.textContent = fileName
            ? `Archivo seleccionado: ${fileName}`
            : "Sin archivos seleccionados";
    });
}

function renderDatabases(databaseNames) {
    availableDbs.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Archivos CSV disponibles";
    availableDbs.append(heading);

    if (databaseNames.length === 0) {
        const message = document.createElement("p");
        message.textContent = "Todavía no se ha cargado ningún archivo CSV.";
        availableDbs.append(message);
        return;
    }

    databaseNames.forEach((databaseName) => {
        const button = document.createElement("button");
        button.type = "button";
        const buttonLabel = databaseName.replace(/^csv_/, "");
        button.textContent = buttonLabel;
        button.dataset.databaseName = databaseName;
        button.addEventListener("click", async () => {
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.textContent = "Cargando...";

            try {
                await loadDataToTable(databaseName);
                setSelectionStatus(buttonLabel);
                document.querySelector('[data-view="table-view"]').disabled = false;
                setView("table-view");
            } catch (error) {
                console.error("Error loading CSV data", error);
            } finally {
                button.disabled = false;
                button.removeAttribute("aria-busy");
                button.textContent = buttonLabel;
            }
        });
        availableDbs.append(button);
    });
}

async function loadAvailableDatabases() {
    try {
        renderDatabases(await getAvailableDatabases());
    } catch (error) {
        availableDbs.textContent = error.message;
        console.error("Error loading databases", error);
    }
}

sidebarButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (!button.disabled) {
            setView(button.dataset.view);
        }
    });
});

fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;

    if (!file) {
        return;
    }

    try {
        await processCSV(file);
        await loadAvailableDatabases();
        setSelectionStatus(file.name);
        setView("select-view");
    } catch (error) {
        console.error("Error processing file", error.message);
    } finally {
        fileInput.value = "";
    }
});

loadAvailableDatabases();