import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseHttpDocument } from '../src/core/httpParser';
import {
  exportChainReportJUnit,
  exportChainReportJson,
  exportChainReportMarkdown,
  runRequestChain,
} from '../src/pro/chainRunner';
import { importHarToHttp } from '../src/pro/harImporter';
import {
  LocalMockServer,
  routesFromHttpContent,
  routesFromOpenApiJson,
} from '../src/pro/mockServer';
import {
  diffSnapshot,
  inferSchema,
  loadSnapshot,
  saveSnapshot,
} from '../src/pro/schemaDrift';
import { SecretVault } from '../src/pro/secretVault';

describe('Pro: chainRunner (real localhost server + step chaining + assertions + exports)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/auth/login' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'x-trace-id': 'trace-777',
        });
        res.end(JSON.stringify({ token: 'jwt_secret_999', user: { id: 1 } }));
        return;
      }
      if (req.url === '/profile' && req.method === 'GET') {
        if (req.headers.authorization === 'Bearer jwt_secret_999') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 1,
              email: 'dev@caliberhttp.dev',
              roles: ['owner', 'builder'],
            })
          );
          return;
        }
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('chains token from step 1 into step 2, evaluates assertions, and exports JUnit/MD/JSON', async () => {
    const httpDoc = parseHttpDocument(`
@base = ${baseUrl}

### Login
# @name login
# @assert status == 200
# @assert body.$.token exists
# @assert header.x-trace-id contains trace
POST {{base}}/auth/login
Content-Type: application/json

{"user":"dev"}

### Get Profile
# @name profile
# @assert status == 200
# @assert body.$.email == "dev@caliberhttp.dev"
# @assert body.$.roles contains owner
GET {{base}}/profile
Authorization: Bearer {{login.response.body.$.token}}
`);

    const report = await runRequestChain(httpDoc.requests, {
      collectionName: 'Auth Flow',
      interpolation: { fileVariables: httpDoc.variables },
    });

    expect(report.passed).toBe(true);
    expect(report.totalSteps).toBe(2);
    expect(report.passedSteps).toBe(2);
    expect(report.totalAssertions).toBe(6);
    expect(report.passedAssertions).toBe(6);

    const junit = exportChainReportJUnit(report);
    expect(junit).toContain('<testsuites name="Auth Flow" tests="2" failures="0"');
    expect(junit).toContain('<testcase');

    const md = exportChainReportMarkdown(report);
    expect(md).toContain('# CaliberHTTP Chain Report — Auth Flow');
    expect(md).toContain('**Status:** PASSED');

    const json = JSON.parse(exportChainReportJson(report));
    expect(json.passed).toBe(true);
  });
});

describe('Pro: schemaDrift', () => {
  it('persists baseline snapshot and detects breaking removed_field, type_changed, status_changed, and added_field', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caliber-drift-'));
    try {
      const baselineRes = {
        requestId: 'get_user',
        status: 200,
        statusText: 'OK',
        durationMs: 20,
        sizeBytes: 64,
        headers: { 'content-type': 'application/json' },
        bodyText: '{"id":1,"name":"Ada","active":true}',
        bodyJson: { id: 1, name: 'Ada', active: true },
        timestampIso: new Date().toISOString(),
      };

      expect(inferSchema(baselineRes.bodyJson).type).toBe('object');
      await saveSnapshot(tmp, 'get_user', baselineRes);
      const loaded = await loadSnapshot(tmp, 'get_user');
      expect(loaded).not.toBeNull();

      const driftedRes = {
        ...baselineRes,
        status: 500,
        bodyJson: { id: '1', extraField: 'new' }, // `name` & `active` removed, `id` changed integer->string
        bodyText: '{"id":"1","extraField":"new"}',
      };

      const findings = diffSnapshot(loaded!, driftedRes);
      expect(findings.some((f) => f.kind === 'status_changed' && f.severity === 'breaking')).toBe(true);
      expect(findings.some((f) => f.path === '$.id' && f.kind === 'type_changed' && f.severity === 'breaking')).toBe(true);
      expect(findings.some((f) => f.path === '$.name' && f.kind === 'removed_field' && f.severity === 'breaking')).toBe(true);
      expect(findings.some((f) => f.path === '$.extraField' && f.kind === 'added_field' && f.severity === 'info')).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('Pro: mockServer', () => {
  it('serves routes from .http fixtures and OpenAPI JSON on 127.0.0.1 and logs requests', async () => {
    const httpRoutes = routesFromHttpContent(`
### Health
GET https://api.example.com/health
X-Mock-Status: 200

{"status":"healthy"}
`);

    const openApiRoutes = routesFromOpenApiJson(
      JSON.stringify({
        openapi: '3.0.3',
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 42 },
                          email: { type: 'string', example: 'mock@example.com' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    );

    const mock = new LocalMockServer();
    mock.setRoutes([...httpRoutes, ...openApiRoutes]);
    const started = await mock.start(0);

    try {
      expect(mock.isRunning()).toBe(true);
      expect(started.host).toBe('127.0.0.1');

      const r1 = await fetch(`${started.url}/health`);
      expect(r1.status).toBe(200);
      expect(await r1.json()).toEqual({ status: 'healthy' });

      const r2 = await fetch(`${started.url}/users/99`);
      expect(r2.status).toBe(200);
      expect(await r2.json()).toEqual({ id: 42, email: 'mock@example.com' });

      const r3 = await fetch(`${started.url}/missing`);
      expect(r3.status).toBe(404);

      expect(mock.getLogs()).toHaveLength(3);
    } finally {
      await mock.stop();
      expect(mock.isRunning()).toBe(false);
    }
  });
});

describe('Pro: harImporter', () => {
  it('filters static assets, extracts {{baseUrl}}, strips noise headers, and deduplicates', () => {
    const har = JSON.stringify({
      log: {
        version: '1.2',
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://api.myapp.io/v1/projects',
              headers: [
                { name: ':authority', value: 'api.myapp.io' },
                { name: 'sec-fetch-mode', value: 'cors' },
                { name: 'Authorization', value: 'Bearer abc' },
              ],
            },
          },
          {
            request: {
              method: 'GET',
              url: 'https://api.myapp.io/v1/projects', // duplicate
              headers: [],
            },
          },
          {
            request: {
              method: 'GET',
              url: 'https://api.myapp.io/static/bundle.js', // static asset
              headers: [],
            },
          },
          {
            request: {
              method: 'POST',
              url: 'https://api.myapp.io/v1/projects',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              postData: { text: '{"name":"Alpha"}' },
            },
          },
        ],
      },
    });

    const result = importHarToHttp(har);
    expect(result.baseUrl).toBe('https://api.myapp.io');
    expect(result.importedCount).toBe(2);
    expect(result.httpContent).toContain('@baseUrl = https://api.myapp.io');
    expect(result.httpContent).toContain('GET {{baseUrl}}/v1/projects');
    expect(result.httpContent).toContain('POST {{baseUrl}}/v1/projects');
    expect(result.httpContent).not.toContain('sec-fetch-mode');
    expect(result.httpContent).not.toContain('bundle.js');
  });
});

describe('Pro: secretVault (AES-256-GCM + PBKDF2-SHA256)', () => {
  it('encrypts secrets at rest, unlocks with correct passphrase, and rejects wrong passphrase', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caliber-vault-'));
    try {
      const vault = new SecretVault(tmp, { iterations: 10_000 });
      await vault.initOrUnlock('correct-horse-battery');
      await vault.setSecret('STRIPE_KEY', 'sk_live_very_secret_value');
      expect(vault.getSecret('STRIPE_KEY')).toBe('sk_live_very_secret_value');

      // Verify file on disk does NOT contain plaintext
      const rawFile = await fs.readFile(vault.getVaultPath(), 'utf8');
      expect(rawFile).not.toContain('sk_live_very_secret_value');
      expect(rawFile).toContain('"aes-256-gcm"');

      vault.lock();
      expect(vault.isUnlocked()).toBe(false);

      // Re-open with wrong passphrase must fail GCM auth
      const vault2 = new SecretVault(tmp, { iterations: 10_000 });
      await expect(vault2.initOrUnlock('wrong-passphrase')).rejects.toThrow();

      // Re-open with correct passphrase succeeds
      const keys = await vault2.initOrUnlock('correct-horse-battery');
      expect(keys).toEqual(['STRIPE_KEY']);
      expect(vault2.getSecret('STRIPE_KEY')).toBe('sk_live_very_secret_value');

      await vault2.deleteSecret('STRIPE_KEY');
      expect(vault2.listKeys()).toEqual([]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
