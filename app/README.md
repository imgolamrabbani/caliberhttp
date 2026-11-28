# CaliberHTTP — Git-Native `.http` Studio & Local API Runner

**Git-Native `.http` Studio & Local API Runner for VS Code. Zero Login. Zero Cloud Lock-In.**

CaliberHTTP combines the plain-text Git ergonomics of `.http` / `.rest` files with a fast, theme-native Visual Request Studio directly inside VS Code, Cursor, Windsurf, and VSCodium.

## Why Developers Switch to CaliberHTTP

- **100% Local-First & Zero Login:** Unlimited local `.http` collections, environments, and history — forever free, no account required.
- **True Two-Way `.http` Sync:** Edit visually in the Studio or directly in plain text with inline `▶ Send Request | ◫ Open in Studio` CodeLens actions.
- **GraphQL-over-HTTP Built In:** Write GraphQL queries and JSON variables side-by-side.
- **Theme-Native UI:** Built strictly with VS Code CSS tokens (`--vscode-*`) for crisp Light, Dark, and High-Contrast fidelity.

## Free vs. Pro

| Capability | Free ($0 Forever) | Pro ($24 One-Time / $5 mo) |
|---|---|---|
| Unlimited local `.http` / `.rest` collections | Included | Included |
| Visual Request Studio + Two-Way Sync + CodeLens | Included | Included |
| HTTP/REST + GraphQL-over-HTTP | Included | Included |
| Local Environments (`caliber.env.json`, `.env`, `{{$uuid}}`, `{{$timestamp}}`) | Included | Included |
| Response Inspector, 100-Run History, cURL & OpenAPI 3.x JSON Importer | Included | Included |
| Multi-Step Request Chaining, `@assert` & JUnit/Markdown/JSON Export | — | Included |
| Response Snapshot Diff & Breaking Schema Drift Detector | — | Included |
| Local `127.0.0.1` Mock Server (`.http` fixtures & OpenAPI 3.0/3.1 JSON) | — | Included |
| HAR-to-`.http` Batch Importer | — | Included |
| AES-256-GCM Git-Safe Secret Vault (`.caliber/vault.enc`) | — | Included |

## 30-Second Quickstart

1. Open the **CaliberHTTP** icon in the VS Code Activity Bar.
2. Click **Create Starter Collection (`api.http`)** or open any existing `.http` / `.rest` file.
3. Press **`Cmd/Ctrl + Enter`** in the Studio (or click **▶ Send Request** CodeLens) to execute your first request.

## Privacy & Security Disclosure

- **Zero Telemetry:** CaliberHTTP collects zero analytics, crash reports, or usage tracking.
- **Zero Cloud Sync:** All `.http` files, environments, snapshots, history, and encrypted vaults stay strictly on your local disk.
- **Network Access:** CaliberHTTP makes **zero network requests** except (1) HTTP requests you explicitly send and (2) optional Polar.sh license key validation if you activate a Pro license (with a 14-day offline grace cache).

Full documentation & privacy policy: [https://caliberhttp.github.io/caliberhttp/](https://caliberhttp.github.io/caliberhttp/)
