# Zero-Fee Marketplace Demand Hunt — Scout Dossier (`SCOUT_REPORT.md`)

**Prepared by:** `@scout` (Zero-Fee Marketplace Demand Hunter)  
**Date:** 2026-11-27  
**Project Root:** `/Users/mdgolamrabbani/.gemini/antigravity/scratch/zero-dollar-micro-studio`  
**Budget Constraint:** Strict **$0.00 upfront** (zero paid servers, zero paid APIs, zero paid databases, zero paid domains; distribution via $0-fee marketplaces only: Firefox AMO, Microsoft Edge Add-ons, VS Code Marketplace, WordPress.org).

---

## Executive Summary & Ranking Matrix

| Rank | Incumbent Tool | Primary Marketplace(s) | Verified Installs / Users | Last Updated | Displaced / Frustrated Base (Est.) | Clean-Room Replacement Concept | Pro Monetization ($0-Stack) |
|---:|---|---|---:|---|---:|---|---|
| **1** | **Cookie AutoDelete** | Firefox AMO, Edge Add-ons, Chrome (MV2 purged) | **158,102** daily users (AMO) + MV2 Chrome/Edge refugees | `2022-12-12` (~4 yrs) | **300,000 – 600,000+** | **MV3 Privacy & Site-Data Cleaner** (Cookies, CHIPS, `localStorage`, `IndexedDB`, Service Workers) | **$19 one-time** (or $4/mo) |
| **2** | **Simple Tab Groups** | Firefox AMO | **63,075** daily users (AMO) | `2025-04-14` (~19.5 mos) | **60,000 – 120,000+** | **Crash-Proof Workspace & Tab Vault** (MV3 cross-browser + rolling local snapshots) | **$19 one-time** (or $4/mo) |
| **3** | **Todo Tree** (`Gruntfuggly.todo-tree`) | VS Code Marketplace | **7,946,083** installs | `2023-04-12` (~3.6 yrs) | **500,000 – 1,500,000+** | **Ripgrep-Free Local Comment & Task Scanner** (built-in JS/WASM scanner, zero binary path fragility) | **$15 one-time** (or $4/mo) |
| **4** | **Thunder Client** & **REST Client** | VS Code Marketplace | **7,735,879** (Thunder) / **7,785,800** (REST) | Thunder: `2026-11-23` (**2.35/5**); REST: `2022-08-19` | **400,000 – 1,200,000+** | **Local-First `.http` + GUI API Client** (zero login, git-native collections) | **$24 one-time** (or $5/mo) |
| **5** | **Imagus** | Firefox AMO, Chrome (MV2 purged), Edge | **53,341** daily users (AMO) + MV2 Chrome/Edge refugees | `2020-04-13` (~6.6 yrs) | **150,000 – 400,000+** | **Zero-Telemetry MV3 Hover Zoom & Media Inspector** | **$15 one-time** (or $4/mo) |

---

## Ranked Top 5 Zero-Cost Opportunities

### 1. Cookie AutoDelete (MV2 Purged + Unmaintained Privacy Cleaner)
- **Incumbent Tool:** Cookie AutoDelete
- **Target Marketplaces & Verified URLs:**
  - Firefox AMO ($0): https://addons.mozilla.org/en-US/firefox/addon/cookie-autodelete/
  - Microsoft Edge Add-ons ($0): https://microsoftedge.microsoft.com/addons/detail/cookie-autodelete/djkjpnciiommncecmdefpdllknjdmmmo
  - Chrome Web Store: Disabled/purged during Google's Manifest V2 sunset (eligible for CWS later once $5 fee is covered by revenue).
- **Verified User Count & Last Updated Date:**
  - **158,102** average daily users on Firefox AMO (`rating: 4.54/5` across `1,521` reviews; **85** 1-star reviews).
  - **Last Updated:** `2022-12-12` (nearly 4 years without an update).
- **Verified Evidence of Displaced/Frustrated Users:**
  - AMO 1-star review (`2026-11-05`, v3.8.2): *"Windows 11 / Firefox 159.0.1 (64-Bit): Cookie AutoDelete reports 'cookie deleted,' but the cookie is still present in the website data. This is misleading because users may rely on the confirmation and assume the cookie [is gone]."*
  - AMO 1-star review (`2026-10-23`, v3.8.2): *"This extension hasn't been updated for 4 years and no longer works with Firefox. I now use 'Auto-Delete Cookies for Privacy'."*
  - GitHub Issue #1634 (*Update to use manifest V3 to avoid extension shutdown*): https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/issues/1634
- **Estimated Displaced User Base:** **300,000 – 600,000+** (158k active Firefox users hitting modern storage/CHIPS bugs + hundreds of thousands of Chrome/Edge users whose MV2 extension was force-disabled).
- **Why Current Options Fail:**
  1. Built on legacy Manifest V2 background pages, causing Chrome/Edge to disable it.
  2. Fails to clean modern partitioned cookies (CHIPS), `IndexedDB`, `CacheStorage`, and Service Workers reliably on modern Firefox/Chromium, leading to false "deleted" confirmations.
  3. Existing MV3 community forks are often barebones ports without full site-data (`localStorage`/`IndexedDB`/CHIPS) sweeps or clean UX.
- **Clean-Room Replacement Concept & Pricing Split:**
  - **Concept:** Cross-browser **Manifest V3** Privacy & Site-Data Auto-Cleaner built from scratch using `chrome.cookies` (with `partitionKey` CHIPS support), `chrome.browsingData.remove` per-origin, and `chrome.storage.local`.
  - **Free Tier:** Automatic tab-close cookie & `localStorage` cleanup, domain whitelist/greylist, CHIPS partitioned cookie support, manual one-click site wipe, 100% local.
  - **Pro Tier ($19 one-time license or $4/mo):**
    - Scheduled deep sweeps (`IndexedDB`, `CacheStorage`, `ServiceWorkers`, `WebSQL`/Origin Private File System).
    - Regex & wildcard rule profiles (e.g., separate Work / Shopping / Banking rule sets) with encrypted local JSON export/import.
    - Per-Firefox-Container / per-profile isolation rules and a verifiable local Deletion Audit Log (proving which keys/cookies were actually removed).
- **$0-Stack Local-First Feasibility:** **100% feasible.** Pure WebExtensions MV3 APIs (`cookies`, `browsingData`, `tabs`, `storage`, `alarms`, `contextualIdentities` on Firefox). Zero backend servers, zero external APIs. License validation via offline-verifiable signed license key (Ed25519 public key bundled in extension).

---

### 2. Simple Tab Groups (Data-Loss & Tab-Duplication Crisis on Firefox)
- **Incumbent Tool:** Simple Tab Groups (`Drive4ik/simple-tab-groups`)
- **Target Marketplaces & Verified URLs:**
  - Firefox AMO ($0): https://addons.mozilla.org/en-US/firefox/addon/simple-tab-groups/
  - Cross-browser opportunity on Microsoft Edge Add-ons ($0) & Chrome later using MV3 Tab Groups API (`chrome.tabGroups`).
- **Verified User Count & Last Updated Date:**
  - **63,075** average daily users on Firefox AMO (`rating: 4.00/5` across `1,870` reviews; **281** 1-star reviews).
  - **Last Updated:** `2025-04-14` (~19.5 months without an update as of Nov 2026).
- **Verified Evidence of Displaced/Frustrated Users:**
  - AMO 1-star review (`2026-10-26`, v5.3.2): *"It just started duplicating all of my tabs out of nowhere when I open most tab groups the first time from a fresh reboot, it's driving me crazy!!"*
  - AMO 1-star review (`2026-08-28`, v5.3.2): *"completely exploded my browser with genuinely an infinite number of duplicated tabs which would all reopen on launch, had to boot firefox in safe mode to disable!"*
  - AMO 1-star review (`2026-06-30`, v5.3.2): *"Keeps hiding random tabs from random groups every day. Then you have to manually find the hidden tabs..."*
  - GitHub Issue #1273 (wiped groups / 0 tabs bug): https://github.com/Drive4ik/simple-tab-groups/issues/1273
- **Estimated Displaced User Base:** **60,000 – 120,000+** (plus overlapping Session Buddy / Tab Session Manager users suffering from session-loss bugs).
- **Why Current Options Fail:**
  1. Infrequent maintenance leaves it broken whenever Firefox updates session restore or native tab-grouping behavior.
  2. Mutates live tab-hiding state without atomic transactional snapshots, causing catastrophic **0-tab group wipes** or **infinite tab duplication loops** on browser restart.
  3. Poor conflict handling with Firefox's native tab groups.
- **Clean-Room Replacement Concept & Pricing Split:**
  - **Concept:** **Crash-Proof Workspace & Tab Group Vault** — uses immutable, checksummed `IndexedDB` state snapshots before any group switch/restore, preventing both empty-group overwrites and duplicate-tab storms.
  - **Free Tier:** Unlimited local workspaces/tab groups, deduplication guard on startup, auto-discard inactive tabs to save RAM, manual JSON export/import.
  - **Pro Tier ($19 one-time license or $4/mo):**
    - Rolling **Time-Machine Snapshots** (automatic pre-switch & hourly local diffs with one-click point-in-time recovery).
    - Full-text fuzzy search across all archived/closed tab groups and URLs.
    - Rule-based auto-routing (automatically assign tabs matching URL/domain patterns to specific workspaces).
    - AES-GCM encrypted portable vault export (for moving between machines/browsers without cloud lock-in).
- **$0-Stack Local-First Feasibility:** **100% feasible.** Pure WebExtensions `tabs`, `tabGroups` / `tabHide`, `storage`, and `IndexedDB`. Zero backend required.

---

### 3. Todo Tree (`Gruntfuggly.todo-tree` — Broken by VS Code Ripgrep Refactor)
- **Incumbent Tool:** Todo Tree
- **Target Marketplaces & Verified URLs:**
  - VS Code Marketplace ($0): https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree
- **Verified Install Count & Last Updated Date:**
  - **7,946,083** installs (`avgRating: 4.71/5` across `217` ratings).
  - **Last Updated:** `2023-04-12` (~3.6 years without an update).
- **Verified Evidence of Displaced/Frustrated Users:**
  - GitHub Issue #939 (*Failed to find vscode-ripgrep* after VS Code moved internal binaries to `@vscode/ripgrep-universal`): https://github.com/Gruntfuggly/todo-tree/issues/939
  - Error breaking users on VS Code v1.122+ & Remote-SSH: `Todo-Tree: Failed to find vscode-ripgrep - please install ripgrep manually and set 'todo-tree.ripgrep' to point to the executable`.
- **Estimated Displaced User Base:** **500,000 – 1,500,000+** active VS Code developers (out of 7.94M total installs) hitting broken scans on modern VS Code / Remote-SSH / Cursor / Windsurf / VSCodium builds.
- **Why Current Options Fail:**
  1. Hardcodes legacy internal VS Code `node_modules` paths for the `ripgrep` binary, breaking whenever VS Code updates its packaging (`@vscode/ripgrep-universal` / `.asar.unpacked`) or in Remote-SSH / Web environments.
  2. Unmaintained since April 2023; users are forced to manually hack `settings.json` paths or create symlinks on remote servers.
- **Clean-Room Replacement Concept & Pricing Split:**
  - **Concept:** **Ripgrep-Free Local Comment & Task Scanner** — zero external binary path dependencies. Uses VS Code's native `vscode.workspace.findFiles` + streaming Node.js worker / WASM regex engine (respecting `.gitignore` and `.vscodeignore`) so it works identically on Desktop, Remote-SSH, WSL, and VS Code Web.
  - **Free Tier:** Fast zero-config sidebar tree for `TODO`, `FIXME`, `HACK`, `NOTE`, custom tags/colors, `.gitignore` awareness, and one-click migration from `todo-tree.*` settings.
  - **Pro Tier ($15 one-time license or $4/mo):**
    - Git-blame integration (filter TODOs by author, age, or uncommitted/current-branch changes).
    - Local codebase Tech-Debt Dashboard (trends by folder/tag, stale-TODO alerts) + Markdown/CSV/JSON sprint-report export.
    - Custom multi-line & JSDoc/AST-aware comment block extraction.
- **$0-Stack Local-First Feasibility:** **100% feasible.** Pure VS Code Extension Host (TypeScript/Node.js + local `git` CLI if present). Zero cloud, zero paid APIs.

---

### 4. Thunder Client & REST Client (Paywall Backlash + Abandonment Gap)
- **Incumbent Tools:**
  - Thunder Client (`rangav.vscode-thunder-client`)
  - REST Client (`humao.rest-client`)
- **Target Marketplaces & Verified URLs:**
  - Thunder Client: https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client
  - REST Client: https://marketplace.visualstudio.com/items?itemName=humao.rest-client
- **Verified Install Counts & Last Updated Dates:**
  - **Thunder Client:** **7,735,879** installs, `lastUpdated: 2026-11-23`, **`avgRating: 2.35/5`** across `781` ratings (collapsed rating from aggressive paywalling & forced account login).
  - **REST Client:** **7,785,800** installs, `avgRating: 4.91/5` (`388` ratings), **`lastUpdated: 2022-08-19`** (over 4 years without an update).
- **Verified Evidence of Displaced/Frustrated Users:**
  - Thunder Client's 2.35/5 Marketplace rating (781 reviews) is driven by v3.x paywalling local collections/environments and requiring sign-in to access previously saved local data.
  - Recurring `r/vscode` and `r/opensource` threads fleeing Thunder Client's paywalls while noting `humao.rest-client` has been unmaintained since 2022 and lacks a GUI.
- **Estimated Displaced User Base:** **400,000 – 1,200,000+** developers seeking an offline-first, no-login VS Code API client.
- **Why Current Options Fail:**
  1. **Thunder Client:** Forces account login and paywalls basic local developer workflows (collections/environments).
  2. **REST Client:** No GUI, no interactive collection runner, and unmaintained since August 2022.
- **Clean-Room Replacement Concept & Pricing Split:**
  - **Concept:** **Local-First `.http` + GUI API Studio for VS Code** — zero login, stores collections natively as plain-text `.http` / JSON files in the repo (100% Git-friendly) with a fast Webview GUI on top.
  - **Free Tier:** Unlimited local collections, environments, REST/GraphQL/WebSocket testing, `.http` two-way sync, cURL import/export, zero login/telemetry.
  - **Pro Tier ($24 one-time license or $5/mo):**
    - Automated multi-step Request Chaining & Local Assertion Test Runner (CLI/CI-exportable).
    - Local `localhost` OpenAPI 3.1 Mock Server + Response Schema Drift Detector.
    - HAR-to-`.http` batch converter and encrypted local `.env` vault.
- **$0-Stack Local-First Feasibility:** **100% feasible.** Runs 100% inside VS Code Extension Host (`fetch`/`undici` + Webview UI + local filesystem).

---

### 5. Imagus (6.6 Years Unmaintained + Purged from Chrome MV2)
- **Incumbent Tool:** Imagus
- **Target Marketplaces & Verified URLs:**
  - Firefox AMO ($0): https://addons.mozilla.org/en-US/firefox/addon/imagus/
  - Chrome Web Store: Purged during Manifest V2 sunset.
  - Edge Add-ons: Fragmented third-party MV3 ports (e.g., *Imagus 0.9.9 MV3*) requiring manual Developer Mode / "Allow User Scripts" toggles.
- **Verified User Count & Last Updated Date:**
  - **53,341** average daily users on Firefox AMO (`rating: 4.38/5` across `918` reviews; **74** 1-star reviews).
  - **Last Updated:** `2020-04-13` (over **6.6 years** without an update).
- **Verified Evidence of Displaced/Frustrated Users:**
  - AMO 1-star review (`2026-06-15`, v0.9.8.74): *"No way this app needs to see your entire browsing history and info for every website."*
  - AMO 1-star review (`2026-03-23`, v0.9.8.74): *"you CAN'T copy your settings to another computer."*
  - AMO 1-star review (`2025-12-14`, v0.9.8.74): *"pops up effing giant images all the time and cannot be turned off (the options to filter the sites 100% does not work)."*
- **Estimated Displaced User Base:** **150,000 – 400,000+** (53k+ Firefox users + large Chrome/Edge power-user base displaced by MV2 removal).
- **Why Current Options Fail:**
  1. Unmaintained since April 2020; legacy MV2 architecture purged from Chrome.
  2. Broad permissions (`<all_urls>` / history) trigger privacy distrust in 2026 reviews.
  3. Broken site-filtering/exclusion rules and no clean portable settings export.
- **Clean-Room Replacement Concept & Pricing Split:**
  - **Concept:** **Zero-Telemetry MV3 Hover Zoom & Media Inspector** — strict opt-in/per-site permission model where desired, working site-exclusion rules, and clean MV3 content scripts (no Developer Mode required).
  - **Free Tier:** Instant hover zoom for images, GIFs, and HTML5 videos, reliable per-domain allow/block list, keyboard shortcuts (pin, rotate, zoom), JSON settings export/import.
  - **Pro Tier ($15 one-time license or $4/mo):**
    - Visual Custom Sieve/Rule Builder (point-and-click CSS/regex extractor for niche galleries/e-commerce sites).
    - Client-side Bulk Gallery Downloader (bundles album images into a `.zip` locally using JSZip).
    - EXIF/resolution/aspect-ratio HUD overlay + side-by-side image compare mode.
- **$0-Stack Local-First Feasibility:** **100% feasible.** Pure MV3 content scripts + `storage.local` + client-side Canvas/JSZip. Zero backend.

---

## Other Notable Candidates Evaluated (Runner-Ups / Watchlist)
- **YouTube High Definition** (Firefox AMO: `163,787` users, `updated: 2024-09-02`, `275` 1-star reviews): High breakage rate ("It does absolutely NOTHING"), *but* YouTube DOM/player changes require constant maintenance cat-and-mouse.
- **Feedbro** (Firefox AMO: `41,804` users, `updated: 2024-03-27`, `36` 1-star reviews): Closed-source distrust + YouTube Error 153 breakage; smaller TAM than Top 5.
- **Easy Screenshot** (Firefox AMO: `1,266,476` users, `updated: 2023-01-03`, `134` 1-star reviews): High install count, *but* Firefox now ships a strong native screenshot tool (`Cmd/Ctrl+Shift+S`), reducing willingness to pay for Pro.
- **AMP for WordPress** (`wordpress.org/plugins/amp/`: `300,000` active installs, `updated: 2025-04-10`): Stale, *but* AMP itself is deprecated by Google/industry, so demand is shrinking rather than displaced.
