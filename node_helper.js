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
	// NOTE: the trailing slash on /printers/ matches this Bambuddy
	// version's OpenAPI route (list_printers_api_v1_printers__get).
	fetchAll: async function () {
		try {
			const printers = await this.fetchJson("/printers/");

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
			connected: false,
			state: null, // raw PrinterStatus.state string, e.g. RUNNING/IDLE/FAILED
			progress: null,
			hmsErrors: [],
			snapshotUrl: null
		};

		// Pull live status (connected/state/progress/hms_errors).
		// PrinterStatus.hms_errors is a list of HMSErrorResponse objects
		// ({code, module, severity, ...}), not a single string field.
		try {
			const status = await this.fetchJson(`/printers/${printer.id}/status`);
			result.connected = !!status.connected;
			result.state = status.state || null;
			if (typeof status.progress === "number") {
				result.progress = status.progress;
			}
			if (Array.isArray(status.hms_errors)) {
				result.hmsErrors = status.hms_errors.map((e) => e.code || e.full_code || "Unknown HMS error");
			}
		} catch (err) {
			// Status endpoint failing (printer unreachable, etc.) — fall
			// through to classifyState(), which treats this as offline.
		}

		result.uiState = this.classifyState(result);

		// On error, grab a snapshot so the mirror can show what's on the plate.
		if (result.uiState === "error") {
			result.snapshotUrl = `${this.name}/snapshot/${printer.id}?t=${Date.now()}`;
		}

		return result;
	},

	// Normalizes the real PrinterStatus fields into one of:
	// online | offline | printing | error
	classifyState: function (enriched) {
		if (enriched.hmsErrors.length > 0) {
			return "error";
		}
		if (!enriched.connected) {
			return "offline";
		}

		const state = (enriched.state || "").toUpperCase();
		if (state === "FAILED") {
			return "error";
		}
		if (state === "RUNNING" || state === "PAUSE" || state === "PREPARE") {
			return "printing";
		}
		// IDLE, FINISH, or unknown-but-connected -> online.
		return "online";
	},

	// Mint a short-lived (60 min) camera stream token via the API-key
	// authenticated endpoint. Snapshot/stream routes don't accept
	// X-API-Key directly (they're built for <img>/<video> tags, which
	// can't send custom headers) — they take ?token=... instead.
	getStreamToken: async function () {
		const url = this.apiUrl("/printers/camera/stream-token");
		const res = await fetch(url, {
			method: "POST",
			headers: this.authHeaders()
		});
		if (!res.ok) {
			throw new Error(`stream-token -> HTTP ${res.status}`);
		}
		const data = await res.json();
		return data.token;
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
				const token = await this.getStreamToken();
				const url = this.apiUrl(`/printers/${req.params.id}/camera/snapshot?token=${encodeURIComponent(token)}`);
				const upstream = await fetch(url);
				if (!upstream.ok) {
					res.status(upstream.status).send("Snapshot unavailable");
					return;
				}
				res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
				const buffer = Buffer.from(await upstream.arrayBuffer());
				res.send(buffer);
			} catch (err) {
				res.status(502).send("Snapshot fetch failed: " + (err.message || err));
			}
		});
	}
});
