/* global Module, Log */

/* MMM-Bambuddy — MMM-Bambuddy.js
 * Shows a minimal fleet overview from a Bambuddy server:
 * name, status (online/offline/printing/error), progress,
 * and a camera snapshot when a printer is erroring.
 */

Module.register("MMM-Bambuddy", {
	defaults: {
		apiBase: "http://localhost:8000/api/v1", // Bambuddy API base URL
		apiKey: "", // X-API-Key value, leave empty if auth is disabled
		updateInterval: 15 * 1000, // how often to poll Bambuddy
		showOfflinePrinters: true, // set false to hide offline printers entirely
		animationSpeed: 500
	},

	// Human-friendly labels + a css class per normalized state.
	stateMeta: {
		online: { label: "Online", className: "bam-online" },
		printing: { label: "Printing", className: "bam-printing" },
		offline: { label: "Offline", className: "bam-offline" },
		error: { label: "Error", className: "bam-error" }
	},

	start: function () {
		Log.info(`Starting module: ${this.name}`);
		this.printers = [];
		this.loaded = false;
		this.errorMessage = null;
		this.sendSocketNotification("BAMBUDDY_CONFIG", this.config);
	},

	getStyles: function () {
		return [this.file("MMM-Bambuddy.css")];
	},

    socketNotificationReceived: function (notification, payload) {
        if (notification === "BAMBUDDY_DATA") {
            this.printers = payload.printers;
            this.loaded = true;
            this.errorMessage = null;
            this.updateDom(this.config.animationSpeed);
        } else if (notification === "BAMBUDDY_ERROR") {
            this.errorMessage = payload.message;
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
        }
    },

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "bambuddy-wrapper";

		if (!this.loaded) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = this.translateOrDefault("LOADING", "Loading printers …");
			return wrapper;
		}

		if (this.errorMessage) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = `Bambuddy error: ${this.errorMessage}`;
			return wrapper;
		}

		let printers = this.printers;
		if (!this.config.showOfflinePrinters) {
			printers = printers.filter((p) => p.uiState !== "offline");
		}

		if (printers.length === 0) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = "No printers found.";
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "small bambuddy-table";

		printers.forEach((printer) => {
			table.appendChild(this.createPrinterRow(printer));

			if (printer.uiState === "error") {
				table.appendChild(this.createErrorDetailRow(printer));
			}
		});

		wrapper.appendChild(table);
		return wrapper;
	},

	createPrinterRow: function (printer) {
		const meta = this.stateMeta[printer.uiState] || this.stateMeta.offline;

		const row = document.createElement("tr");
		row.className = `bambuddy-row ${meta.className}`;

		const nameCell = document.createElement("td");
		nameCell.className = "bambuddy-name";
		nameCell.innerHTML = printer.name;
		row.appendChild(nameCell);

		const statusCell = document.createElement("td");
		statusCell.className = "bambuddy-status";
		statusCell.innerHTML = meta.label;
		row.appendChild(statusCell);

		const progressCell = document.createElement("td");
		progressCell.className = "bambuddy-progress";
		if (printer.uiState === "printing" && typeof printer.progress === "number") {
			progressCell.innerHTML = `${Math.round(printer.progress)}%`;
		} else {
			progressCell.innerHTML = "&nbsp;";
		}
		row.appendChild(progressCell);

		return row;
	},

	createErrorDetailRow: function (printer) {
		const row = document.createElement("tr");
		row.className = "bambuddy-error-row";

		const cell = document.createElement("td");
		cell.colSpan = 3;

		const errText = document.createElement("div");
		errText.className = "bambuddy-error-text xsmall dimmed";
		errText.innerHTML =
			printer.hmsErrors && printer.hmsErrors.length > 0
				? printer.hmsErrors.join(", ")
				: "Unknown error";
		cell.appendChild(errText);

		if (printer.snapshotUrl) {
			const img = document.createElement("img");
			img.className = "bambuddy-snapshot";
			img.src = printer.snapshotUrl;
			img.alt = `${printer.name} camera snapshot`;
			// If Bambuddy can't produce a snapshot (camera off, printer
			// unreachable, etc.) it returns a non-image error response.
			// Rather than showing a broken-image icon, just remove the
			// element so the row falls back to text-only.
			img.onerror = function () {
				if (img.parentNode) {
					img.parentNode.removeChild(img);
				}
			};
			cell.appendChild(img);
}

		row.appendChild(cell);
		return row;
	},

	translateOrDefault: function (key, fallback) {
		const translated = this.translate(key);
		return translated === key ? fallback : translated;
	}
});
