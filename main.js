import {
    getAvailableDatabases,
    processCSV,
} from "./scripts/process_file.js";
import { loadDataToTable } from "./scripts/components.js";

const fileInput = document.querySelector("input#file-upload");
const availableDbs = document.querySelector(".available-dbs");

function renderDatabases(databaseNames) {
    availableDbs.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Available CSV files";
    availableDbs.append(heading);

    if (databaseNames.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No CSV files have been uploaded yet.";
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
            button.textContent = "Loading...";

            try {
                await loadDataToTable(databaseName);
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

fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;

    if (!file) {
        return;
    }

    try {
        await processCSV(file);
        await loadAvailableDatabases();
    } catch (error) {
        console.error("Error processing file", error.message);
    } finally {
        fileInput.value = "";
    }
});

loadAvailableDatabases();