import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  DriftFinding,
  ExecutionResult,
  ResponseSnapshot,
  SchemaNode,
} from '../core/types.js';

export function inferSchema(value: unknown): SchemaNode {
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: { type: 'unknown' } };
    }
    return { type: 'array', items: inferSchema(value[0]) };
  }
  switch (typeof value) {
    case 'string':
      return { type: 'string' };
    case 'boolean':
      return { type: 'boolean' };
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'object': {
      const properties: Record<string, SchemaNode> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        properties[k] = inferSchema(v);
      }
      return { type: 'object', properties };
    }
    default:
      return { type: 'unknown' };
  }
}

export function buildSnapshot(
  requestId: string,
  result: ExecutionResult
): ResponseSnapshot {
  let parsed = result.bodyJson;
  if (parsed === undefined && result.bodyText) {
    try {
      parsed = JSON.parse(result.bodyText);
    } catch {
      parsed = result.bodyText;
    }
  }
  const contentType = Object.entries(result.headers).find(
    ([k]) => k.toLowerCase() === 'content-type'
  )?.[1];

  return {
    requestId,
    capturedAtIso: new Date().toISOString(),
    status: result.status,
    contentType,
    schema: inferSchema(parsed),
    sampleBody: parsed,
  };
}

function sanitizeSnapshotFilename(requestId: string): string {
  return requestId.replace(/[^a-zA-Z0-9_.-]+/g, '_') + '.json';
}

export function getSnapshotDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.caliber', 'snapshots');
}

export async function saveSnapshot(
  workspaceRoot: string,
  requestId: string,
  result: ExecutionResult
): Promise<{ filePath: string; snapshot: ResponseSnapshot }> {
  const dir = getSnapshotDir(workspaceRoot);
  await fs.mkdir(dir, { recursive: true });
  const snapshot = buildSnapshot(requestId, result);
  const filePath = path.join(dir, sanitizeSnapshotFilename(requestId));
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return { filePath, snapshot };
}

export async function loadSnapshot(
  workspaceRoot: string,
  requestId: string
): Promise<ResponseSnapshot | null> {
  const filePath = path.join(
    getSnapshotDir(workspaceRoot),
    sanitizeSnapshotFilename(requestId)
  );
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ResponseSnapshot;
  } catch {
    return null;
  }
}

function compareSchemas(
  baseline: SchemaNode,
  current: SchemaNode,
  currentPath: string,
  findings: DriftFinding[]
): void {
  if (baseline.type === 'unknown' || current.type === 'unknown') {
    return;
  }

  // integer -> number is a widening change (warning), number -> integer is narrowing (breaking)
  if (baseline.type !== current.type) {
    const isWideningNumber =
      baseline.type === 'integer' && current.type === 'number';
    findings.push({
      path: currentPath,
      severity: isWideningNumber ? 'warning' : 'breaking',
      kind: 'type_changed',
      expected: baseline.type,
      actual: current.type,
    });
    return;
  }

  if (baseline.type === 'object') {
    const baseProps = baseline.properties ?? {};
    const currProps = current.properties ?? {};

    for (const [key, baseChild] of Object.entries(baseProps)) {
      const childPath = `${currentPath}.${key}`;
      if (!(key in currProps)) {
        findings.push({
          path: childPath,
          severity: 'breaking',
          kind: 'removed_field',
          expected: baseChild.type,
          actual: 'missing',
        });
      } else {
        compareSchemas(baseChild, currProps[key], childPath, findings);
      }
    }

    for (const [key, currChild] of Object.entries(currProps)) {
      if (!(key in baseProps)) {
        findings.push({
          path: `${currentPath}.${key}`,
          severity: 'info',
          kind: 'added_field',
          expected: 'absent',
          actual: currChild.type,
        });
      }
    }
    return;
  }

  if (baseline.type === 'array' && baseline.items && current.items) {
    compareSchemas(
      baseline.items,
      current.items,
      `${currentPath}[]`,
      findings
    );
  }
}

export function diffSnapshot(
  baseline: ResponseSnapshot,
  current: ExecutionResult
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  if (baseline.status !== current.status) {
    const baseOk = baseline.status >= 200 && baseline.status < 300;
    const currOk = current.status >= 200 && current.status < 300;
    findings.push({
      path: '$status',
      severity: baseOk !== currOk ? 'breaking' : 'warning',
      kind: 'status_changed',
      expected: String(baseline.status),
      actual: String(current.status),
    });
  }

  let parsed = current.bodyJson;
  if (parsed === undefined && current.bodyText) {
    try {
      parsed = JSON.parse(current.bodyText);
    } catch {
      parsed = current.bodyText;
    }
  }
  const currentSchema = inferSchema(parsed);
  compareSchemas(baseline.schema, currentSchema, '$', findings);

  return findings;
}
