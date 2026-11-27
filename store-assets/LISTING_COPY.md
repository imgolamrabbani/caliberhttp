# CaliberHTTP — Marketplace Listing Copy (`LISTING_COPY.md`)

Ready-to-paste metadata, description, keywords, and compliance disclosures for **Visual Studio Code Marketplace** and **Open VSX Registry** (Cursor, Windsurf, VSCodium, Trae).

---

## 1. Marketplace Metadata

- **Display Name:** `CaliberHTTP — Git-Native .http Studio & Local API Runner`
- **Extension ID:** `caliberhttp.caliberhttp`
- **Short Summary (130 chars max):**
  `Git-native .http Studio & local API runner for VS Code. Two-way GUI + plain-text .http sync. Zero login, zero telemetry.`
- **Categories:** `Testing`, `Other`
- **Tags / Keywords (up to 5 primary + extended):**
  - Primary: `http`, `rest`, `api client`, `graphql`, `.http`
  - Extended: `thunder client`, `rest client`, `postman`, `api testing`, `mock server`, `schema drift`, `har`
- **Assets Included (`store-assets/`):**
  - `icon.png` (256×256 PNG — zero SVGs)
  - `banner.png` (1280×640 PNG)
  - `screenshot-1-studio.png` (1280×800 PNG)
  - `screenshot-2-chaining.png` (1280×800 PNG)
  - `screenshot-3-drift-mock.png` (1280×800 PNG)

---

## 2. Full Marketplace Description (Markdown)

```markdown
# CaliberHTTP — Git-Native `.http` Studio & Local API Runner

**Zero Login. Zero Telemetry. Zero Cloud Lock-In.**

CaliberHTTP is a fast, local-first API client for **VS Code, Cursor, Windsurf, and VSCodium** that combines the best of plain-text `.http` / `.rest` files with a modern two-way Visual Request Studio.

Tired of API clients that paywall your own local collections or force you to create a cloud account? Or `.http` extensions that haven't been updated in years and have no GUI? CaliberHTTP gives you both—100% locally in your workspace.

---

## Why Developers Switch to CaliberHTTP

- **Two-Way `.http` Sync:** Edit requests in plain-text `.http` files *or* in the Visual Request Studio—changes stay losslessly synced while preserving your comments and formatting.
- **Git-Native Forever:** Collections live as `.http` files and `caliber.env.json` / `.env` in your repository. Review API changes in pull requests, branch with your code, and never lose work to a proprietary database.
- **Zero Account, Zero Telemetry:** Works completely offline on localhost/LAN/VPNs. No sign-in wall, no tracking, no background sync.
- **30-Second Onboarding:** Auto-discovers existing `.http` and `.rest` files in your workspace, or creates a working starter collection in one click.

---

## Free Forever Core ($0)

Everything you need for daily API development is **100% free forever**:

- Unlimited local `.http` / `.rest` collections & workspaces
- Visual Request Studio Webview (Method, URL, Params, Headers, Auth, Body)
- Inline Editor CodeLens (`▶ Send Request` | `◫ Open in Studio` | `▶ Run Chain`)
- HTTP/REST + GraphQL-over-HTTP (Query & Variables editor)
- Unlimited local environments (`caliber.env.json`, `.env`, `{{$uuid}}`, `{{$timestamp}}`)
- Full Response Inspector (Status, Latency, Size, Pretty JSON/HTML/Raw, Headers, Save Body)
- Local Request History (last 100 workspace runs) & single cURL import/export
- Native Dark, Light, and High-Contrast VS Code theme support

---

## CaliberHTTP Pro (Optional Local Power Tools)

Upgrade once (**$19 Early Bird** / **$24 Perpetual One-Time** or **$5/mo**) via Polar.sh—no cloud account required, with a **14-day offline grace cache**:

- **Multi-Step Request Chaining & `@assert` Test Runner:** Reference prior responses (`{{login.response.body.$.token}}`), validate `@assert status == 200`, `@assert latency < 200`, `@assert body.$.id exists`, and export JUnit XML, Markdown, or JSON reports.
- **Response Snapshot Diff & Schema Drift Detector:** Pin a JSON baseline and catch breaking field removals or type changes before they hit production.
- **Local `127.0.0.1` Mock Server:** Serve instant local mock routes directly from `.http` fixtures or OpenAPI 3.0/3.1 JSON specs.
- **HAR-to-`.http` Batch Importer:** Convert Chrome/Firefox DevTools `.har` captures into clean, deduplicated `.http` collections with `{{baseUrl}}` extraction.
- **AES-256-GCM Local Secret Vault:** Encrypt API keys and tokens in `.caliber/vault.enc` so secrets stay safe in Git.

---

## Quick `.http` Example

```http
### Login User
@name login
POST {{baseUrl}}/v1/auth/login
Content-Type: application/json

{
  "email": "{{userEmail}}",
  "role": "admin"
}

@assert status == 200
@assert body.$.token exists

### Get Profile (Chained)
GET {{baseUrl}}/v1/me
Authorization: Bearer {{login.response.body.$.token}}
```

---

## Privacy & Security Disclosure

CaliberHTTP collects **zero telemetry**, **zero analytics**, and **zero crash reports**. The extension makes **zero outbound network requests** except:
1. HTTP/GraphQL requests explicitly triggered by you.
2. Optional license key activation/validation against `https://api.polar.sh` when you enter a CaliberHTTP Pro license key.

All collections, environments, request history, and encrypted secrets remain strictly on your local machine.
```

---

## 3. Reviewer Notes (VS Code Marketplace & Open VSX)

- **No Native Binaries:** Pure TypeScript / Node.js 20+ (`fetch`, `node:http`, `node:crypto`, `node:fs/promises`) + React Webview.
- **Strict Content Security Policy:** Webview uses `default-src 'none'` with per-render cryptographic nonces (`script-src 'nonce-...'`) and VS Code CSS theme variables.
- **No Secret Keys Shipped:** Polar.sh license validation uses the public Customer Portal License Keys API (`https://api.polar.sh/v1/customer-portal/license-keys/*`); license keys are stored in VS Code `ExtensionContext.secrets` (OS Keychain).
- **No SVGs:** All extension icons and README/listing images are PNGs.
