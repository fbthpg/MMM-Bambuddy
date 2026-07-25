/* MMM-Bambuddy — node_helper.js
 * Polls the Bambuddy REST API server-side (so the API key never reaches
 * the browser) and pushes a compact printer list to the front-end module.
 */

const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start: function () {
		this.config = null;
		this.pollTimer = null;
		this.setupRoutes();
	},

	stop: function () {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "BAMBUDDY_CONFIG") {
			this.config = payload;

			if (this.pollTimer) {
				clearInterval(this.pollTimer);
			}

			this.fetchAll();
			this.pollTimer = setInterval(() => {
				this.fetchAll();
			}, this.config.updateInterval);
		}
	},

	// Build the headers object, adding X-API-Key only if one was configured.
	authHeaders: function () {
		const headers = { Accept: "application/json" };
		if (this.config.apiKey) {
			headers["X-API-Key"] = this.config.apiKey;
		}
		return headers;
	},

	apiUrl: function (path) {
		return this.config.apiBase.replace(/\/$/, "") + path;
	},

	fetchJson: async function (path) {
		const res = await fetch(this.apiUrl(path), { headers: this.authHeaders() });
		if (!res.ok) {
			throw new Error(`${path} -> HTTP ${res.status}`);
		}
		return res.json();
	},

	// Fetch the printer list, then enrich each entry with per-printer
	// status (progress / HMS) and, if a printer is erroring, a snapshot.
	fetchAll: async function () {
		try {
			const printers = await this.fetchJson("/printers");

			const enriched = await Promise.all(
				printers.map((p) => this.enrichPrinter(p))
			);

			this.sendSocketNotification("BAMBUDDY_DATA", {
				printers: enriched,
				fetchedAt: Date.now()
			});
		} catch (err) {
			this.sendSocketNotification("BAMBUDDY_ERROR", {
				message: err.message || String(err)
			});
		}
	},

	enrichPrinter: async function (printer) {
		const result = {
			id: printer.id,
			name: printer.name,
			rawStatus: printer.status || "unknown",
			progress: null,
			hmsErrors: [],
			snapshotUrl: null
		};

		// Pull live status (progress + HMS) when we have an id to query.
		try {
			const status = await this.fetchJson(`/printers/${printer.id}/status`);
			if (typeof status.progress === "number") {
				result.progress = status.progress;
			}
			if (status.hms_status && status.hms_status !== "ok") {
				result.hmsErrors.push(status.hms_status);
			}
		} catch (err) {
			// Status endpoint failing doesn't necessarily mean the printer
			// itself errored — the printer/offline state below still applies.
		}

		result.state = this.classifyState(printer, result);

		// On error, grab a snapshot so the mirror can show what's on the plate.
		if (result.state === "error") {
			result.snapshotUrl = `${this.name}/snapshot/${printer.id}?t=${Date.now()}`;
		}

		return result;
	},

	// Normalizes whatever the API reports into one of:
	// online | offline | printing | error
	classifyState: function (printer, enriched) {
		const raw = (printer.status || "").toLowerCase();

		if (enriched.hmsErrors.length > 0 || raw.includes("error") || raw.includes("fail")) {
			return "error";
		}
		if (raw.includes("offline") || raw.includes("disconnected")) {
			return "offline";
		}
		if (raw.includes("print") || raw.includes("running") || (enriched.progress !== null && enriched.progress > 0 && enriched.progress < 100)) {
			return "printing";
		}
		if (raw.includes("idle") || raw.includes("online") || raw.includes("finish")) {
			return "online";
		}
		return "offline";
	},

	// Proxies a camera snapshot through this node_helper so the front-end
	// <img> tag never needs to know the API key or the Bambuddy base URL.
	// Exposed at /MMM-Bambuddy/snapshot/:id via this.expressApp below.
	setupRoutes: function () {
		this.expressApp.get("/" + this.name + "/snapshot/:id", async (req, res) => {
			if (!this.config) {
				res.status(503).send("Not configured yet");
				return;
			}
			try {
				const url = this.apiUrl(`/printers/${req.params.id}/camera/snapshot`);
				const upstream = await fetch(url, { headers: this.authHeaders() });
				if (!upstream.ok) {
					res.status(upstream.status).send("Snapshot unavailable");
					return;
				}
				res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
				const buffer = Buffer.from(await upstream.arrayBuffer());
				res.send(buffer);
			} catch (err) {
				res.status(502).send("Snapshot fetch failed");
			}
		});
	}
});
