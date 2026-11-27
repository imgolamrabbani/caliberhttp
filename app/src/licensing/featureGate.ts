import type { LicenseManager } from './licenseManager';

export type ProFeatureId =
  | 'chain_runner'
  | 'schema_drift'
  | 'mock_server'
  | 'har_import'
  | 'secret_vault';

export const PRO_FEATURE_LABELS: Record<
  ProFeatureId,
  { title: string; summary: string }
> = {
  chain_runner: {
    title: 'Multi-Step Request Chaining & Assertions',
    summary:
      'Run sequential .http workflows with JSONPath assertions and JUnit/Markdown/JSON test exports.',
  },
  schema_drift: {
    title: 'Response Snapshot Diff & Schema Drift Detector',
    summary:
      'Pin JSON response baselines and catch breaking field removals or type changes locally.',
  },
  mock_server: {
    title: 'Local Mock Server',
    summary:
      'Spin up a 127.0.0.1 mock HTTP server directly from .http fixtures or OpenAPI 3.0/3.1 JSON.',
  },
  har_import: {
    title: 'HAR-to-.http Batch Importer',
    summary:
      'Convert browser DevTools .har captures into clean, deduplicated .http collections.',
  },
  secret_vault: {
    title: 'AES-256-GCM Local Secret Vault',
    summary:
      'Encrypt API keys and tokens in Git-safe .caliber/vault.enc files with zero cloud sync.',
  },
};

export class FeatureGate {
  constructor(
    private readonly licenseManager: LicenseManager,
    private readonly checkoutUrl: string
  ) {}

  isAllowed(feature: ProFeatureId): boolean {
    void feature;
    return this.licenseManager.isPro();
  }

  requirePro(
    feature: ProFeatureId,
    onBlocked?: (feature: ProFeatureId, checkoutUrl: string) => void
  ): boolean {
    if (this.isAllowed(feature)) {
      return true;
    }
    onBlocked?.(feature, this.checkoutUrl);
    return false;
  }

  getCheckoutUrl(): string {
    return this.checkoutUrl;
  }
}
