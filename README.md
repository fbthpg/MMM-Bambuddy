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
git clone https://github.com/fbthpg/MMM-Bambuddy.git
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
		apiBase: "http://192.168.1.X:8000/api/v1", // your Bambuddy server
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

See [Bambuddy: API Keys & Webhooks](https://wiki.bambuddy.cool/features/api-keys/). Go to **Settings → API Keys → Create API Key**, and select at minimum the **Read Status** permission. If you want error snapshots to render, the key also needs camera/snapshot access.

## Notes

- All requests to Bambuddy (including the API key) are made from the `node_helper.js`, server-side — your API key is never exposed to the browser.
- Camera snapshots are proxied through the module's own Express route (`/MMM-Bambuddy/snapshot/:id`) for the same reason.
- Status is normalized from Bambuddy's raw `status` field and `hms_status` into one of `online / printing / offline / error`. If your Bambuddy version reports different status strings, you may need to tweak `classifyState()` in `node_helper.js`.

## License

MIT
