import { serializeHttpDocument } from './httpParser';
import type {
  HttpDocument,
  HttpHeader,
  HttpMethod,
  HttpRequestBlock,
} from './types';

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  example?: unknown;
  schema?: Record<string, unknown>;
}

interface OpenApiSecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  parameters?: Array<OpenApiParameter | { $ref: string }>;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    content?: Record<
      string,
      {
        example?: unknown;
        examples?: Record<string, { value?: unknown }>;
        schema?: Record<string, unknown>;
      }
    >;
  };
}

interface OpenApiSpec {
  openapi?: string;
  info?: { title?: string; version?: string };
  servers?: Array<{
    url?: string;
    variables?: Record<string, { default?: string }>;
  }>;
  security?: Array<Record<string, string[]>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
    parameters?: Record<string, OpenApiParameter>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  paths?: Record<
    string,
    {
      parameters?: Array<OpenApiParameter | { $ref: string }>;
      [method: string]: unknown;
    }
  >;
}

export interface OpenApiImportResult {
  title: string;
  baseUrl: string;
  document: HttpDocument;
  httpContent: string;
  operationCount: number;
}

const VALID_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

function resolveRef(
  spec: OpenApiSpec,
  ref: string
): Record<string, unknown> | undefined {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let cursor: unknown = spec;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in cursor) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor && typeof cursor === 'object'
    ? (cursor as Record<string, unknown>)
    : undefined;
}

function synthesizeSchemaValue(
  schema: Record<string, unknown> | undefined,
  spec: OpenApiSpec,
  depth = 0,
  seenRefs = new Set<string>()
): unknown {
  if (!schema || typeof schema !== 'object' || depth > 6) {
    return {};
  }

  if (typeof schema.$ref === 'string') {
    if (seenRefs.has(schema.$ref)) return {};
    const target = resolveRef(spec, schema.$ref);
    if (!target) return {};
    const nextSeen = new Set(seenRefs);
    nextSeen.add(schema.$ref);
    return synthesizeSchemaValue(target, spec, depth + 1, nextSeen);
  }

  if ('example' in schema) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }
  if ('default' in schema) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const part of schema.allOf) {
      const val = synthesizeSchemaValue(
        part as Record<string, unknown>,
        spec,
        depth + 1,
        seenRefs
      );
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(merged, val);
      }
    }
    return merged;
  }

  const rawType = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null') ?? schema.type[0]
    : schema.type;

  if (rawType === 'string') {
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'uuid') return '{{$uuid}}';
    if (schema.format === 'date-time') return '{{$isoTimestamp}}';
    if (schema.format === 'date') return '2026-01-01';
    if (schema.format === 'uri' || schema.format === 'url') {
      return 'https://example.com';
    }
    return 'string';
  }
  if (rawType === 'integer') return 1;
  if (rawType === 'number') return 1.5;
  if (rawType === 'boolean') return true;
  if (rawType === 'array') {
    return [
      synthesizeSchemaValue(
        schema.items as Record<string, unknown> | undefined,
        spec,
        depth + 1,
        seenRefs
      ),
    ];
  }
  if (rawType === 'object' || schema.properties) {
    const out: Record<string, unknown> = {};
    const props = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [k, v] of Object.entries(props)) {
      out[k] = synthesizeSchemaValue(v, spec, depth + 1, seenRefs);
    }
    return out;
  }

  return {};
}

function resolveServerUrl(spec: OpenApiSpec): string {
  const first = spec.servers?.[0];
  if (!first?.url) {
    return 'https://api.example.com';
  }
  let url = first.url.trim();
  if (first.variables) {
    for (const [k, v] of Object.entries(first.variables)) {
      if (v?.default !== undefined) {
        url = url.replace(new RegExp(`\\{${k}\\}`, 'g'), v.default);
      }
    }
  }
  return url.replace(/\/+$/, '');
}

function resolveParameter(
  param: OpenApiParameter | { $ref: string },
  spec: OpenApiSpec
): OpenApiParameter | undefined {
  if ('$ref' in param && typeof param.$ref === 'string') {
    return resolveRef(spec, param.$ref) as OpenApiParameter | undefined;
  }
  return param as OpenApiParameter;
}

export function importOpenApiToHttp(jsonText: string): OpenApiImportResult {
  let spec: OpenApiSpec;
  try {
    spec = JSON.parse(jsonText) as OpenApiSpec;
  } catch (err) {
    throw new Error(
      `Invalid OpenAPI JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    throw new Error(
      'Invalid OpenAPI 3.x document: missing top-level "paths" object.'
    );
  }

  const title = spec.info?.title?.trim() || 'OpenAPI Collection';
  const baseUrl = resolveServerUrl(spec);
  const variables: Record<string, string> = { baseUrl };
  const securitySchemes = spec.components?.securitySchemes ?? {};
  const requests: HttpRequestBlock[] = [];

  for (const [rawPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const sharedParams = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];

    for (const [rawMethod, rawOp] of Object.entries(pathItem)) {
      const method = rawMethod.toUpperCase() as HttpMethod;
      if (!VALID_METHODS.has(method) || !rawOp || typeof rawOp !== 'object') {
        continue;
      }

      const op = rawOp as OpenApiOperation;
      const allParams = [
        ...sharedParams,
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ]
        .map((p) => resolveParameter(p, spec))
        .filter((p): p is OpenApiParameter => Boolean(p && p.name));

      // Substitute path parameters `{id}` -> `1` or example value
      let resolvedPath = rawPath;
      const queryPairs: string[] = [];
      const headers: HttpHeader[] = [];

      for (const param of allParams) {
        const sampleVal =
          param.example !== undefined
            ? String(param.example)
            : param.schema
              ? String(synthesizeSchemaValue(param.schema, spec))
              : `{{${param.name}}}`;

        if (param.in === 'path') {
          resolvedPath = resolvedPath.replace(
            new RegExp(`\\{${param.name}\\}`, 'g'),
            encodeURIComponent(sampleVal)
          );
        } else if (param.in === 'query') {
          queryPairs.push(
            `${encodeURIComponent(param.name)}=${encodeURIComponent(sampleVal)}`
          );
        } else if (param.in === 'header') {
          headers.push({ key: param.name, value: sampleVal, enabled: true });
        }
      }

      // Security schemes (operation-level overrides top-level)
      const secReqs = op.security ?? spec.security ?? [];
      if (secReqs.length > 0) {
        const firstReq = secReqs[0];
        for (const schemeName of Object.keys(firstReq)) {
          const scheme = securitySchemes[schemeName];
          if (!scheme) continue;
          if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer') {
            variables.bearerToken = variables.bearerToken ?? 'YOUR_BEARER_TOKEN';
            headers.push({
              key: 'Authorization',
              value: 'Bearer {{bearerToken}}',
              enabled: true,
            });
          } else if (
            scheme.type === 'http' &&
            scheme.scheme?.toLowerCase() === 'basic'
          ) {
            variables.basicAuth = variables.basicAuth ?? 'dXNlcjpwYXNz';
            headers.push({
              key: 'Authorization',
              value: 'Basic {{basicAuth}}',
              enabled: true,
            });
          } else if (scheme.type === 'apiKey' && scheme.name) {
            variables.apiKey = variables.apiKey ?? 'YOUR_API_KEY';
            if (scheme.in === 'query') {
              queryPairs.push(`${encodeURIComponent(scheme.name)}={{apiKey}}`);
            } else if (scheme.in === 'header') {
              headers.push({
                key: scheme.name,
                value: '{{apiKey}}',
                enabled: true,
              });
            }
          }
        }
      }

      // Request body synthesis
      let body: string | undefined;
      const jsonContent = op.requestBody?.content?.['application/json'];
      if (jsonContent) {
        if (
          !headers.some((h) => h.key.toLowerCase() === 'content-type')
        ) {
          headers.push({
            key: 'Content-Type',
            value: 'application/json',
            enabled: true,
          });
        }
        let payload: unknown;
        if ('example' in jsonContent) {
          payload = jsonContent.example;
        } else if (
          jsonContent.examples &&
          typeof jsonContent.examples === 'object'
        ) {
          const firstEx = Object.values(jsonContent.examples)[0];
          payload = firstEx?.value ?? {};
        } else if (jsonContent.schema) {
          payload = synthesizeSchemaValue(jsonContent.schema, spec);
        } else {
          payload = {};
        }
        body = JSON.stringify(payload, null, 2);
      }

      const querySuffix =
        queryPairs.length > 0 ? `?${queryPairs.join('&')}` : '';
      const fullUrl = `{{baseUrl}}${resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`}${querySuffix}`;

      const opId =
        op.operationId?.replace(/[^a-zA-Z0-9_.-]+/g, '_') ||
        `${method.toLowerCase()}_${rawPath
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'root'}_${requests.length + 1}`;
      const name = op.summary?.trim() || op.operationId?.trim() || `${method} ${rawPath}`;

      requests.push({
        id: opId,
        name,
        method,
        url: fullUrl,
        headers,
        body,
        assertions: [],
        lineStart: 0,
        lineEnd: 0,
      });
    }
  }

  const document: HttpDocument = {
    variables,
    requests,
  };

  return {
    title,
    baseUrl,
    document,
    httpContent: serializeHttpDocument(document),
    operationCount: requests.length,
  };
}
