# CaliberHTTP — Launch Playbook & Growth Kit (`LAUNCH_PLAYBOOK.md`)

**Budget:** $0.00 upfront  
**Distribution:** VS Code Marketplace ($0) · Open VSX Registry ($0) · GitHub Pages ($0) · Polar.sh ($0/mo)

---

## 1. Launch Day Checklist

### Pre-Flight Verification
- [ ] Verify `dist-packages/caliberhttp-*.vsix` installs cleanly in fresh VS Code & Cursor profiles.
- [ ] Confirm `app/media/icon.png` matches `store-assets/icon.png` (256×256 PNG, zero SVGs).
- [ ] Confirm `website/` is live on GitHub Pages (`https://<username>.github.io/<repo>/`) with Polar.sh checkout links active.
- [ ] Confirm `privacy.html`, `terms.html`, and `docs.html` load cleanly on mobile and desktop with working Light/Dark toggle.

### Marketplace Publishing ($0)
1. **VS Code Marketplace:** Publish via `vsce publish --azure-credential` (Microsoft Entra ID) or GitHub Actions Trusted Publishing (OIDC) — avoid legacy global PATs.
2. **Open VSX Registry:** Publish the exact same `.vsix` via `npx ovsx publish -p <TOKEN>` so Cursor, Windsurf, VSCodium, and Trae users can install natively.
3. **GitHub Release:** Create `v1.0.0` tag and attach the `.vsix` + SHA-256 checksum for air-gapped / enterprise manual installs.

### Community Launch Posts (Day 1–3)
- [ ] **Hacker News (`Show HN`):**
  - Title: `Show HN: CaliberHTTP – Git-native .http studio and local API runner for VS Code (zero login)`
  - Focus on the engineering angle: lossless two-way `.http` parser/serializer, zero-dependency Node 20 `fetch` + `node:http` mock server, and why local-first plain-text workflows beat cloud-locked API clients.
- [ ] **Reddit (`r/vscode`, `r/webdev`, `r/opensource`):**
  - Lead with a short 30-second GIF/screenshot (`screenshot-1-studio.png`) showing inline CodeLens + split Visual Studio + `.http` two-way sync.
  - State clearly up front: Free core is unlimited forever (collections, environments, GraphQL, cURL, history), Pro is optional one-time ($19 early bird / $24 standard) for chaining/assertions, schema drift, local mock server, HAR batch import, and AES-256-GCM vault.

---

## 2. Value-First Launch Replies (Mapped to Verified Marketplaces & Discussions)

> **Rule:** Never spam. Always disclose that you built CaliberHTTP, explain the exact workflow fit, and respect users who prefer pure CLI/text tools.

### Target A: Displaced Thunder Client Users (Paywalled Local Collections & Forced Login)
- **Verified Reference:** Thunder Client VS Code Marketplace (`2.35/5` across `781` ratings; `7,735,879` installs) — https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client
- **Community Context:** Recurring `r/vscode` threads discussing Thunder Client paywalling collections/environments and requiring sign-in.
- **Value-First Reply Template:**
  > *"If you want a GUI inside VS Code without forced sign-in or paywalled local collections, I built **CaliberHTTP** specifically around that gap. Every request is stored as a plain-text `.http` file in your repo (so you're never locked into a proprietary format), and you get a split Visual Request Builder + JSON Response Inspector on top. Unlimited local collections, environments (`caliber.env.json` / `.env`), GraphQL, and cURL import/export are free forever with zero telemetry or login. Happy to hear what you'd need if you're migrating off Thunder Client."*

### Target B: Displaced REST Client Users (Unmaintained Since Aug 2022 + No GUI)
- **Verified Reference:** REST Client (`humao.rest-client`, `7,785,800` installs, last updated `2022-08-19`) — https://marketplace.visualstudio.com/items?itemName=humao.rest-client
- **GitHub Issue Context:** Users in `Huachao/vscode-restclient` issues looking for actively maintained `.http` runners compatible with modern VS Code, Cursor, and Windsurf.
- **Value-First Reply Template:**
  > *"If you already have `.http` / `.rest` files in your repos, **CaliberHTTP** reads and runs standard `###`, `@var`, and `@name` syntax out of the box—no migration needed. It also adds a two-way Visual Studio panel when you want to tweak headers/bodies without remembering syntax, plus optional Pro features like `@assert` chaining, schema drift detection, and a local `127.0.0.1` mock server. Works on both VS Code Marketplace and Open VSX (Cursor/Windsurf)."*

### Target C: `r/webdev` & `r/vscode` Local-First / Postman-Escape Threads
- **Value-First Reply Template:**
  > *"We kept running into the same issue with cloud-heavy API clients on VPN/internal services. If you want something that stays 100% inside VS Code with Git-reviewable `.http` files, check out **CaliberHTTP**. Free tier covers unlimited local collections, `.env` / `caliber.env.json` environments, GraphQL, and cURL. If you also need CI-exportable `@assert` chains, JSON schema drift diffs, or a quick `127.0.0.1` mock server from `.http` / OpenAPI specs, there's an optional one-time Pro license (no subscription required)."*

---

## 3. "Reinvest First $5" Growth Playbook

Under the strict **$0.00 upfront** rule, CaliberHTTP launches at zero cost. The moment the first **$19 Early Bird** or **$5/mo** Polar.sh sale lands, follow this exact reinvestment ladder:

1. **First $5 → Chrome Web Store Developer Registration ($5 one-time):**
   - Unlocks Chrome Web Store distribution for the studio's next $0-stack products identified in `docs/SCOUT_REPORT.md` (e.g., the **MV3 Privacy & Site-Data Cleaner** replacing Cookie AutoDelete, or the **Crash-Proof Workspace & Tab Vault** replacing Simple Tab Groups).
   - Edge Add-ons ($0) and Firefox AMO ($0) remain free, so $5 unlocks all 3 major browser stores.
2. **Next $10–$12 → Custom `.dev` / `.com` Domain (Cloudflare Registrar at-cost):**
   - Point `caliberhttp.dev` (or studio domain) to the existing $0 GitHub Pages / Cloudflare Pages static site for stronger brand trust in enterprise security reviews.
3. **Next $0–$20 → Automated Demo & Social Proof:**
   - Record a 45-second MP4/WebM product demo for the GitHub README and `website/index.html`, and publish a `caliber-cli` companion npm package ($0) so teams can run `.http` `@assert` chains in GitHub Actions.
