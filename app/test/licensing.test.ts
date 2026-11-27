import { describe, expect, it, vi } from 'vitest';
import {
  FeatureGate,
  HttpPolarApiClient,
  LICENSE_SECRET_KEY,
  LicenseManager,
  OFFLINE_GRACE_MS,
  PRO_FEATURE_LABELS,
  PolarApiError,
  REVALIDATE_INTERVAL_MS,
  maskLicenseKey,
} from '../src/licensing';
import type {
  PolarApiClient,
  ProFeatureId,
  SecretStore,
  StateStore,
} from '../src/licensing';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ORG_ID = 'org_caliberhttp_test_123';
const CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_caliberhttp_pro';

function createMemoryStores() {
  const secretsMap = new Map<string, string>();
  const stateMap = new Map<string, unknown>();

  const secrets: SecretStore = {
    async get(key: string) {
      return secretsMap.get(key);
    },
    async store(key: string, value: string) {
      secretsMap.set(key, value);
    },
    async delete(key: string) {
      secretsMap.delete(key);
    },
  };

  const globalState: StateStore = {
    get<T>(key: string): T | undefined {
      return stateMap.get(key) as T | undefined;
    },
    async update(key: string, value: unknown) {
      stateMap.set(key, value);
    },
  };

  return { secrets, globalState, secretsMap, stateMap };
}

function createMockPolarClient(): {
  client: PolarApiClient;
  activate: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
} {
  const activate = vi.fn();
  const validate = vi.fn();
  const deactivate = vi.fn();
  return {
    client: { activate, validate, deactivate },
    activate,
    validate,
    deactivate,
  };
}

describe('maskLicenseKey', () => {
  it('masks Polar-style hyphenated keys preserving prefix and last 4 characters', () => {
    expect(maskLicenseKey('CLBR-A1B2-C3D4-9F2A')).toBe('CLBR-****-9F2A');
  });

  it('handles non-hyphenated and short keys safely', () => {
    expect(maskLicenseKey('CALIBERPRO123456')).toBe('CALI-****-3456');
    expect(maskLicenseKey('  ')).toBe('****');
  });
});

describe('LicenseManager', () => {
  it('starts in fresh free state', () => {
    const { secrets, globalState } = createMemoryStores();
    const { client } = createMockPolarClient();
    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client
    );

    expect(manager.isPro()).toBe(false);
    expect(manager.getState()).toEqual({
      tier: 'free',
      offlineGraceActive: false,
    });
  });

  it('activates a valid license, masks the key, and persists secret + grace window', async () => {
    const { secrets, globalState, secretsMap } = createMemoryStores();
    const { client, activate } = createMockPolarClient();
    const now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_001',
      key: 'CLBR-1111-2222-9F2A',
    });

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );

    const state = await manager.activate('  CLBR-1111-2222-9F2A  ', 'macbook-pro');

    expect(activate).toHaveBeenCalledWith(
      'CLBR-1111-2222-9F2A',
      ORG_ID,
      'macbook-pro'
    );
    expect(manager.isPro()).toBe(true);
    expect(state).toEqual({
      tier: 'pro',
      keyMask: 'CLBR-****-9F2A',
      activationId: 'act_001',
      validatedAtIso: new Date(now).toISOString(),
      graceUntilIso: new Date(now + OFFLINE_GRACE_MS).toISOString(),
      offlineGraceActive: false,
    });
    expect(secretsMap.get(LICENSE_SECRET_KEY)).toBe('CLBR-1111-2222-9F2A');
  });

  it('rejects empty keys, non-granted statuses, and API 404/422 errors without elevating tier', async () => {
    const { secrets, globalState, secretsMap } = createMemoryStores();
    const { client, activate } = createMockPolarClient();
    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client
    );

    await expect(manager.activate('   ')).rejects.toThrow(PolarApiError);
    expect(activate).not.toHaveBeenCalled();
    expect(manager.isPro()).toBe(false);

    activate.mockResolvedValueOnce({
      status: 'revoked',
      id: 'act_bad',
      key: 'CLBR-BAD-KEY',
    });
    await expect(manager.activate('CLBR-BAD-KEY')).rejects.toThrow(PolarApiError);
    expect(manager.isPro()).toBe(false);
    expect(secretsMap.has(LICENSE_SECRET_KEY)).toBe(false);

    activate.mockRejectedValueOnce(
      new PolarApiError('Not Found', {
        statusCode: 404,
        isRevokedOrInvalid: true,
        isTransient: false,
      })
    );
    await expect(manager.activate('CLBR-404-KEY')).rejects.toThrow(PolarApiError);
    expect(manager.isPro()).toBe(false);
  });

  it('trusts cached valid state under 72h with zero API calls', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_cache',
      key: 'CLBR-AAA1-BBB2-CCCC',
    });

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CLBR-AAA1-BBB2-CCCC', 'dev-box');

    now += REVALIDATE_INTERVAL_MS - 60_000; // 71h 59m
    const state = await manager.refreshIfNeeded();

    expect(validate).not.toHaveBeenCalled();
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(false);
  });

  it('silently refreshes when >= 72h have elapsed and extends grace window', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_refresh',
      key: 'CLBR-1234-5678-9ABC',
    });
    validate.mockResolvedValue({ status: 'granted' });

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CLBR-1234-5678-9ABC', 'dev-box');

    now += REVALIDATE_INTERVAL_MS; // exactly 72h
    const state = await manager.refreshIfNeeded();

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith(
      'CLBR-1234-5678-9ABC',
      ORG_ID,
      'act_refresh'
    );
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(false);
    expect(state.validatedAtIso).toBe(new Date(now).toISOString());
    expect(state.graceUntilIso).toBe(
      new Date(now + OFFLINE_GRACE_MS).toISOString()
    );
  });

  it('keeps Pro with offlineGraceActive=true on network/5xx error within 14-day grace', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_offline',
      key: 'CLBR-OFFL-INE1-9999',
    });
    validate.mockRejectedValue(
      new PolarApiError('Polar API network error: ECONNREFUSED', {
        isRevokedOrInvalid: false,
        isTransient: true,
      })
    );

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CLBR-OFFL-INE1-9999', 'flight-laptop');

    now += 5 * DAY_MS; // 5 days later (> 72h, <= 14 days)
    const state = await manager.refreshIfNeeded();

    expect(validate).toHaveBeenCalledTimes(1);
    expect(manager.isPro()).toBe(true);
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(true);
  });

  it('downgrades to free when 14-day offline grace has expired and network is unreachable', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_expired',
      key: 'CLBR-EXPI-RED1-0000',
    });
    validate.mockRejectedValue(
      new PolarApiError('Polar API responded with HTTP 503', {
        statusCode: 503,
        isRevokedOrInvalid: false,
        isTransient: true,
      })
    );

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CLBR-EXPI-RED1-0000', 'offline-machine');

    now += OFFLINE_GRACE_MS + 1_000; // 14 days + 1s
    const state = await manager.refreshIfNeeded();

    expect(manager.isPro()).toBe(false);
    expect(state).toEqual({
      tier: 'free',
      offlineGraceActive: false,
    });
  });

  it('immediately revokes Pro on explicit 404/422 or non-granted validation status', async () => {
    for (const scenario of ['404', '422', 'status_disabled'] as const) {
      const { secrets, globalState, secretsMap } = createMemoryStores();
      const { client, activate, validate } = createMockPolarClient();
      let now = Date.parse('2026-11-27T12:00:00.000Z');

      activate.mockResolvedValue({
        status: 'granted',
        id: `act_${scenario}`,
        key: 'CLBR-REVO-KED1-ABCD',
      });

      if (scenario === '404') {
        validate.mockRejectedValue(
          new PolarApiError('Not Found', {
            statusCode: 404,
            isRevokedOrInvalid: true,
            isTransient: false,
          })
        );
      } else if (scenario === '422') {
        validate.mockRejectedValue(
          new PolarApiError('Unprocessable Entity', {
            statusCode: 422,
            isRevokedOrInvalid: true,
            isTransient: false,
          })
        );
      } else {
        validate.mockResolvedValue({ status: 'disabled' });
      }

      const manager = new LicenseManager(
        secrets,
        globalState,
        { organizationId: ORG_ID },
        client,
        () => now
      );
      await manager.activate('CLBR-REVO-KED1-ABCD', 'dev-box');

      now += 4 * DAY_MS; // Still inside 14-day grace, but explicit revocation wins
      const state = await manager.refreshIfNeeded();

      expect(manager.isPro()).toBe(false);
      expect(state).toEqual({ tier: 'free', offlineGraceActive: false });
      expect(secretsMap.has(LICENSE_SECRET_KEY)).toBe(false);
    }
  });

  it('deactivates cleanly via Polar API (best-effort) and clears secrets and state', async () => {
    const { secrets, globalState, secretsMap } = createMemoryStores();
    const { client, activate, deactivate } = createMockPolarClient();

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_deact',
      key: 'CLBR-DEAC-TIV1-7777',
    });
    deactivate.mockRejectedValueOnce(new Error('offline during deactivate'));

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client
    );
    await manager.activate('CLBR-DEAC-TIV1-7777', 'old-laptop');

    const state = await manager.deactivate();

    expect(deactivate).toHaveBeenCalledWith(
      'CLBR-DEAC-TIV1-7777',
      ORG_ID,
      'act_deact'
    );
    expect(state).toEqual({ tier: 'free', offlineGraceActive: false });
    expect(manager.isPro()).toBe(false);
    expect(secretsMap.has(LICENSE_SECRET_KEY)).toBe(false);
  });

  it('persists Pro state across a fresh LicenseManager restart', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate, validate } = createMockPolarClient();
    const now = Date.parse('2026-11-27T12:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_persist',
      key: 'CLBR-PERS-IST1-5555',
    });

    const firstInstance = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await firstInstance.activate('CLBR-PERS-IST1-5555', 'workstation');

    const restartedInstance = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client,
      () => now + HOUR_MS
    );

    expect(restartedInstance.isPro()).toBe(true);
    expect(restartedInstance.getState().keyMask).toBe('CLBR-****-5555');
    expect(restartedInstance.getState().activationId).toBe('act_persist');

    await restartedInstance.refreshIfNeeded();
    expect(validate).not.toHaveBeenCalled();
  });
});

describe('HttpPolarApiClient', () => {
  it('calls Polar public customer-portal endpoints with zero secret auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'act_http_1',
          license_key: { status: 'granted', key: 'CLBR-HTTP-0001-ABCD' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new HttpPolarApiClient(
      'https://api.polar.sh/',
      fetchMock as unknown as typeof fetch
    );

    const res = await client.activate('CLBR-HTTP-0001-ABCD', ORG_ID, 'my-mac');

    expect(res).toEqual({
      id: 'act_http_1',
      status: 'granted',
      key: 'CLBR-HTTP-0001-ABCD',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.polar.sh/v1/customer-portal/license-keys/activate'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      key: 'CLBR-HTTP-0001-ABCD',
      organization_id: ORG_ID,
      label: 'my-mac',
    });
  });

  it('classifies 404/422 as revoked/invalid and 5xx/network as transient', async () => {
    const fetch404 = vi
      .fn()
      .mockResolvedValue(new Response('not found', { status: 404 }));
    const client404 = new HttpPolarApiClient(
      'https://api.polar.sh',
      fetch404 as unknown as typeof fetch
    );

    try {
      await client404.validate('CLBR-NONE', ORG_ID, 'act_1');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PolarApiError);
      const apiErr = err as PolarApiError;
      expect(apiErr.statusCode).toBe(404);
      expect(apiErr.isRevokedOrInvalid).toBe(true);
      expect(apiErr.isTransient).toBe(false);
    }

    const fetch502 = vi
      .fn()
      .mockResolvedValue(new Response('bad gateway', { status: 502 }));
    const client502 = new HttpPolarApiClient(
      'https://api.polar.sh',
      fetch502 as unknown as typeof fetch
    );

    try {
      await client502.validate('CLBR-LIVE', ORG_ID, 'act_1');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PolarApiError);
      const apiErr = err as PolarApiError;
      expect(apiErr.statusCode).toBe(502);
      expect(apiErr.isRevokedOrInvalid).toBe(false);
      expect(apiErr.isTransient).toBe(true);
    }
  });
});

describe('FeatureGate', () => {
  const allFeatures: ProFeatureId[] = [
    'chain_runner',
    'schema_drift',
    'mock_server',
    'har_import',
    'secret_vault',
  ];

  it('blocks all Pro features when Free and invokes onBlocked with checkoutUrl', () => {
    const { secrets, globalState } = createMemoryStores();
    const { client } = createMockPolarClient();
    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client
    );
    const gate = new FeatureGate(manager, CHECKOUT_URL);

    expect(gate.getCheckoutUrl()).toBe(CHECKOUT_URL);

    for (const feature of allFeatures) {
      expect(PRO_FEATURE_LABELS[feature].title).toBeTruthy();
      expect(PRO_FEATURE_LABELS[feature].summary).toBeTruthy();
      expect(gate.isAllowed(feature)).toBe(false);

      const onBlocked = vi.fn();
      expect(gate.requirePro(feature, onBlocked)).toBe(false);
      expect(onBlocked).toHaveBeenCalledWith(feature, CHECKOUT_URL);
    }
  });

  it('allows all Pro features silently once activated', async () => {
    const { secrets, globalState } = createMemoryStores();
    const { client, activate } = createMockPolarClient();
    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_gate',
      key: 'CLBR-PRO1-GATE-8888',
    });

    const manager = new LicenseManager(
      secrets,
      globalState,
      { organizationId: ORG_ID },
      client
    );
    await manager.activate('CLBR-PRO1-GATE-8888', 'dev-box');

    const gate = new FeatureGate(manager, CHECKOUT_URL);
    const onBlocked = vi.fn();

    for (const feature of allFeatures) {
      expect(gate.isAllowed(feature)).toBe(true);
      expect(gate.requirePro(feature, onBlocked)).toBe(true);
    }
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
