# Changelog

All notable changes to **CaliberHTTP** will be documented in this file.

## [1.0.0] - 2026-11-27

### Added
- **Core Studio (Free Forever):**
  - Lossless `.http` / `.rest` parser & serializer supporting `###`, `@var`, `@name`, `@assert`, and GraphQL-over-HTTP.
  - Visual Request Studio Webview with automatic Dark, Light, and High-Contrast VS Code theme support and strict CSP.
  - Activity Bar Collections TreeView and inline CodeLens (`Send Request`, `Open in Studio`, `Run Chain`).
  - Local environments (`caliber.env.json`, `.env`) and dynamic variables (`{{$uuid}}`, `{{$timestamp}}`, `{{$randomInt}}`).
  - Bidirectional cURL import/export and 100-run local workspace history ring buffer.
- **Pro Automation Suite (Polar.sh Perpetual or Monthly License):**
  - Multi-step sequential Request Chaining (`{{step.response.body.$.path}}`) with `@assert` checks and JUnit XML / Markdown / JSON exports.
  - Response Snapshot Diff & Breaking Schema Drift Detector (`.caliber/snapshots/`).
  - Local `127.0.0.1` Mock Server serving `.http` fixtures or OpenAPI 3.0/3.1 JSON.
  - HAR 1.2 batch importer with automatic `{{baseUrl}}` extraction and deduplication.
  - AES-256-GCM + PBKDF2-SHA256 local Secret Vault (`.caliber/vault.enc`).
  - Offline-resilient Polar.sh license validation with 72h cache and 14-day offline grace period.
