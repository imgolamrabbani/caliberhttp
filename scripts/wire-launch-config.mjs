#!/usr/bin/env node
/**
 * wire-launch-config.mjs
 *
 * Pure Node.js 20+ (zero dependencies) config-wiring helper for the
 * Zero-Dollar Micro-Product Studio.
 *
 * Deterministically updates:
 *   - .env (created from .env.example if missing)
 *   - app/package.json
 *   - website/index.html
 *   - website/docs.html
 *
 * Prints the exact verification & VSIX packaging command on completion.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Usage: node scripts/wire-launch-config.mjs [options]

Deterministically wires live Polar.sh, GitHub, and VS Code Marketplace / Open VSX
identifiers into .env, app/package.json, website/index.html, and website/docs.html
without breaking formatting.

Options:
  --polar-org <uuid>           Polar.sh Organization UUID (public client ID)
  --checkout-lifetime <url>    Polar.sh one-time / lifetime checkout URL (https://...)
  --checkout-monthly <url>     Polar.sh monthly checkout URL (https://...)
  --publisher <id>             VS Code Marketplace & Open VSX publisher/namespace ID
  --github-user <user>         GitHub username or organization name
  --repo <repo>                GitHub repository name
  --root <dir>                 Override project root (default: repo root)
  --dry-run                    Preview changes without writing any files
  -h, --help                   Show this help message

Example:
  node scripts/wire-launch-config.mjs \\
    --polar-org "123e4567-e89b-12d3-a456-426614174000" \\
    --checkout-lifetime "https://buy.polar.sh/polar_cl_lifetime" \\
    --checkout-monthly "https://buy.polar.sh/polar_cl_monthly" \\
    --publisher "caliberhttp" \\
    --github-user "your-handle" \\
    --repo "caliberhttp"
`);
}

function assertHttpsUrl(label, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL for ${label}: "${value}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https:// (received "${value}")`);
  }
}

function assertSafeSlug(label, value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: "${value}" (expected alphanumeric/._-)`);
  }
}

function escapeHtmlAttr(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function upsertEnvKey(content, key, value) {
  const regex = new RegExp(`^(${key}=).*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `$1${value}`);
  }
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${suffix}${key}=${value}\n`;
}

function updateDotEnv(rootDir, opts, dryRun) {
  const envPath = path.join(rootDir, '.env');
  const examplePath = path.join(rootDir, '.env.example');

  const hasPolarUpdates = Boolean(
    opts.polarOrg || opts.checkoutLifetime || opts.checkoutMonthly
  );
  if (!hasPolarUpdates) {
    return { file: '.env', status: 'skipped (no Polar flags passed)', changes: [] };
  }

  let original = '';
  let createdFromExample = false;
  if (fs.existsSync(envPath)) {
    original = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(examplePath)) {
    original = fs.readFileSync(examplePath, 'utf8');
    createdFromExample = true;
  }

  let updated = original;
  const changes = [];

  if (opts.polarOrg) {
    updated = upsertEnvKey(updated, 'POLAR_ORGANIZATION_ID', opts.polarOrg);
    changes.push(`POLAR_ORGANIZATION_ID=${opts.polarOrg}`);
  }
  if (opts.checkoutLifetime) {
    updated = upsertEnvKey(updated, 'POLAR_CHECKOUT_URL_LIFETIME', opts.checkoutLifetime);
    changes.push(`POLAR_CHECKOUT_URL_LIFETIME=${opts.checkoutLifetime}`);
  }
  if (opts.checkoutMonthly) {
    updated = upsertEnvKey(updated, 'POLAR_CHECKOUT_URL_MONTHLY', opts.checkoutMonthly);
    changes.push(`POLAR_CHECKOUT_URL_MONTHLY=${opts.checkoutMonthly}`);
  }

  if (!createdFromExample && updated === original) {
    return { file: '.env', status: 'unchanged', changes: [] };
  }

  if (!dryRun) {
    fs.writeFileSync(envPath, updated, 'utf8');
  }

  return {
    file: '.env',
    status: createdFromExample ? 'created from .env.example & updated' : 'updated',
    changes,
  };
}

function updateAppPackageJson(rootDir, opts, dryRun) {
  const pkgPath = path.join(rootDir, 'app', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Missing required file: ${pkgPath}`);
  }

  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const extName = pkg.name || 'caliberhttp';
  const changes = [];

  if (opts.publisher && pkg.publisher !== opts.publisher) {
    pkg.publisher = opts.publisher;
    changes.push(`publisher -> ${opts.publisher}`);
  }

  const pagesUrl =
    opts.githubUser && opts.repo
      ? `https://${opts.githubUser}.github.io/${opts.repo}/`
      : null;

  if (opts.githubUser && opts.repo) {
    const repoGitUrl = `https://github.com/${opts.githubUser}/${opts.repo}.git`;
    const issuesUrl = `https://github.com/${opts.githubUser}/${opts.repo}/issues`;
    const discussionsUrl = `https://github.com/${opts.githubUser}/${opts.repo}/discussions`;

    if (pkg.homepage !== pagesUrl) {
      pkg.homepage = pagesUrl;
      changes.push(`homepage -> ${pagesUrl}`);
    }
    if (!pkg.repository || typeof pkg.repository !== 'object') {
      pkg.repository = { type: 'git', url: repoGitUrl };
      changes.push(`repository.url -> ${repoGitUrl}`);
    } else if (pkg.repository.url !== repoGitUrl) {
      pkg.repository.url = repoGitUrl;
      changes.push(`repository.url -> ${repoGitUrl}`);
    }
    if (!pkg.bugs || typeof pkg.bugs !== 'object') {
      pkg.bugs = { url: issuesUrl };
      changes.push(`bugs.url -> ${issuesUrl}`);
    } else if (pkg.bugs.url !== issuesUrl) {
      pkg.bugs.url = issuesUrl;
      changes.push(`bugs.url -> ${issuesUrl}`);
    }
    if (pkg.qna !== discussionsUrl) {
      pkg.qna = discussionsUrl;
      changes.push(`qna -> ${discussionsUrl}`);
    }
  }

  const props = pkg?.contributes?.configuration?.properties;
  if (props && typeof props === 'object') {
    const orgPropKey =
      Object.keys(props).find((k) => k.endsWith('.polarOrganizationId')) ||
      `${extName}.polarOrganizationId`;
    const checkoutPropKey =
      Object.keys(props).find((k) => k.endsWith('.polarCheckoutUrl')) ||
      `${extName}.polarCheckoutUrl`;

    if (opts.polarOrg && props[orgPropKey] && props[orgPropKey].default !== opts.polarOrg) {
      props[orgPropKey].default = opts.polarOrg;
      changes.push(`${orgPropKey}.default -> ${opts.polarOrg}`);
    }

    const desiredCheckoutUrl = opts.checkoutLifetime || (pagesUrl ? `${pagesUrl}#pricing` : null);
    if (
      desiredCheckoutUrl &&
      props[checkoutPropKey] &&
      props[checkoutPropKey].default !== desiredCheckoutUrl
    ) {
      props[checkoutPropKey].default = desiredCheckoutUrl;
      changes.push(`${checkoutPropKey}.default -> ${desiredCheckoutUrl}`);
    }
  }

  const formatted = `${JSON.stringify(pkg, null, 2)}\n`;
  const unchanged = raw === formatted || changes.length === 0;
  if (!unchanged && !dryRun) {
    fs.writeFileSync(pkgPath, formatted, 'utf8');
  }

  return {
    file: 'app/package.json',
    status: unchanged ? 'unchanged' : 'updated',
    changes,
    extName,
  };
}

function updateWebsiteIndex(rootDir, opts, extName, dryRun) {
  const indexPath = path.join(rootDir, 'website', 'index.html');
  if (!fs.existsSync(indexPath)) {
    return { file: 'website/index.html', status: 'skipped (file not found)', changes: [] };
  }

  const original = fs.readFileSync(indexPath, 'utf8');
  let updated = original;
  const changes = [];

  if (opts.publisher) {
    const vscUrl = `https://marketplace.visualstudio.com/items?itemName=${opts.publisher}.${extName}`;
    const ovsxUrl = `https://open-vsx.org/extension/${opts.publisher}/${extName}`;

    const nextVsc = updated.replace(
      /https:\/\/marketplace\.visualstudio\.com\/items\?itemName=[a-zA-Z0-9._-]+/g,
      vscUrl
    );
    if (nextVsc !== updated) {
      updated = nextVsc;
      changes.push(`VS Code Marketplace URL -> ${vscUrl}`);
    }

    const nextOvsx = updated.replace(
      /https:\/\/open-vsx\.org\/extension\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/g,
      ovsxUrl
    );
    if (nextOvsx !== updated) {
      updated = nextOvsx;
      changes.push(`Open VSX URL -> ${ovsxUrl}`);
    }
  }

  if (opts.checkoutLifetime) {
    const safeUrl = escapeHtmlAttr(opts.checkoutLifetime);
    const nextLifetime = updated.replace(
      /(<a\b[^>]*\bclass="btn btn-primary"[^>]*\bhref=")([^"]+)("[^>]*>[^<]*Pro[^<]*<\/a>)/i,
      `$1${safeUrl}$3`
    );
    if (nextLifetime !== updated) {
      updated = nextLifetime;
      changes.push(`Pro Lifetime checkout CTA -> ${opts.checkoutLifetime}`);
    }
  }

  if (opts.checkoutMonthly) {
    const safeUrl = escapeHtmlAttr(opts.checkoutMonthly);
    const nextMonthly = updated.replace(
      /(<a\b[^>]*\bclass="btn btn-secondary"[^>]*\bhref=")([^"]+)("[^>]*>[^<]*\/mo[^<]*<\/a>)/i,
      `$1${safeUrl}$3`
    );
    if (nextMonthly !== updated) {
      updated = nextMonthly;
      changes.push(`Pro Monthly checkout CTA -> ${opts.checkoutMonthly}`);
    }
  }

  if (updated === original) {
    return { file: 'website/index.html', status: 'unchanged', changes: [] };
  }

  if (!dryRun) {
    fs.writeFileSync(indexPath, updated, 'utf8');
  }

  return { file: 'website/index.html', status: 'updated', changes };
}

function updateWebsiteDocs(rootDir, opts, extName, dryRun) {
  const docsPath = path.join(rootDir, 'website', 'docs.html');
  if (!fs.existsSync(docsPath)) {
    return { file: 'website/docs.html', status: 'skipped (file not found)', changes: [] };
  }

  const original = fs.readFileSync(docsPath, 'utf8');
  let updated = original;
  const changes = [];

  if (opts.publisher) {
    const vscUrl = `https://marketplace.visualstudio.com/items?itemName=${opts.publisher}.${extName}`;
    const ovsxUrl = `https://open-vsx.org/extension/${opts.publisher}/${extName}`;

    // Replace existing marketplace/Open VSX links if already wired
    let next = updated
      .replace(
        /https:\/\/marketplace\.visualstudio\.com\/items\?itemName=[a-zA-Z0-9._-]+/g,
        vscUrl
      )
      .replace(
        /https:\/\/open-vsx\.org\/extension\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/g,
        ovsxUrl
      );

    // First-time wiring: convert plain text "VS Code Marketplace or Open VSX" in Quickstart into links
    if (next === updated) {
      next = next.replace(
        /from the VS Code Marketplace or Open VSX\./,
        `from the <a href="${escapeHtmlAttr(vscUrl)}" target="_blank" rel="noopener">VS Code Marketplace</a> or <a href="${escapeHtmlAttr(ovsxUrl)}" target="_blank" rel="noopener">Open VSX</a>.`
      );
    }

    if (next !== updated) {
      updated = next;
      changes.push(`Quickstart install links -> ${vscUrl} & ${ovsxUrl}`);
    }
  }

  if (opts.checkoutLifetime || opts.checkoutMonthly) {
    const primaryUrl = opts.checkoutLifetime || opts.checkoutMonthly;
    const safePrimary = escapeHtmlAttr(primaryUrl);

    // Update existing Polar checkout anchor if already wired
    let next = updated.replace(
      /(<a\b[^>]*\bdata-polar-checkout="primary"[^>]*\bhref=")([^"]+)(")/,
      `$1${safePrimary}$3`
    );

    // First-time wiring: link "Polar.sh" in Section 5 License Activation
    if (next === updated) {
      next = next.replace(
        /Purchase a Pro license via Polar\.sh/,
        `Purchase a Pro license via <a data-polar-checkout="primary" href="${safePrimary}" target="_blank" rel="noopener">Polar.sh</a>`
      );
    }

    if (next !== updated) {
      updated = next;
      changes.push(`Docs Polar.sh checkout link -> ${primaryUrl}`);
    }
  }

  if (updated === original) {
    return { file: 'website/docs.html', status: 'unchanged', changes: [] };
  }

  if (!dryRun) {
    fs.writeFileSync(docsPath, updated, 'utf8');
  }

  return { file: 'website/docs.html', status: 'updated', changes };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: false,
      options: {
        'polar-org': { type: 'string' },
        'checkout-lifetime': { type: 'string' },
        'checkout-monthly': { type: 'string' },
        publisher: { type: 'string' },
        'github-user': { type: 'string' },
        repo: { type: 'string' },
        root: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    console.error(`Error: ${err.message}\nRun with --help for usage.`);
    process.exit(1);
  }

  const { values } = parsed;
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const opts = {
    polarOrg: values['polar-org']?.trim() || '',
    checkoutLifetime: values['checkout-lifetime']?.trim() || '',
    checkoutMonthly: values['checkout-monthly']?.trim() || '',
    publisher: values.publisher?.trim() || '',
    githubUser: values['github-user']?.trim() || '',
    repo: values.repo?.trim() || '',
  };

  const anyFlag = Object.values(opts).some(Boolean);
  if (!anyFlag) {
    console.error('Error: Provide at least one configuration flag. Run with --help for usage.');
    process.exit(1);
  }

  if ((opts.githubUser && !opts.repo) || (!opts.githubUser && opts.repo)) {
    console.error('Error: --github-user and --repo must be provided together.');
    process.exit(1);
  }

  try {
    if (opts.checkoutLifetime) assertHttpsUrl('--checkout-lifetime', opts.checkoutLifetime);
    if (opts.checkoutMonthly) assertHttpsUrl('--checkout-monthly', opts.checkoutMonthly);
    if (opts.publisher) assertSafeSlug('--publisher', opts.publisher);
    if (opts.githubUser) assertSafeSlug('--github-user', opts.githubUser);
    if (opts.repo) assertSafeSlug('--repo', opts.repo);
  } catch (err) {
    console.error(`Validation error: ${err.message}`);
    process.exit(1);
  }

  const rootDir = values.root ? path.resolve(values.root) : DEFAULT_ROOT;
  const dryRun = Boolean(values['dry-run']);

  console.log(
    dryRun
      ? `[wire-launch-config] DRY RUN against ${rootDir}\n`
      : `[wire-launch-config] Updating studio configs in ${rootDir}\n`
  );

  const envResult = updateDotEnv(rootDir, opts, dryRun);
  const pkgResult = updateAppPackageJson(rootDir, opts, dryRun);
  const indexResult = updateWebsiteIndex(rootDir, opts, pkgResult.extName, dryRun);
  const docsResult = updateWebsiteDocs(rootDir, opts, pkgResult.extName, dryRun);

  for (const res of [envResult, pkgResult, indexResult, docsResult]) {
    console.log(`• ${res.file}: ${res.status}`);
    for (const change of res.changes) {
      console.log(`    - ${change}`);
    }
  }

  console.log('\nNext verification & VSIX re-package command:');
  console.log('  cd app && npm run typecheck && npm run build && npm test && npm run package');
}

main();
