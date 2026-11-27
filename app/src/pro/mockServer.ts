import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseHttpDocument } from '../core/httpParser.js';
import type { HttpMethod, MockRequestLog, MockRoute } from '../core/types.js';

function normalizePath(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, 'http://127.0.0.1');
    return u.pathname;
  } catch {
    // Strip template variables like {{baseUrl}}
    const stripped = rawUrl.replace(/\{\{[^}]+\}\}/g, '');
    const qIdx = stripped.indexOf('?');
    const clean = qIdx >= 0 ? stripped.slice(0, qIdx) : stripped;
    return clean.startsWith('/') ? clean : `/${clean}`;
  }
}

function matchPathPattern(pattern: string, actualPath: string): boolean {
  const patSegs = pattern.replace(/\/+$/, '').split('/').filter(Boolean);
  const actSegs = actualPath.replace(/\/+$/, '').split('/').filter(Boolean);
  if (patSegs.length !== actSegs.length) {
    return false;
  }
  for (let i = 0; i < patSegs.length; i++) {
    const p = patSegs[i];
    if (p === '*' || p.startsWith(':') || (p.startsWith('{') && p.endsWith('}'))) {
      continue;
    }
    if (p !== actSegs[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Generates MockRoutes from a `.http` fixture file.
 * If a request block has a JSON body, it serves that body as a 200 mock response
 * (or uses `@mockStatus 201` if present in headers/comments, or synthesizes a clean JSON payload).
 */
export function routesFromHttpContent(
  content: string,
  sourceName = 'fixture.http'
): MockRoute[] {
  const doc = parseHttpDocument(content, sourceName);
  const routes: MockRoute[] = [];

  for (const req of doc.requests) {
    const pathPattern = normalizePath(req.url);
    let status = 200;
    const statusHeader = req.headers.find(
      (h) => h.key.toLowerCase() === 'x-mock-status'
    );
    if (statusHeader && /^\d{3}$/.test(statusHeader.value)) {
      status = Number(statusHeader.value);
    }

    const body =
      req.body && req.body.trim().length > 0
        ? req.body
        : JSON.stringify(
            {
              mock: true,
              request: req.name,
              method: req.method,
              path: pathPattern,
            },
            null,
            2
          );

    const isJson =
      body.trimStart().startsWith('{') || body.trimStart().startsWith('[');

    routes.push({
      method: req.method,
      pathPattern,
      status,
      headers: {
        'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        'x-caliber-mock': 'true',
      },
      body,
      source: sourceName,
    });
  }

  return routes;
}

function synthesizeFromOpenApiSchema(schema: Record<string, unknown> | undefined): unknown {
  if (!schema || typeof schema !== 'object') {
    return { ok: true };
  }
  if ('example' in schema) {
    return schema.example;
  }
  const type = schema.type;
  if (type === 'string') return 'string_example';
  if (type === 'integer') return 42;
  if (type === 'number') return 3.14;
  if (type === 'boolean') return true;
  if (type === 'array') {
    return [synthesizeFromOpenApiSchema(schema.items as Record<string, unknown> | undefined)];
  }
  if (type === 'object' || schema.properties) {
    const out: Record<string, unknown> = {};
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [k, v] of Object.entries(props)) {
      out[k] = synthesizeFromOpenApiSchema(v);
    }
    return out;
  }
  return {};
}

/**
 * Generates MockRoutes from an OpenAPI 3.0/3.1 JSON document.
 */
export function routesFromOpenApiJson(
  jsonText: string,
  sourceName = 'openapi.json'
): MockRoute[] {
  const spec = JSON.parse(jsonText) as {
    paths?: Record<string, Record<string, Record<string, unknown>>>;
  };
  const routes: MockRoute[] = [];
  const validMethods = new Set<HttpMethod>([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
  ]);

  if (!spec.paths || typeof spec.paths !== 'object') {
    return routes;
  }

  for (const [pathPattern, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [rawMethod, operation] of Object.entries(pathItem)) {
      const method = rawMethod.toUpperCase() as HttpMethod;
      if (!validMethods.has(method) || !operation || typeof operation !== 'object') {
        continue;
      }

      const responses = (operation.responses ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const statusKey =
        Object.keys(responses).find((s) => s.startsWith('2')) ??
        Object.keys(responses)[0] ??
        '200';
      const status = /^\d{3}$/.test(statusKey) ? Number(statusKey) : 200;
      const respObj = responses[statusKey] ?? {};
      const content = (respObj.content ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const jsonMedia = content['application/json'];

      let payload: unknown = { ok: true, operationId: operation.operationId };
      if (jsonMedia) {
        if ('example' in jsonMedia) {
          payload = jsonMedia.example;
        } else if (jsonMedia.examples && typeof jsonMedia.examples === 'object') {
          const firstEx = Object.values(
            jsonMedia.examples as Record<string, Record<string, unknown>>
          )[0];
          if (firstEx && 'value' in firstEx) {
            payload = firstEx.value;
          }
        } else if (jsonMedia.schema) {
          payload = synthesizeFromOpenApiSchema(
            jsonMedia.schema as Record<string, unknown>
          );
        }
      }

      routes.push({
        method,
        pathPattern,
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-caliber-mock': 'openapi',
        },
        body: JSON.stringify(payload, null, 2),
        source: sourceName,
      });
    }
  }

  return routes;
}

export class LocalMockServer {
  private server: http.Server | null = null;
  private routes: MockRoute[] = [];
  private requestLogs: MockRequestLog[] = [];
  private boundPort: number | null = null;

  setRoutes(routes: MockRoute[]): void {
    this.routes = [...routes];
  }

  getRoutes(): MockRoute[] {
    return [...this.routes];
  }

  getLogs(): MockRequestLog[] {
    return [...this.requestLogs];
  }

  clearLogs(): void {
    this.requestLogs = [];
  }

  isRunning(): boolean {
    return this.server !== null && this.boundPort !== null;
  }

  getAddress(): string | null {
    if (!this.isRunning() || this.boundPort === null) {
      return null;
    }
    return `http://127.0.0.1:${this.boundPort}`;
  }

  getPort(): number | null {
    return this.boundPort;
  }

  async start(port = 4010): Promise<{ host: string; port: number; url: string }> {
    if (this.server) {
      await this.stop();
    }

    const server = http.createServer((req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const reqPath = parsedUrl.pathname;

      // Always support CORS preflight locally for frontend dev
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'
      );
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const matched = this.routes.find(
        (r) =>
          (r.method === '*' || r.method === method) &&
          matchPathPattern(r.pathPattern, reqPath)
      );

      if (!matched) {
        this.recordLog({
          timestampIso: new Date().toISOString(),
          method,
          path: reqPath,
          status: 404,
        });
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            error: 'No mock route matched',
            method,
            path: reqPath,
            availableRoutes: this.routes.map((r) => `${r.method} ${r.pathPattern}`),
          })
        );
        return;
      }

      this.recordLog({
        timestampIso: new Date().toISOString(),
        method,
        path: reqPath,
        status: matched.status,
        matchedPattern: matched.pathPattern,
      });

      res.writeHead(matched.status, matched.headers);
      res.end(matched.body);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    const addr = server.address() as AddressInfo;
    this.server = server;
    this.boundPort = addr.port;
    return {
      host: '127.0.0.1',
      port: addr.port,
      url: `http://127.0.0.1:${addr.port}`,
    };
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    const srv = this.server;
    this.server = null;
    this.boundPort = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
  }

  private recordLog(log: MockRequestLog): void {
    this.requestLogs.unshift(log);
    if (this.requestLogs.length > 200) {
      this.requestLogs.length = 200;
    }
  }
}
