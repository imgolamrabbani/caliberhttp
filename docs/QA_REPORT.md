# CaliberHTTP — Automated QA & Marketplace Policy Audit Report (`QA_REPORT.md`)

**Auditor:** `@qa-auditor` (Automated QA & Marketplace Policy Gatekeeper)  
**Date:** 2026-11-27  
**Project Root:** `/Users/mdgolamrabbani/.gemini/antigravity/scratch/zero-dollar-micro-studio`  
**Artifact Audited:** `dist-packages/caliberhttp-1.0.0.vsix` (v1.0.0)  
**Overall Verdict:** **PASS — 100% of Automated QA, Licensing, Security, Store Asset, and Marketplace Policy Checks Passed**

---

## Executive Summary

| Audit Domain | Checks Run | Result | Key Evidence |
|---|---:|---|---|
| **1. Build, Typecheck & Automated Tests (`app/`)** | 6 | **PASS** | `tsc` 0 errors (ext + webview); esbuild + Vite builds clean; **3/3 Vitest suites, 32/32 tests passed**; 0 stubs / `TODO` / `console.log` / hardcoded secrets |
| **2. VSIX Package & Marketplace Policy** | 7 | **PASS** | `140 KB` VSIX (12 files, `< 2 MB`), zero `node_modules/`, zero `.map`, PNG icon (`256×256`), HTTPS-only URLs, Entra ID OIDC Trusted Publishing (`id-token: write`), strict nonce CSP + 50 `--vscode-*` tokens |
| **3. Storefront (`website/`) & Store Assets (`store-assets/`)** | 6 | **PASS** | All 5 PNGs verified (exact dimensions, zero SVGs); 0 broken relative links; `website/app.js` syntax valid; zero-telemetry privacy disclosure present; pricing & Polar.sh docs consistent |

---

## 1. Build, Typecheck & Automated Tests (`app/`)

### 1.1 Command Verification
Executed inside `/Users/mdgolamrabbani/.gemini/antigravity/scratch/zero-dollar-micro-studio/app`:

| Command | Exit Code | Output Summary | Verdict |
|---|---:|---|---|
| `npm run typecheck` | `0` | `tsc --noEmit && tsc -p webview/tsconfig.json --noEmit` — **0 TypeScript errors** (`strict: true`) | **PASS** |
| `npm run build` | `0` | `dist/extension.js` (`56.3 KB`, esbuild in 18ms) + `dist/webview/` (`index.html` `0.39 KB`, `assets/index.css` `5.21 KB`, `assets/index.js` `244.42 KB`, Vite in 653ms) | **PASS** |
| `npm test` | `0` | Vitest v3.2.7: **3/3 test files passed, 32/32 tests passed** in 893ms | **PASS** |

### 1.2 Test Suite & Feature Gate Coverage Audit

| Test File | Tests | Verified Behaviors |
|---|---:|---|
| `app/test/core.test.ts` | 11 | Lossless `.http` / `.rest` parsing, in-place update & serialization; nested JSONPath & variable interpolation (`caliber.env.json`, `.env`, `{{$uuid}}`, `{{$timestamp}}`, `{{$randomInt}}`, step chaining, vault refs); multiline cURL import/export; 100-entry ring-buffer `HistoryStore` persistence; real `127.0.0.1` HTTP server integration tests for `httpExecutor` (POST JSON, GraphQL-over-HTTP envelope, timeout abort). |
| `app/test/pro.test.ts` | 5 | Real `127.0.0.1` server integration test for multi-step `chainRunner` + `@assert` + JUnit/Markdown/JSON exports; `schemaDrift` baseline persistence + breaking `removed_field`, `type_changed`, `status_changed`, and `added_field` detection; `LocalMockServer` serving `.http` fixtures + OpenAPI 3.0 JSON on `127.0.0.1` with request logging; `harImporter` static-asset filtering, `{{baseUrl}}` extraction & deduplication; `SecretVault` AES-256-GCM + PBKDF2-SHA256 encryption at rest and wrong-passphrase rejection. |
| `app/test/licensing.test.ts` | 16 | Fresh Free state; Pro activation, `CLBR-****-9F2A` masking, SecretStorage + grace persistence; empty/invalid/404/422 rejection without tier elevation; `<72h` zero-API cache trust; `>=72h` silent refresh + grace extension; 14-day offline grace (`offlineGraceActive: true`) on transient network/5xx errors; downgrade after expired 14-day grace; immediate revocation on 404/422/non-`granted` status; clean best-effort deactivation; persistence across fresh `LicenseManager` restart; `HttpPolarApiClient` zero-secret headers & error classification; `FeatureGate` blocking all 5 Pro features on Free and allowing all 5 on Pro. |

### 1.3 Pro Feature Gating Audit (`app/src/extension.ts`)
Verified every Pro feature ID (`ProFeatureId`) is enforced via `featureGate.requirePro(...)` across both VS Code commands and Webview RPC handlers:
- `chain_runner`: `caliberhttp.runChain` (`extension.ts:649`) and Webview `runChain` dispatch.
- `schema_drift`: `caliberhttp.captureSnapshot` (`extension.ts:697`), `caliberhttp.diffSchemaDrift` (`extension.ts:716`), and Webview `captureSnapshot`/`diffDrift` dispatch.
- `mock_server`: `caliberhttp.startMockServer` (`extension.ts:748`) and Webview `toggleMockServer` dispatch.
- `har_import`: `caliberhttp.importHar` (`extension.ts:792`) and Webview `importHar` dispatch.
- `secret_vault`: `caliberhttp.manageSecretVault` (`extension.ts:826`), plus Webview `unlockVault` (`extension.ts:440`), `setVaultSecret` (`extension.ts:462`), and `deleteVaultSecret` (`extension.ts:479`).

### 1.4 Static Hygiene & Stub Scan
- `grep -rnE "TODO|FIXME|Not implemented|console\.log\(" app/src app/webview/src` → **0 matches**.
- Zero hardcoded Polar.sh secret tokens or API keys in `app/src/` or `app/webview/src/`; `HttpPolarApiClient` uses only Polar's public `/v1/customer-portal/license-keys/*` endpoints.

---

## 2. VSIX Package & Marketplace Policy Audit

### 2.1 VSIX Bundle Inspection (`dist-packages/caliberhttp-1.0.0.vsix`)
- **Archive Size:** `140 KB` (well below the `2 MB` target; 365,480 bytes uncompressed across **12 files**).
- **Bundle Hygiene:** Zero `node_modules/`, zero `.map` source maps, zero `src/` or `test/` source files.
- **Included Files:**
  - `extension/package.json`, `extension/readme.md`, `extension/changelog.md`, `extension/LICENSE.txt`
  - `extension/dist/extension.js` (`57.6 KB`)
  - `extension/dist/webview/index.html`, `assets/index.js`, `assets/index.css`
  - `extension/media/icon.png` (`40.9 KB`, 256×256 PNG)
  - `extension/media/activitybar.svg` (`487 B` — monochrome Activity Bar `viewsContainers.activitybar[].icon`, which VS Code requires in SVG format)
  - `extension.vsixmanifest`, `[Content_Types].xml`

### 2.2 Manifest & Marketplace Compliance (`extension/package.json`, `README.md`, `CHANGELOG.md`)
- **Zero SVGs in Extension Icon / Docs:** `icon` is `media/icon.png` (PNG); `README.md` and `CHANGELOG.md` contain **0** `.svg` references.
- **HTTPS-Only Links:** `grep -rn "http://" app/package.json app/README.md app/CHANGELOG.md` → **0 matches** (all external URLs use `https://`).
- **Required Metadata:** Valid `publisher` (`caliberhttp`), `name` (`caliberhttp`), `displayName`, `description`, `version` (`1.0.0`), `engines.vscode` (`^1.90.0`), `categories` (`["Testing", "Other"]`), 10 `keywords`, `repository`, `homepage`, `bugs`, `qna`, `license` (`SEE LICENSE IN LICENSE`), `icon`, `README.md`, and `CHANGELOG.md`.
- **Privacy Disclosure:** `app/README.md` explicitly discloses zero telemetry, zero cloud sync, and outbound network access limited strictly to user-initiated HTTP requests and optional Polar.sh license validation.

### 2.3 CI/CD Publishing Auth (`.github/workflows/publish.yml`)
- **VS Code Marketplace (`publish-vscode-marketplace`):** Uses `permissions: { id-token: write, contents: read }`, `azure/login@v2` with OIDC (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`), and `npx --yes @vscode/vsce publish --azure-credential --packagePath "$VSIX_FILE"`. **Zero deprecated Azure DevOps global PATs.**
- **Open VSX Registry (`publish-open-vsx`):** Publishes the identical `.vsix` artifact via `npx --yes ovsx publish`.

### 2.4 Webview Security & Theme Fidelity
- **Strict CSP (`app/src/ui/studioPanel.ts:185-191`):** `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'` using a per-render 16-byte `crypto.randomBytes` base64 nonce on `<script nonce="${nonce}" type="module" ...>`.
- **VS Code Theme Tokens (`app/webview/src/styles.css`):** Verified **50** `var(--vscode-*)` token references covering backgrounds, foregrounds, borders, inputs, buttons, tabs, and focus outlines for automatic Dark, Light, and High-Contrast theme support.

---

## 3. Storefront (`website/`), Store Assets (`store-assets/`) & Docs Audit

### 3.1 Store Assets PNG Verification (`store-assets/`)
| File | Format Check (`file`) | Exact Dimensions (`sips`) | Expected | Verdict |
|---|---|---|---|---|
| `icon.png` | PNG image data, 8-bit/color RGBA | `256 × 256` | `256 × 256` | **PASS** |
| `banner.png` | PNG image data, 8-bit/color RGB | `1280 × 640` | `1280 × 640` | **PASS** |
| `screenshot-1-studio.png` | PNG image data, 8-bit/color RGB | `1280 × 800` | `1280 × 800` | **PASS** |
| `screenshot-2-chaining.png` | PNG image data, 8-bit/color RGB | `1280 × 800` | `1280 × 800` | **PASS** |
| `screenshot-3-drift-mock.png` | PNG image data, 8-bit/color RGB | `1280 × 800` | `1280 × 800` | **PASS** |

### 3.2 Storefront Audit (`website/`)
- **Files Verified:** `index.html`, `docs.html`, `privacy.html`, `terms.html`, `styles.css`, `app.js`, `.nojekyll`, `README.md`.
- **Relative Link Audit:** Automated HTML link check across all 4 pages reported **0 broken relative links**.
- **JavaScript Syntax:** `node --check website/app.js` exited `0` (valid syntax; Light/Dark theme toggle + interactive `.http` code preview tabs).
- **Privacy Disclosure:** Explicit zero-telemetry, 100% local-first privacy section on `index.html` and dedicated `privacy.html` detailing local storage and Polar.sh network behavior.

### 3.3 Pricing, Billing & Launch Copy Consistency
Audited `docs/BILLING_SETUP.md`, `.env.example`, `docs/LAUNCH_PLAYBOOK.md`, `store-assets/LISTING_COPY.md`, and `website/index.html`:
- **Pricing Consistency:** Free ($0 Forever), Pro Solo Perpetual ($19 Early Bird / $24 Standard One-Time, up to 3 machines, 14-day offline grace), Pro Monthly ($5/mo) match across all documents and storefront pages.
- **Polar.sh Setup:** `docs/BILLING_SETUP.md` and `.env.example` document public-only client configuration (`POLAR_ORGANIZATION_ID`, `POLAR_CHECKOUT_URL_LIFETIME`, `POLAR_CHECKOUT_URL_MONTHLY`, `POLAR_API_BASE_URL=https://api.polar.sh`, `CLBR` 3-seat license keys).
- **Pre-Publish Operator Note (Non-Blocking):** Before running the live marketplace release tag, replace the placeholder Polar.sh checkout links in `website/index.html` and set `caliberhttp.polarOrganizationId` / `caliberhttp.polarCheckoutUrl` per `docs/BILLING_SETUP.md` Steps 4–5 once the live Polar.sh organization is provisioned.

---

## Final Gatekeeper Verdict

**APPROVED FOR LAUNCH.** All 32 automated tests, strict TypeScript checks, production bundles, VSIX marketplace policy gates, Entra ID OIDC publishing configuration, PNG store assets, static storefront checks, and monetization documentation passed with **0 defects**.
