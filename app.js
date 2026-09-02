"use strict";

const STORE = "ot-loaner-pwa-v2";
const FLOW_URL = "https://377757344b83e44ca598bd9c300d6c.80.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/08/workflows/fabccebaf1ef4b90812047a004abe01d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=4yooi-KUS9_pfkfP37MvkC_NaTvNxMrynkIlE8HTMlA";

const $ = id => document.getElementById(id);
let selectedStatus = "Pending to Check";
let currentLoan = "OT_Loaner01";
let scanner = null;
let scannerRunning = false;

function normalizeLoan(value) {
    const match = String(value || "").trim().match(/^OT_Loaner(\d{1,3})$/i);
    if (!match) return null;

    const number = Number(match[1]);
    return number >= 1 && number <= 100
        ? `OT_Loaner${String(number).padStart(2, "0")}`
        : null;
}

function extractLoan(value) {
    const directValue = normalizeLoan(value);
    if (directValue) return directValue;

    try {
        const url = new URL(String(value));
        return normalizeLoan(
            url.searchParams.get("loan") || url.hash.replace(/^#/, "")
        );
    } catch {
        return null;
    }
}

function rows() {
    try {
        return JSON.parse(localStorage.getItem(STORE) || "[]");
    } catch {
        return [];
    }
}

function saveRows(value) {
    localStorage.setItem(STORE, JSON.stringify(value));
}

function setStatus(status) {
    selectedStatus = status;
    document.querySelectorAll(".status-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.status === status);
    });
}

function updateStats() {
    const data = rows();
    $("pendingCount").textContent = data.filter(
        item => item.status === "Pending to Check"
    ).length;
    $("checkedCount").textContent = data.filter(
        item => item.status === "Checked"
    ).length;
    $("returnedCount").textContent = data.filter(
        item => item.status === "Returned"
    ).length;
}

function clearForm() {
    $("supplier").value = "";
    $("model").value = "";
    $("serial").value = "";
    $("testDate").value = new Date().toISOString().slice(0, 10);
    $("frequency").value = "";
    setStatus("Pending to Check");
    $("toast").style.display = "none";
}

function loadLoan(value) {
    const id = normalizeLoan(value);
    if (!id) return false;

    currentLoan = id;
    $("loanDisplay").textContent = "# " + id;
    clearForm();

    const existing = rows().find(item => item.loanNumber === id);
    if (existing) {
        $("supplier").value = existing.supplier || "";
        $("model").value = existing.model || "";
        $("serial").value = existing.serialNumber || "";
        $("testDate").value = existing.testDate || $("testDate").value;
        $("frequency").value = existing.testFrequency || "";
        setStatus(existing.status || "Pending to Check");
    }

    history.replaceState(
        null,
        "",
        location.pathname + "?loan=" + encodeURIComponent(id)
    );

    return true;
}

const params = new URLSearchParams(location.search);
const hash = location.hash.replace(/^#/, "");
loadLoan(extractLoan(params.get("loan") || hash) || "OT_Loaner01");

document.querySelectorAll(".status-btn").forEach(button => {
    button.addEventListener("click", () => setStatus(button.dataset.status));
});

$("form").addEventListener("submit", async event => {
    event.preventDefault();

    let valid = true;

    ["supplier", "model", "serial", "testDate", "frequency"].forEach(id => {
        const element = $(id);
        const invalid = !element.value.trim();
        element.classList.toggle("error", invalid);
        if (invalid) valid = false;
    });

    if (!valid) return;

    const record = {
        loanNumber: currentLoan,
        supplier: $("supplier").value.trim(),
        model: $("model").value.trim(),
        serialNumber: $("serial").value.trim(),
        testDate: $("testDate").value,
        testFrequency: $("frequency").value.trim(),
        status: selectedStatus,
        updatedAt: new Date().toISOString()
    };

    const data = rows();
    const existingIndex = data.findIndex(
        item => item.loanNumber === currentLoan
    );

    if (existingIndex >= 0) {
        data[existingIndex] = record;
    } else {
        data.push(record);
    }

    saveRows(data);
    updateStats();

    $("toast").textContent = "Saving to Excel...";
    $("toast").style.display = "block";

    try {
        const response = await fetch(FLOW_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(record)
        });

        const responseText = await response.text();
        let result = {};

        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            result = { message: responseText };
        }

        if (!response.ok) {
            throw new Error(
                result.message || `Workflow returned HTTP ${response.status}`
            );
        }

        $("toast").textContent =
            result.message || `${currentLoan} updated in Excel successfully.`;
    } catch (error) {
        console.error("Flow Error:", error);
        $("toast").textContent =
            `${currentLoan} saved locally, but Excel update failed.`;
    }
});

function showScanError(text) {
    $("scannerError").textContent = text;
    $("scannerError").style.display = "block";
}

async function stopScanner() {
    if (scanner && scannerRunning) {
        try {
            await scanner.stop();
        } catch {}
        scannerRunning = false;
    }

    if (scanner) {
        try {
            scanner.clear();
        } catch {}
        scanner = null;
    }
}

async function closeScanner() {
    await stopScanner();
    $("scannerModal").classList.remove("open");
}

async function startScanner() {
    $("scannerError").style.display = "none";
    $("scannerModal").classList.add("open");

    if (!window.Html5Qrcode) {
        showScanError(
            "Scanner library did not load. Connect to the internet and reload once."
        );
        return;
    }

    try {
        scanner = new Html5Qrcode("reader");
        scannerRunning = true;

        await scanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 230, height: 230 },
                aspectRatio: 1
            },
            async decodedText => {
                const id = extractLoan(decodedText);

                if (!id) {
                    showScanError(
                        "Invalid QR. Use OT_Loaner01 to OT_Loaner100."
                    );
                    return;
                }

                await closeScanner();
                loadLoan(id);
                $("toast").textContent = id + " loaded from QR code.";
                $("toast").style.display = "block";
            },
            () => {}
        );
    } catch {
        scannerRunning = false;
        showScanError(
            "Camera could not start. Allow camera access and open the HTTPS GitHub Pages site."
        );
    }
}

$("scanBtn").addEventListener("click", startScanner);
$("closeScanner").addEventListener("click", closeScanner);
$("scannerModal").addEventListener("click", event => {
    if (event.target === $("scannerModal")) closeScanner();
});
$("manualLoad").addEventListener("click", async () => {
    const id = extractLoan($("manualLoan").value);

    if (!id) {
        showScanError("Enter OT_Loaner01 to OT_Loaner100.");
        return;
    }

    await closeScanner();
    loadLoan(id);
});

function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

$("exportBtn").onclick = () => {
    const escapeCsv = value =>
        '"' + String(value ?? "").replaceAll('"', '""') + '"';

    const header = [
        "Loan Number",
        "Supplier",
        "Model",
        "Serial Number",
        "Test Date",
        "Test Frequency",
        "Status",
        "Updated At"
    ];

    const body = rows().map(item => [
        item.loanNumber,
        item.supplier,
        item.model,
        item.serialNumber,
        item.testDate,
        item.testFrequency,
        item.status,
        item.updatedAt
    ]);

    download(
        "OT_Loaner_Register.csv",
        "\ufeff" +
            [header, ...body]
                .map(row => row.map(escapeCsv).join(","))
                .join("\r\n"),
        "text/csv;charset=utf-8"
    );
};

$("backupBtn").onclick = () =>
    download(
        "OT_Loaner_Backup.json",
        JSON.stringify(rows(), null, 2),
        "application/json"
    );

function updateNetworkState() {
    const online = navigator.onLine;
    $("networkState").textContent = online ? "Online" : "Offline";
    $("networkState").classList.toggle("offline", !online);
}

addEventListener("online", updateNetworkState);
addEventListener("offline", updateNetworkState);
updateNetworkState();

let installPrompt = null;

addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    $("installBtn").style.display = "block";
});

$("installBtn").onclick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("installBtn").style.display = "none";
};

if ("serviceWorker" in navigator) {
    addEventListener("load", () =>
        navigator.serviceWorker.register("service-worker.js")
    );
}

updateStats();
