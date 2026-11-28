import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCurl, toCurl } from '../src/core/curlCodec';
import { importOpenApiToHttp } from '../src/core/openapiImporter';
import { HistoryStore } from '../src/core/historyStore';
import { executeHttpRequest } from '../src/core/httpExecutor';
import {
  parseHttpDocument,
  serializeRequestBlock,
  updateRequestInDocument,
} from '../src/core/httpParser';
import {
  evaluateJsonPath,
  interpolateRequest,
  interpolateString,
  loadDotEnv,
  loadEnvConfig,
  resolveEnvironmentVariables,
} from '../src/core/interpolator';

describe('Core: httpParser', () => {
  const sampleDoc = `@baseUrl = https://api.example.com
@version = v1

### Get Users
# @name listUsers
# @assert status == 200
# @assert latency < 1000
# @assert body.$.items[0].id exists
GET {{baseUrl}}/{{version}}/users?active=true
Authorization: Bearer token123
# X-Debug: false

### Create GraphQL Query
# @name gqlUser
POST {{baseUrl}}/graphql
X-REQUEST-TYPE: GraphQL
Content-Type: application/graphql

query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
  }
}

{
  "id": "42"
}
`;

  it('parses file variables, multiple requests, assertions, disabled headers, and GraphQL variables', () => {
    const doc = parseHttpDocument(sampleDoc, 'api.http');
    expect(doc.variables).toEqual({
      baseUrl: 'https://api.example.com',
      version: 'v1',
    });
    expect(doc.requests).toHaveLength(2);

    const first = doc.requests[0];
    expect(first.id).toBe('listUsers');
    expect(first.name).toBe('Get Users');
    expect(first.method).toBe('GET');
    expect(first.url).toBe('{{baseUrl}}/{{version}}/users?active=true');
    expect(first.headers).toEqual([
      { key: 'Authorization', value: 'Bearer token123', enabled: true },
      { key: 'X-Debug', value: 'false', enabled: false },
    ]);
    expect(first.assertions).toHaveLength(3);
    expect(first.assertions[0]).toMatchObject({
      target: 'status',
      operator: '==',
      expected: 200,
    });
    expect(first.assertions[2]).toMatchObject({
      target: 'body.$.items[0].id',
      operator: 'exists',
    });

    const gql = doc.requests[1];
    expect(gql.id).toBe('gqlUser');
    expect(gql.method).toBe('POST');
    expect(gql.body).toContain('query GetUser($id: ID!)');
    expect(gql.graphqlVariables).toBe('{\n  "id": "42"\n}');
  });

  it('losslessly updates a single request in-place while preserving variables and other requests', () => {
    const doc = parseHttpDocument(sampleDoc, 'api.http');
    const updated = {
      ...doc.requests[0],
      url: '{{baseUrl}}/{{version}}/users?active=false',
    };
    const nextText = updateRequestInDocument(sampleDoc, updated);
    expect(nextText).toContain('@baseUrl = https://api.example.com');
    expect(nextText).toContain('GET {{baseUrl}}/{{version}}/users?active=false');
    expect(nextText).toContain('### Create GraphQL Query');

    const reparsed = parseHttpDocument(nextText, 'api.http');
    expect(reparsed.requests).toHaveLength(2);
    expect(reparsed.requests[0].url).toBe(
      '{{baseUrl}}/{{version}}/users?active=false'
    );
    expect(reparsed.requests[1].id).toBe('gqlUser');
  });

  it('serializes request block cleanly', () => {
    const doc = parseHttpDocument(sampleDoc);
    const serialized = serializeRequestBlock(doc.requests[0]);
    expect(serialized).toContain('### Get Users');
    expect(serialized).toContain('# @name listUsers');
    expect(serialized).toContain('# @assert status == 200');
  });
});

describe('Core: interpolator & JSONPath', () => {
  it('evaluates nested JSONPath expressions', () => {
    const data = {
      data: {
        users: [
          { id: 10, role: 'admin' },
          { id: 20, role: 'member' },
        ],
      },
    };
    expect(evaluateJsonPath(data, '$.data.users[0].role')).toBe('admin');
    expect(evaluateJsonPath(data, '$.data.users[*].id')).toEqual([10, 20]);
    expect(evaluateJsonPath(data, '$.data.users.length')).toBe(2);
  });

  it('interpolates env, file, vault, dynamic built-ins, and step chaining refs', () => {
    const rendered = interpolateString(
      '{{baseUrl}}/items/{{$uuid}}?ts={{$timestamp}}&r={{$randomInt 10 20}}&tok={{login.response.body.$.token}}&hdr={{login.response.headers.X-Req}}&sec={{vault.API_KEY}}',
      {
        fileVariables: { baseUrl: 'https://local.test' },
        vaultSecrets: { API_KEY: 'super_secret' },
        stepResults: {
          login: {
            requestId: 'login',
            status: 200,
            statusText: 'OK',
            durationMs: 12,
            sizeBytes: 24,
            headers: { 'x-req': 'req-99' },
            bodyText: '{"token":"abc123"}',
            bodyJson: { token: 'abc123' },
            timestampIso: new Date().toISOString(),
          },
        },
      }
    );

    expect(rendered).toContain('https://local.test/items/');
    expect(rendered).toContain('tok=abc123');
    expect(rendered).toContain('hdr=req-99');
    expect(rendered).toContain('sec=super_secret');
    expect(rendered).not.toContain('{{$uuid}}');
    expect(rendered).not.toContain('{{$timestamp}}');
  });

  it('loads caliber.env.json and .env from workspace', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caliber-env-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'caliber.env.json'),
        JSON.stringify({
          $shared: { app: 'caliber' },
          dev: { baseUrl: 'http://127.0.0.1:3000' },
        })
      );
      await fs.writeFile(path.join(tmp, '.env'), 'API_SECRET="xyz"\n# comment\n');

      const envCfg = await loadEnvConfig(tmp);
      const dotenv = await loadDotEnv(tmp);
      expect(resolveEnvironmentVariables(envCfg, 'dev')).toEqual({
        app: 'caliber',
        baseUrl: 'http://127.0.0.1:3000',
      });
      expect(dotenv).toEqual({ API_SECRET: 'xyz' });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('Core: curlCodec', () => {
  it('parses multiline cURL with headers, basic auth, and JSON body and exports back', () => {
    const cmd = `curl -X POST https://api.example.com/v1/orders \\
      -H 'Content-Type: application/json' \\
      -u alice:secret \\
      --data-raw '{"item":"widget","qty":2}'`;

    const req = parseCurl(cmd);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/v1/orders');
    expect(req.body).toBe('{"item":"widget","qty":2}');
    expect(req.headers.some((h) => h.key === 'Authorization' && h.value.startsWith('Basic '))).toBe(true);

    const exported = toCurl(req);
    expect(exported).toContain('-X POST');
    expect(exported).toContain("'https://api.example.com/v1/orders'");
    expect(exported).toContain("--data-raw '{\"item\":\"widget\",\"qty\":2}'");
  });
});

describe('Core: historyStore', () => {
  it('enforces max ring buffer size and persists across reloads', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caliber-hist-'));
    const histFile = path.join(tmp, 'history.json');
    try {
      const store = new HistoryStore({ filePath: histFile, maxEntries: 3 });
      for (let i = 1; i <= 5; i++) {
        await store.record(
          {
            id: `r${i}`,
            name: `Req ${i}`,
            method: 'GET',
            url: `http://localhost/${i}`,
            headers: [],
            assertions: [],
            lineStart: 0,
            lineEnd: 0,
          },
          {
            requestId: `r${i}`,
            status: 200,
            statusText: 'OK',
            durationMs: i * 10,
            sizeBytes: 100,
            headers: {},
            bodyText: '{}',
            timestampIso: new Date().toISOString(),
          }
        );
      }

      expect(store.getAll()).toHaveLength(3);
      expect(store.getAll()[0].requestId).toBe('r5');

      const reloaded = new HistoryStore({ filePath: histFile, maxEntries: 3 });
      const entries = await reloaded.load();
      expect(entries).toHaveLength(3);
      expect(entries[2].requestId).toBe('r3');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('Core: httpExecutor (real localhost HTTP server)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        if (req.url === '/echo') {
          res.writeHead(200, {
            'content-type': 'application/json',
            'x-custom': 'caliber-ok',
          });
          res.end(
            JSON.stringify({
              method: req.method,
              header: req.headers['x-test'] || null,
              body: rawBody ? JSON.parse(rawBody) : null,
            })
          );
          return;
        }
        if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200);
            res.end('slow');
          }, 500);
          return;
        }
        res.writeHead(404);
        res.end('not found');
      });
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

  it('executes POST JSON requests and records timing, size, headers, and parsed JSON', async () => {
    const req = interpolateRequest(
      {
        id: 'echo',
        name: 'Echo',
        method: 'POST',
        url: '{{base}}/echo',
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true },
          { key: 'X-Test', value: 'hello', enabled: true },
        ],
        body: '{"ping":"pong"}',
        assertions: [],
        lineStart: 0,
        lineEnd: 0,
      },
      { fileVariables: { base: baseUrl } }
    );

    const res = await executeHttpRequest(req);
    expect(res.error).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.headers['x-custom']).toBe('caliber-ok');
    expect(res.sizeBytes).toBeGreaterThan(0);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(res.bodyJson).toEqual({
      method: 'POST',
      header: 'hello',
      body: { ping: 'pong' },
    });
  });

  it('wraps GraphQL query + variables into GraphQL-over-HTTP JSON envelope', async () => {
    const res = await executeHttpRequest({
      id: 'gql',
      name: 'GQL',
      method: 'POST',
      url: `${baseUrl}/echo`,
      headers: [{ key: 'X-REQUEST-TYPE', value: 'GraphQL', enabled: true }],
      body: 'query($id: Int!) { item(id: $id) { name } }',
      graphqlVariables: '{"id": 7}',
      assertions: [],
      lineStart: 0,
      lineEnd: 0,
    });

    expect(res.status).toBe(200);
    expect(res.bodyJson).toMatchObject({
      body: {
        query: 'query($id: Int!) { item(id: $id) { name } }',
        variables: { id: 7 },
      },
    });
  });

  it('aborts cleanly on timeout', async () => {
    const res = await executeHttpRequest(
      {
        id: 'slow',
        name: 'Slow',
        method: 'GET',
        url: `${baseUrl}/slow`,
        headers: [],
        assertions: [],
        lineStart: 0,
        lineEnd: 0,
      },
      { timeoutMs: 50 }
    );
    expect(res.status).toBe(0);
    expect(res.error).toBeTruthy();
  });
});

describe('Core: openapiImporter (OpenAPI 3.0/3.1 JSON -> .http)', () => {
  it('extracts servers, path/query params, bearer & API-key auth, $ref schemas, and generates valid .http', () => {
    const spec = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Payments API', version: '1.0.0' },
      servers: [
        {
          url: 'https://{env}.payments.example.com/v1',
          variables: { env: { default: 'sandbox' } },
        },
      ],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
          apiKeyAuth: { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
        },
        schemas: {
          CreateCharge: {
            type: 'object',
            properties: {
              amount: { type: 'integer', example: 2500 },
              currency: { type: 'string', enum: ['USD', 'EUR'] },
              customerEmail: { type: 'string', format: 'email' },
            },
          },
        },
      },
      paths: {
        '/charges/{chargeId}': {
          get: {
            operationId: 'getCharge',
            summary: 'Retrieve a charge',
            parameters: [
              { name: 'chargeId', in: 'path', required: true, example: 'ch_123' },
              { name: 'expand', in: 'query', example: 'customer' },
            ],
          },
        },
        '/charges': {
          post: {
            operationId: 'createCharge',
            summary: 'Create a charge',
            security: [{ apiKeyAuth: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateCharge' },
                },
              },
            },
          },
        },
      },
    });

    const result = importOpenApiToHttp(spec);
    expect(result.title).toBe('Payments API');
    expect(result.baseUrl).toBe('https://sandbox.payments.example.com/v1');
    expect(result.operationCount).toBe(2);
    expect(result.httpContent).toContain('@baseUrl = https://sandbox.payments.example.com/v1');
    expect(result.httpContent).toContain('GET {{baseUrl}}/charges/ch_123?expand=customer');
    expect(result.httpContent).toContain('Authorization: Bearer {{bearerToken}}');
    expect(result.httpContent).toContain('POST {{baseUrl}}/charges');
    expect(result.httpContent).toContain('X-Api-Key: {{apiKey}}');
    expect(result.httpContent).toContain('"amount": 2500');
    expect(result.httpContent).toContain('"currency": "USD"');
    expect(result.httpContent).toContain('"customerEmail": "user@example.com"');

    // Ensure generated .http round-trips cleanly through parseHttpDocument
    const reparsed = parseHttpDocument(result.httpContent, 'payments.http');
    expect(reparsed.requests).toHaveLength(2);
    expect(reparsed.requests[0].id).toBe('getCharge');
    expect(reparsed.requests[1].id).toBe('createCharge');
  });

  it('rejects invalid JSON and OpenAPI documents missing paths', () => {
    expect(() => importOpenApiToHttp('{not valid json')).toThrow(/Invalid OpenAPI JSON/);
    expect(() => importOpenApiToHttp('{"openapi":"3.0.3"}')).toThrow(/missing top-level "paths"/);
  });
});
