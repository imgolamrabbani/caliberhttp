# Product & Technical Specification — CaliberHTTP (`SPEC.md`)

**Author:** `@strategist` (Product & Monetization Architect)  
**Date:** 2026-11-27  
**Project Root:** `/Users/mdgolamrabbani/.gemini/antigravity/scratch/zero-dollar-micro-studio`  
**Budget Constraint:** Strict **$0.00 upfront** (Zero-fee marketplaces, GitHub Pages / Cloudflare Pages, Polar.sh $0/mo MoR, 100% local-first processing).  
**Status:** Ready for Checkpoint 1 Approval.

---

## 1. Strategic Stress-Test & Selection Verdict

All 5 opportunities surfaced in [`SCOUT_REPORT.md`](./SCOUT_REPORT.md) were stress-tested against four weighted studio criteria: **Genuine Willingness to Pay (30%)**, **Verified Displaced Demand (25%)**, **Store/Permission/Platform Safety (20%)**, and **Single-Sprint Zero-Stub Polish (25%)**.

| Rank | Opportunity (Incumbent) | WTP (30%) | Demand (25%) | Platform Safety (20%) | Zero-Stub Scope (25%) | Weighted Score | Verdict |
|---:|---|---:|---:|---:|---:|---:|---|
| **#1** | **Local-First `.http` + GUI API Studio** (Thunder Client & REST Client) | **9.5** | **9.5** | **9.5** | **8.5** | **9.25** | **SELECTED (#1 WINNER)** |
| **#2** | **Ripgrep-Free Comment & Task Scanner** (Todo Tree) | 6.5 | 8.5 | **9.5** | **9.5** | **8.30** | **RUNNER-UP (#2)** |
| **#3** | **Crash-Proof Workspace & Tab Vault** (Simple Tab Groups) | 7.0 | 6.5 | 6.5 | 8.0 | 7.08 | Eliminated |
| **#4** | **MV3 Privacy & Site-Data Cleaner** (Cookie AutoDelete) | 2.0 | 7.0 | 4.0 | 8.0 | 5.05 | Eliminated |
| **#5** | **MV3 Hover Zoom & Media Inspector** (Imagus) | 3.0 | 5.0 | 3.0 | 4.0 | 3.70 | Eliminated |

### Why #3–#5 Were Eliminated
- **Cookie AutoDelete (Eliminated — Score 5.05):** Classic monetization trap. Its audience is heavily Firefox privacy/FOSS purists who ideologically resist paying for closed-source cleaners. Free MV3 forks (*Auto-Delete Cookies for Privacy*) already exist, and native browser features (Firefox Total Cookie Protection + Clear-on-Exit) cannibalize the core value proposition. Broad `cookies` + `<all_urls>` permissions also create high review friction.
- **Imagus (Eliminated — Score 3.70):** Casual browsing utilities have low willingness to pay (*Hover Zoom+* is free), `<all_urls>` content-script injection triggers the exact privacy distrust cited in 2026 AMO 1-star reviews, and maintaining hundreds of fragile third-party website regex sieves is a perpetual maintenance trap unsuitable for a clean v1.0.
- **Simple Tab Groups (Eliminated — Score 7.08):** Real pain and decent WTP, *but* smaller displaced base (63k AMO users) than VS Code's 7.8M+ ecosystems, messy cross-browser API divergence (`tabs.hide` on Firefox vs. `chrome.tabGroups` on Chromium), growing competition from native Edge Workspaces / Firefox Tab Groups, and heavier AMO source-code review overhead.

### Why Runner-Up Is #2 (`Todo Tree` Replacement)
- **7.95M installs** actively breaking on VS Code v1.122+ & Remote-SSH due to `@vscode/ripgrep-universal`, ultra-clean single-sprint scope, and zero permission friction. It is the ideal fallback if the studio pivots, losing #1 solely because developer willingness to pay for a TODO comment scanner ($15) is materially lower than for a daily-driver API client and test runner ($24).

### Why #1 Wins (`CaliberHTTP` — Thunder Client & REST Client Replacement)
1. **Highest Proven Willingness to Pay:** API clients are one of the highest-converting developer micro-product categories (validated by Postman, Bruno Golden Edition at $19 one-time, and Yaak at $5/mo). Developers already pay for API tooling and gladly pay **$19–$24 one-time** to escape forced logins and cloud lock-in.
2. **Massive Dual-Displaced Demand:** Thunder Client (**7.74M installs**) collapsed to **2.35/5 across 781 reviews** after paywalling local collections and forcing sign-in; REST Client (**7.79M installs**) has been abandoned since August 2022 and has no GUI.
3. **Zero-Fee Dual Distribution:** Ships on **VS Code Marketplace ($0)** AND **Open VSX Registry ($0)** — automatically reaching VS Code, Cursor, Windsurf, VSCodium, and Trae users with zero browser permission warnings.
4. **Crisp, Zero-Stub v1.0 Scope:** By focusing cleanly on **HTTP/REST + GraphQL-over-HTTP + `.http` two-way sync** (deferring raw WebSocket/gRPC to v1.1), every Free and Pro feature runs 100% locally in Node.js 20+ (`fetch`, `node:http`, `node:crypto`) with zero native binaries and full automated test coverage.

---

## 2. Product Identity, Positioning & Pricing

- **Product Name:** **CaliberHTTP** (Trademark-clean; verified zero collision on VS Code Marketplace, Open VSX, and GitHub).
- **Extension ID:** `caliberhttp.caliberhttp` (or studio publisher ID `<publisher>.caliberhttp`).
- **Tagline:** *Git-Native `.http` Studio & Local API Runner for VS Code. Zero Login. Zero Cloud Lock-In.*
- **Target Marketplaces ($0):**
  1. **Visual Studio Code Marketplace** ($0)
  2. **Open VSX Registry** ($0 — reaches Cursor, Windsurf, VSCodium, Trae)
- **Pricing (Polar.sh $0/mo Merchant of Record):**
  - **CaliberHTTP Free:** **$0 forever** (No account, no login, no telemetry, unlimited local collections & environments).
  - **CaliberHTTP Pro — Solo Perpetual License:** **$24 one-time** (*Launch Early Bird: $19 one-time*, includes all v1.x updates, up to 3 personal machines).
  - **CaliberHTTP Pro — Monthly (Optional):** **$5/month** (cancel anytime via Polar.sh customer portal).

### Free vs. Pro Feature Matrix

| Capability | Free ($0 Forever) | Pro ($24 One-Time / $5/mo) |
|---|---|---|
| **Zero-Login Local `.http` / `.rest` Collections** (Git-native plain text) | Unlimited | Unlimited |
| **Visual Request Studio Webview** (Method, URL, Params, Headers, Auth, Body) | Full | Full |
| **Two-Way `.http` Sync & Inline CodeLens** (`Send Request` / `Open in Studio`) | Full | Full |
| **HTTP/REST + GraphQL-over-HTTP** (Query + Variables editor) | Full | Full |
| **Local Environments & Variables** (`caliber.env.json`, `.env`, `{{$uuid}}`, `{{$timestamp}}`) | Unlimited | Unlimited |
| **Response Inspector** (Status, Latency, Size, Pretty JSON/HTML/Raw, Headers, Save Body) | Full | Full |
| **Local Request History** (Last 100 workspace runs) & **Single cURL Import/Export** | Full | Full |
| **Multi-Step Request Chaining & Assertion Test Runner** (`@assert`, `{{step.response.body.$.token}}`, JUnit/MD/JSON export) | — | **Included** |
| **Response Snapshot Diff & Schema Drift Detector** (Pin JSON baseline, detect breaking type/field drift) | — | **Included** |
| **Local `localhost` Mock Server** (Serve mock routes from `.http` fixtures or OpenAPI 3.0/3.1 JSON) | — | **Included** |
| **HAR-to-`.http` Batch Importer** (Browser DevTools `.har` → clean deduplicated `.http` collection) | — | **Included** |
| **AES-256-GCM Local Secret Vault** (Git-safe encrypted `.caliber/vault.enc` for API keys/tokens) | — | **Included** |

**Why This Gate Converts Without Backlash:** Everything Thunder Client users were furious about losing (unlimited local collections, environments, offline `.http` files, zero login) is **100% Free Forever**. Pro monetizes high-leverage engineering automation (chaining/assertions, schema drift, local mock server, HAR batch import, encrypted Git vault) that replaces Postman/Insomnia/Prism workflows locally.

---

## 3. Local-First Technical Architecture

### Core Stack ($0 Infrastructure)
- **Extension Host:** TypeScript 5.x (`strict: true`), VS Code Extension API (`^1.90.0`), Node.js 20+ built-ins (`fetch`, `node:http`, `node:crypto`, `node:fs/promises`, `node:path`), bundled via `esbuild` into `dist/extension.js`.
- **Webview Studio UI:** React 19 + TypeScript + Vite single-bundle build into `dist/webview/`, styled exclusively with VS Code CSS theme tokens (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-background`, etc.) for automatic **Dark, Light, and High-Contrast** theme fidelity. Strict CSP (`default-src 'none'; script-src 'nonce-...'`).
- **Testing:** Vitest (unit & integration tests for parser, serializer, interpolation, chaining/assertions, schema drift, mock server, HAR importer, AES-256-GCM vault, and Polar license state machine) + `@vscode/test-electron` (smoke test extension activation & commands).
- **Zero External Dependencies at Runtime:** No remote telemetry, no database server, no native C++ addons, no paid APIs.

### Exact Repository Structure
```text
zero-dollar-micro-studio/
├── app/                              # VS Code Extension + Webview Studio source
│   ├── package.json                  # Extension manifest (contributions, commands, menus, activation)
│   ├── tsconfig.json                 # Strict TypeScript config (extension host)
│   ├── esbuild.config.mjs            # Extension host bundler -> dist/extension.js
│   ├── vitest.config.ts              # Unit & integration test config
│   ├── src/
│   │   ├── extension.ts              # Activation, command registration, TreeView, CodeLens, Webview
│   │   ├── core/
│   │   │   ├── httpParser.ts         # Lossless .http/.rest parser & serializer (###, @var, @name, @assert)
│   │   │   ├── interpolator.ts       # {{var}}, .env, caliber.env.json, dynamic vars, step chaining refs
│   │   │   ├── httpExecutor.ts       # Node fetch runner with timing, redirects, timeout, abort controller
│   │   │   ├── curlCodec.ts          # cURL <-> HttpRequestBlock import/export
│   │   │   └── historyStore.ts       # Workspace local ring-buffer history (100 entries)
│   │   ├── pro/
│   │   │   ├── chainRunner.ts        # Multi-step sequential runner + JSONPath assertions + JUnit/MD export
│   │   │   ├── schemaDrift.ts        # JSON schema inference, snapshot persistence, breaking-change diff
│   │   │   ├── mockServer.ts         # Local 127.0.0.1 node:http mock server (.http fixtures & OpenAPI JSON)
│   │   │   ├── harImporter.ts        # HAR 1.2 -> deduplicated .http generator with {{baseUrl}} extraction
│   │   │   └── secretVault.ts        # AES-256-GCM + PBKDF2-SHA256 encrypted .caliber/vault.enc manager
│   │   ├── licensing/
│   │   │   ├── licenseManager.ts     # Polar.sh validation, SecretStorage, 14-day offline grace cache
│   │   │   └── featureGate.ts        # Centralized Pro feature guard + graceful upgrade prompt
│   │   └── ui/
│   │       ├── collectionTree.ts     # Sidebar Activity Bar TreeDataProvider (.http files, requests, envs)
│   │       ├── codeLensProvider.ts   # Inline "Send Request" | "Open in Studio" | "Run Chain" CodeLens
│   │       └── studioPanel.ts        # WebviewPanel manager with typed RPC message bridge
│   ├── webview/                      # React + Vite Webview UI
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx               # Split Request/Response Studio + Onboarding + Pro Tool tabs
│   │       ├── components/           # RequestBar, ParamsTable, HeadersTable, AuthTab, BodyEditor,
│   │       │                         # ResponseViewer, ChainReportView, DriftDiffView, MockServerBar
│   │       └── vscodeApi.ts          # Typed postMessage RPC client
│   └── test/                         # Vitest unit & integration test suites
├── dist-packages/                    # Built .vsix packages ready for VS Code Marketplace & Open VSX
├── website/                          # Static $0 landing page + docs + privacy policy (GitHub/CF Pages)
├── store-assets/                     # 128x128/256x256 PNG icon, marketplace banners, screenshots, copy
└── docs/
    ├── SCOUT_REPORT.md
    ├── SPEC.md
    └── LAUNCH_CHECKLIST.md           # Generated in Phase 3/4
```

### Core Data Models (TypeScript Contracts)
```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface AssertionRule {
  target: 'status' | 'latency' | `header.${string}` | `body.${string}`;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'exists';
  expected?: string | number | boolean;
}

export interface HttpRequestBlock {
  id: string;                 // Stable hash or @name identifier
  name: string;               // Display title from `### Name` or `@name`
  method: HttpMethod;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  body?: string;
  graphqlVariables?: string;  // Optional JSON variables for GraphQL-over-HTTP
  assertions: AssertionRule[];
  lineStart: number;          // 0-based line in .http file for CodeLens & two-way sync
  lineEnd: number;
}

export interface ExecutionResult {
  requestId: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
  timestampIso: string;
  error?: string;
}

export interface DriftFinding {
  path: string;               // e.g., "$.data.user.email"
  severity: 'breaking' | 'warning' | 'info';
  kind: 'removed_field' | 'type_changed' | 'added_field' | 'status_changed';
  expected: string;
  actual: string;
}

export interface LicenseState {
  tier: 'free' | 'pro';
  keyMask?: string;           // e.g., "CLBR-****-9F2A"
  activationId?: string;
  validatedAtIso?: string;
  graceUntilIso?: string;     // validatedAt + 14 days
  offlineGraceActive: boolean;
}
```

### UI/UX Flows & 30-Second Zero-Friction Onboarding
1. **Install → Instant Value (<30 seconds):**
   - Clicking the **CaliberHTTP** Activity Bar icon opens the Collections sidebar.
   - **If workspace has `.http`/`.rest` files:** Auto-discovers and lists all collections/requests immediately, and attaches inline `▶ Send Request | ◫ Open in Studio` CodeLens lenses in the editor.
   - **If workspace has no `.http` files:** Shows a clean 2-button welcome state: **"Create Starter Collection (`api.http`)"** (pre-populated with a working public echo request + chained example) and **"Import cURL / HAR"**. Zero sign-in screens, zero modal nags.
2. **Keyboard-First Studio Loop:**
   - `Cmd/Ctrl + Enter` sends the active request.
   - Editing URL/Headers/Body in the Webview writes cleanly back to the underlying `.http` file (preserving comments and formatting); editing the `.http` file in the text editor updates the Webview live.
   - Environment selector sits permanently in the top bar (`No Env`, `dev`, `staging`, `prod` from `caliber.env.json` + `.env`).
3. **Theme & Accessibility:**
   - 100% VS Code CSS variables (`--vscode-*`) with semantic HTTP method badges (`GET` green, `POST` blue, `PUT` amber, `DELETE` red) calibrated for WCAG AA contrast in both Light and Dark VS Code themes.

---

## 4. Polar.sh License Validation & Offline-Grace Architecture

CaliberHTTP uses **Polar.sh** ($0/mo Merchant of Record; transaction fee only on actual sales) with its public client-side Customer Portal License Keys API — **no secret API keys are ever shipped in the extension**.

### Validation Flow
1. **Activation (`CaliberHTTP: Activate Pro License`):**
   - User pastes their Polar.sh license key (purchased via the `$0` GitHub Pages landing page → Polar Checkout Link).
   - Extension sends `POST https://api.polar.sh/v1/customer-portal/license-keys/activate` with `{ key, organization_id, label: os.hostname() }`.
   - On HTTP 200 (`status === "granted"`), stores the raw license key in VS Code's OS-Keychain-backed `context.secrets` (`caliberhttp.licenseKey`) and stores `{ activationId, keyMask, validatedAtIso, graceUntilIso }` in `context.globalState`.
2. **Silent Re-Validation & 14-Day Offline Grace:**
   - On activation or Pro feature invocation, if `now - validatedAtIso < 72 hours`, trusts the cached state immediately (zero startup latency, zero network calls).
   - If `>= 72 hours` elapsed, performs an async non-blocking `POST https://api.polar.sh/v1/customer-portal/license-keys/validate` with `{ key, organization_id, activation_id }`.
   - **Network/Offline Failure:** Never downgrades the user while `now <= graceUntilIso` (14 days from last successful validation). Shows a subtle non-blocking status bar indicator (`Pro (Offline Grace)`).
   - **Explicit Revocation:** Only revokes Pro if Polar returns `404`/`422` or `status !== "granted"`.
3. **Deactivation:** `CaliberHTTP: Deactivate License` calls `/v1/customer-portal/license-keys/deactivate` so users can move seats between machines cleanly.
4. **Deterministic Testing:** `LicenseManager` accepts an injected `PolarApiClient` interface so unit/integration tests cover Activation, Valid Cache, 72h Refresh, 14-Day Offline Grace, Expired Grace, and Revocation with 0 live HTTP calls.

---

## 5. Marketplace Compliance & Publishing Checklist

### Visual Studio Code Marketplace ($0)
- [ ] **No SVGs Allowed:** Extension icon (`store-assets/icon.png`, 256×256 PNG) and all `README.md` / `CHANGELOG.md` images MUST be PNG/WebP — zero `.svg` files (`vsce package` rejects user SVGs).
- [ ] **HTTPS-Only Remote Links:** All external URLs in `package.json`, `README.md`, and `CHANGELOG.md` use `https://`.
- [ ] **2026 Auth Standard (No Legacy Global PATs):** Configure **Trusted Publishing (OIDC)** via GitHub Actions (`id-token: write`) or local **Microsoft Entra ID** (`vsce publish --azure-credential`) ahead of the December 1, 2026 global Azure DevOps PAT retirement.
- [ ] **Required `package.json` Metadata:** `publisher`, `name`, `displayName`, `description`, `version`, `engines.vscode`, `categories: ["Testing", "Other"]`, `keywords` (`http`, `rest`, `api client`, `graphql`, `.http`, `postman`, `thunder client`), `repository`, `homepage`, `license`, `icon`, `qna`.
- [ ] **Strict Privacy & Security Disclosure:** Explicitly state in `README.md` and `website/privacy.html` that CaliberHTTP collects **zero telemetry**, makes **zero network requests** except user-initiated HTTP requests and optional Polar.sh license key validation, and stores all collections/secrets locally.
- [ ] **Bundle Hygiene:** `.vscodeignore` excludes `src/`, `test/`, `webview/src/`, `node_modules/`, `.map` files so the `.vsix` stays lean (<2 MB).

### Open VSX Registry ($0 — Cursor / Windsurf / VSCodium)
- [ ] Register publisher namespace on `open-vsx.org` ($0, Eclipse Foundation account) and publish the identical `.vsix` via `npx ovsx publish`.

### Website & Checkout ($0)
- [ ] Static landing page (`./website/`) deployed to **GitHub Pages** or **Cloudflare Pages** ($0) featuring interactive feature comparison, VS Code Marketplace + Open VSX install buttons, Polar.sh checkout links ($19 Early Bird / $24 Standard / $5/mo), documentation, and privacy policy.
