# MMM-Bambuddy

A minimal [MagicMirror²](https://magicmirror.builders/) module showing your 3D printer fleet from [Bambuddy](https://wiki.bambuddy.cool/).

![screenshot placeholder](screenshot.png)

For each printer, shows:

- Printer name
- Status: **Online**, **Printing**, **Offline**, or **Error**
- Print progress (while printing)
- On error: the HMS error message and a live camera snapshot

## Dependencies / external API

This module depends on the [Bambuddy REST API](https://wiki.bambuddy.cool/reference/api/), which you must be running yourself (Bambuddy is a self-hosted Bambu Lab printer manager). No external key is required beyond your own Bambuddy instance's optional API key.

## Installation

```sh
cd ~/MagicMirror/modules
git clone https://github.com/yourname/MMM-Bambuddy.git
cd MMM-Bambuddy
```

No `npm install` is required — the module only uses Node's built-in `fetch`.

## Configuration

Add to `config/config.js`:

```js
{
	module: "MMM-Bambuddy",
	position: "top_right",
	config: {
		apiBase: "http://192.168.1.50:8000/api/v1", // your Bambuddy server
		apiKey: "your-api-key-here",                 // leave "" if auth disabled
		updateInterval: 15 * 1000,                    // poll every 15s
		showOfflinePrinters: true
	}
}
```

### Options

| Option                | Type    | Default                             | Description                                            |
| ---------------------- | ------- | ------------------------------------ | -------------------------------------------------------- |
| `apiBase`               | String  | `http://localhost:8000/api/v1`       | Base URL of your Bambuddy API                            |
| `apiKey`                | String  | `""`                                  | `X-API-Key` value. Needs Read Status scope; add Camera scope to allow snapshots. |
| `updateInterval`        | Number  | `15000`                               | Poll interval in ms                                       |
| `showOfflinePrinters`   | Boolean | `true`                                | Set `false` to hide offline printers from the list        |

## Getting an API key

In Bambuddy, go to **Settings → API Keys → Create API Key** and enable at minimum **Read Status** (`can_read_status`). This single permission covers both the printer list/status endpoints and minting the short-lived camera token used for error snapshots — no separate camera scope is needed.

## Notes

- All requests to Bambuddy (including the API key) are made from `node_helper.js`, server-side — your API key is never exposed to the browser.
- Camera snapshots require a short-lived token rather than the API key directly (Bambuddy's snapshot/stream routes are built for `<img>`/`<video>` tags, which can't send custom headers). The module mints one automatically via `POST /printers/camera/stream-token` and proxies the image through its own Express route (`/MMM-Bambuddy/snapshot/:id`), so the browser never sees either the API key or the token.
- Status is derived from the real `GET /printers/{id}/status` response: `connected` (bool), `state` (`IDLE` / `RUNNING` / `PAUSE` / `PREPARE` / `FINISH` / `FAILED` / etc.), and `hms_errors` (a list of error objects, not a single string). These are normalized into `online / printing / offline / error` in `classifyState()` inside `node_helper.js` — tweak that function if your printer reports a state string not covered here.
- Verified against Bambuddy **v0.2.4.9**'s OpenAPI schema. Endpoint paths and response shapes can change between versions; if something breaks after an update, check `http://your-server:PORT/openapi.json` for the current schema.

## License

MIT
