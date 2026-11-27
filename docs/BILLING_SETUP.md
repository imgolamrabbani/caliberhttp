# CaliberHTTP — Polar.sh Billing & License Key Setup ($0/mo MoR)

CaliberHTTP uses **Polar.sh** as its $0/month Merchant of Record (global tax/VAT handled automatically; transaction fee only on actual sales) and Polar's **public Customer Portal License Keys API**. **Zero secret API tokens are shipped inside the VS Code extension.**

---

## Step 1: Copy Your Organization ID
1. Open [polar.sh/dashboard](https://polar.sh/dashboard) and select your CaliberHTTP organization.
2. Go to **Settings → General**.
3. Copy the **Organization ID** (UUID format, e.g. `123e4567-e89b-12d3-a456-426614174000`).
4. Paste it into `.env` as `POLAR_ORGANIZATION_ID`.

---

## Step 2: Create the License Key Benefit
1. In the left sidebar, go to **Products → Benefits → + New Benefit**.
2. Choose **License Keys** and configure:
   - **Description:** `CaliberHTTP Pro License (Up to 3 machines)`
   - **Prefix:** `CLBR`
   - **Activation Limit:** `3` (allows a developer to use Pro on up to 3 personal machines and move seats via `CaliberHTTP: Deactivate License`)
   - **Expiration:** `Never` (for perpetual licenses; Polar automatically revokes keys if a monthly subscription cancels)
3. Save the benefit.

---

## Step 3: Create CaliberHTTP Pro Products
Go to **Products → + New Product** and create:

1. **CaliberHTTP Pro — Solo Perpetual (One-Time)**
   - **Pricing:** One-time purchase — **$19 USD** (Launch Early Bird) or **$24 USD** (Standard)
   - **Benefits:** Attach `CaliberHTTP Pro License (Up to 3 machines)`
   - *Tip:* To run the $19 Early Bird launch cleanly, either price the product at `$19` during launch week and raise to `$24` later, or price at `$24` and attach a `$5` launch discount code (`EARLYBIRD`).

2. **CaliberHTTP Pro — Monthly (Optional)**
   - **Pricing:** Recurring Monthly — **$5 USD / month**
   - **Benefits:** Attach `CaliberHTTP Pro License (Up to 3 machines)`

---

## Step 4: Generate Checkout Links
1. Go to **Products → Checkout Links → + New Checkout Link**.
2. Create a link for **CaliberHTTP Pro — Solo Perpetual**:
   - **Success URL:** Your static landing page thank-you URL (e.g. `https://<your-domain>/#activated`), or leave Polar's default confirmation page (which displays the `CLBR-...` key immediately).
   - Copy the generated `https://buy.polar.sh/...` URL → set as `POLAR_CHECKOUT_URL_LIFETIME`.
3. Create a second link for **CaliberHTTP Pro — Monthly**:
   - Copy the generated `https://buy.polar.sh/...` URL → set as `POLAR_CHECKOUT_URL_MONTHLY`.

---

## Step 5: Plug Values Into `.env` & Extension Config
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in `POLAR_ORGANIZATION_ID`, `POLAR_CHECKOUT_URL_LIFETIME`, and `POLAR_CHECKOUT_URL_MONTHLY`.
3. Verify `POLAR_API_BASE_URL=https://api.polar.sh` (or `https://sandbox-api.polar.sh` if testing against [sandbox.polar.sh](https://sandbox.polar.sh)).
4. Update the landing page (`website/`) checkout buttons and the extension's default `organizationId` / `checkoutUrl` constants before running `vsce package`.

---

## Step 6: Smoke-Test Activation End-to-End (Optional Sandbox)
1. In Polar Dashboard (**Products → Benefits → License Keys**), issue a test key to yourself (or purchase via Polar Sandbox).
2. In VS Code, run **Command Palette → `CaliberHTTP: Activate Pro License`** and paste the `CLBR-...` key.
3. Confirm the status bar shows Pro active, Pro commands unlock, and **Command Palette → `CaliberHTTP: Deactivate License`** frees the activation slot in Polar Dashboard.
