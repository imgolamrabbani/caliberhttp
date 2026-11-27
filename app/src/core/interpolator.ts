import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EnvConfig, ExecutionResult, HttpRequestBlock } from './types.js';

export interface InterpolationContext {
  fileVariables?: Record<string, string>;
  envVariables?: Record<string, string>;
  dotenvVariables?: Record<string, string>;
  vaultSecrets?: Record<string, string>;
  stepResults?: Record<string, ExecutionResult>;
}

/**
 * Evaluates a lightweight JSONPath expression against a parsed JSON value.
 * Supports: `$`, `$.a.b`, `$.items[0].id`, `$.items[*].id`, `$.items.length`, `a.b`.
 */
export function evaluateJsonPath(data: unknown, expr: string): unknown {
  if (data === null || data === undefined) {
    return undefined;
  }

  let normalized = expr.trim();
  if (normalized === '$' || normalized === '') {
    return data;
  }
  if (normalized.startsWith('$.')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('$')) {
    normalized = normalized.slice(1);
  }

  const tokens: Array<string | number | '*'> = [];
  const tokenRegex = /([^.[\]]+)|\[(\d+|\*|'[^']*'|"[^"]*")\]/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      const inner = match[2];
      if (inner === '*') {
        tokens.push('*');
      } else if (/^\d+$/.test(inner)) {
        tokens.push(Number(inner));
      } else {
        tokens.push(inner.slice(1, -1));
      }
    }
  }

  return traverse(data, tokens, 0);
}

function traverse(
  current: unknown,
  tokens: Array<string | number | '*'>,
  index: number
): unknown {
  if (index >= tokens.length) {
    return current;
  }
  if (current === null || current === undefined) {
    return undefined;
  }

  const token = tokens[index];

  if (token === '*') {
    if (!Array.isArray(current)) {
      return undefined;
    }
    return current.map((item) => traverse(item, tokens, index + 1));
  }

  if (typeof token === 'number') {
    if (!Array.isArray(current)) {
      return undefined;
    }
    return traverse(current[token], tokens, index + 1);
  }

  if (token === 'length' && Array.isArray(current)) {
    return traverse(current.length, tokens, index + 1);
  }

  if (typeof current === 'object') {
    const rec = current as Record<string, unknown>;
    return traverse(rec[token], tokens, index + 1);
  }

  return undefined;
}

export function resolveDynamicVariable(expr: string): string | undefined {
  const trimmed = expr.trim();
  if (trimmed === '$uuid' || trimmed === '$guid') {
    return crypto.randomUUID();
  }
  if (trimmed === '$timestamp') {
    return String(Math.floor(Date.now() / 1000));
  }
  if (trimmed === '$isoTimestamp' || trimmed === '$datetime') {
    return new Date().toISOString();
  }
  if (trimmed === '$randomInt') {
    return String(crypto.randomInt(0, 100000));
  }
  const randomRange = trimmed.match(/^\$randomInt\s+(-?\d+)\s+(-?\d+)$/);
  if (randomRange) {
    const min = Number(randomRange[1]);
    const max = Number(randomRange[2]);
    if (max > min) {
      return String(crypto.randomInt(min, max + 1));
    }
    return String(min);
  }
  return undefined;
}

function resolveStepReference(
  expr: string,
  stepResults?: Record<string, ExecutionResult>
): string | undefined {
  if (!stepResults) {
    return undefined;
  }

  // {{stepName.response.body.$.path}} or {{stepName.response.body.path}}
  const bodyMatch = expr.match(/^([a-zA-Z0-9_.-]+)\.response\.body\.(.+)$/);
  if (bodyMatch) {
    const step = stepResults[bodyMatch[1]];
    if (!step) return undefined;
    let source = step.bodyJson;
    if (source === undefined && step.bodyText) {
      try {
        source = JSON.parse(step.bodyText);
      } catch {
        return undefined;
      }
    }
    const val = evaluateJsonPath(source, bodyMatch[2]);
    if (val === undefined || val === null) return undefined;
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  // {{stepName.response.headers.X-Token}}
  const headerMatch = expr.match(
    /^([a-zA-Z0-9_.-]+)\.response\.headers\.(.+)$/i
  );
  if (headerMatch) {
    const step = stepResults[headerMatch[1]];
    if (!step) return undefined;
    const targetKey = headerMatch[2].toLowerCase();
    for (const [k, v] of Object.entries(step.headers)) {
      if (k.toLowerCase() === targetKey) {
        return v;
      }
    }
    return undefined;
  }

  // {{stepName.response.status}}
  const statusMatch = expr.match(/^([a-zA-Z0-9_.-]+)\.response\.status$/);
  if (statusMatch) {
    const step = stepResults[statusMatch[1]];
    return step ? String(step.status) : undefined;
  }

  return undefined;
}

/**
 * Interpolates `{{var}}`, dynamic built-ins, vault secrets, and step chaining references.
 * Precedence (highest to lowest):
 * 1. Dynamic built-ins (`{{$uuid}}`, `{{$timestamp}}`, `{{$randomInt}}`)
 * 2. Step chaining references (`{{step.response.body.$.token}}`)
 * 3. Vault secrets (`{{vault.SECRET_KEY}}` or direct key match)
 * 4. File-level `@var`
 * 5. Active environment (`caliber.env.json`)
 * 6. Workspace `.env`
 */
export function interpolateString(
  input: string,
  ctx: InterpolationContext
): string {
  let result = input;
  // Up to 3 passes to support nested variable references like @url = {{baseUrl}}/users
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    result = result.replace(/\{\{([^}]+)\}\}/g, (fullMatch, rawKey: string) => {
      const key = rawKey.trim();

      if (key.startsWith('$')) {
        const dyn = resolveDynamicVariable(key);
        if (dyn !== undefined) {
          changed = true;
          return dyn;
        }
      }

      if (key.includes('.response.')) {
        const stepVal = resolveStepReference(key, ctx.stepResults);
        if (stepVal !== undefined) {
          changed = true;
          return stepVal;
        }
      }

      if (key.startsWith('vault.') && ctx.vaultSecrets) {
        const secretKey = key.slice(6);
        if (secretKey in ctx.vaultSecrets) {
          changed = true;
          return ctx.vaultSecrets[secretKey];
        }
      }

      if (ctx.vaultSecrets && key in ctx.vaultSecrets) {
        changed = true;
        return ctx.vaultSecrets[key];
      }

      if (ctx.fileVariables && key in ctx.fileVariables) {
        changed = true;
        return ctx.fileVariables[key];
      }

      if (ctx.envVariables && key in ctx.envVariables) {
        changed = true;
        return ctx.envVariables[key];
      }

      if (ctx.dotenvVariables && key in ctx.dotenvVariables) {
        changed = true;
        return ctx.dotenvVariables[key];
      }

      return fullMatch;
    });
    if (!changed) break;
  }
  return result;
}

export function interpolateRequest(
  req: HttpRequestBlock,
  ctx: InterpolationContext
): HttpRequestBlock {
  return {
    ...req,
    url: interpolateString(req.url, ctx),
    headers: req.headers.map((h) => ({
      ...h,
      key: interpolateString(h.key, ctx),
      value: interpolateString(h.value, ctx),
    })),
    body: req.body !== undefined ? interpolateString(req.body, ctx) : undefined,
    graphqlVariables:
      req.graphqlVariables !== undefined
        ? interpolateString(req.graphqlVariables, ctx)
        : undefined,
  };
}

export function parseDotEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).replace(/^export\s+/, '').trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export async function loadDotEnv(
  workspaceRoot: string
): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(path.join(workspaceRoot, '.env'), 'utf8');
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

export async function loadEnvConfig(
  workspaceRoot: string
): Promise<EnvConfig> {
  try {
    const content = await fs.readFile(
      path.join(workspaceRoot, 'caliber.env.json'),
      'utf8'
    );
    const parsed = JSON.parse(content) as EnvConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getEnvironmentNames(config: EnvConfig): string[] {
  return Object.keys(config).filter((k) => k !== '$shared');
}

export function resolveEnvironmentVariables(
  config: EnvConfig,
  envName?: string
): Record<string, string> {
  const shared = config.$shared ?? {};
  const specific = envName && config[envName] ? config[envName]! : {};
  return { ...shared, ...specific };
}
