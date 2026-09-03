import { processCSV } from "./scripts/csv.js?v=2";
import {
    deleteDatabase,
    getAvailableDatabases,
    renameDatabase,
} from "./scripts/database.js";
import { loadDataToTable } from "./scripts/table.js?v=2";

const fileInput = document.querySelector("input#file-upload");
const availableDbs = document.querySelector(".available-dbs");
const selectionStatuses = document.querySelectorAll(".selection-status");
const sidebarButtons = document.querySelectorAll(".sidebar-button");
const appStatus = document.querySelector(".app-status");

function setAppStatus(message = "") {
    appStatus.textContent = message;
    appStatus.hidden = !message;
}

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

function formatCreatedAt(createdAt) {
    if (!createdAt) {
        return "Fecha no disponible";
    }
    return new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
    }).format(new Date(createdAt));
}

function renderDatabases(databases) {
    availableDbs.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Archivos CSV disponibles";
    availableDbs.append(heading);

    if (databases.length === 0) {
        const message = document.createElement("p");
        message.textContent = "Todavía no se ha cargado ningún archivo CSV.";
        availableDbs.append(message);
        return;
    }

    databases.forEach(({ name: databaseName, createdAt }) => {
        const item = document.createElement("div");
        item.className = "database-item";
        const details = document.createElement("div");
        details.className = "database-details";
        const buttonLabel = databaseName.replace(/^csv_/, "");
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.textContent = buttonLabel;
        openButton.dataset.databaseName = databaseName;
        const date = document.createElement("span");
        date.className = "database-date";
        date.textContent = `Creado: ${formatCreatedAt(createdAt)}`;
        details.append(openButton, date);

        const actions = document.createElement("div");
        actions.className = "database-actions";
        const renameButton = document.createElement("button");
        renameButton.type = "button";
        renameButton.className = "database-action";
        renameButton.textContent = "Renombrar";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "database-action database-action-danger";
        deleteButton.textContent = "Eliminar";
        actions.append(renameButton, deleteButton);
        item.append(details, actions);

        openButton.addEventListener("click", async () => {
            openButton.disabled = true;
            openButton.setAttribute("aria-busy", "true");
            openButton.textContent = "Cargando...";

            try {
                setAppStatus(`Abriendo ${buttonLabel}...`);
                await loadDataToTable(databaseName, { onStatus: setAppStatus });
                setSelectionStatus(buttonLabel);
                document.querySelector('[data-view="table-view"]').disabled = false;
                setView("table-view");
            } catch (error) {
                console.error("Error loading CSV data", error);
                setAppStatus("No se pudo abrir el archivo seleccionado.");
            } finally {
                openButton.disabled = false;
                openButton.removeAttribute("aria-busy");
                openButton.textContent = buttonLabel;
                if (document.querySelector(".app-status")?.textContent.startsWith("Abriendo")) {
                    setAppStatus();
                }
            }
        });

        renameButton.addEventListener("click", async () => {
            const newLabel = window.prompt("Nuevo nombre del archivo:", buttonLabel);
            if (!newLabel?.trim()) {
                return;
            }
            renameButton.disabled = true;
            try {
                await renameDatabase(databaseName, newLabel.trim());
                await loadAvailableDatabases();
            } catch (error) {
                window.alert(error.message);
            } finally {
                renameButton.disabled = false;
            }
        });

        deleteButton.addEventListener("click", async () => {
            if (!window.confirm(`¿Eliminar "${buttonLabel}"? Esta acción no se puede deshacer.`)) {
                return;
            }
            deleteButton.disabled = true;
            try {
                await deleteDatabase(databaseName);
                await loadAvailableDatabases();
            } catch (error) {
                window.alert(error.message);
                deleteButton.disabled = false;
            }
        });

        availableDbs.append(item);
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
        fileInput.disabled = true;
        setAppStatus(`Cargando ${file.name}...`);
        await processCSV(file, { onProgress: setAppStatus });
        await loadAvailableDatabases();
        setSelectionStatus(file.name);
        setView("select-view");
        setAppStatus("Archivo cargado. Selecciona un archivo para mostrar.");
    } catch (error) {
        console.error("Error processing file", error.message);
        setAppStatus(`No se pudo cargar el archivo: ${error.message}`);
    } finally {
        fileInput.disabled = false;
        fileInput.value = "";
    }
});

loadAvailableDatabases();