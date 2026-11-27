import crypto from 'node:crypto';
import type {
  AssertionOperator,
  AssertionRule,
  AssertionTarget,
  HttpDocument,
  HttpHeader,
  HttpMethod,
  HttpRequestBlock,
} from './types.js';

const HTTP_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const REQUEST_LINE_REGEX =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)(?:\s+(HTTP\/[\d.]+))?\s*$/i;
const VAR_DECL_REGEX = /^@([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/;
const NAME_DIRECTIVE_REGEX = /^(?:#+|\/\/)?\s*@name\s+([a-zA-Z0-9_.-]+)\s*$/i;
const ASSERT_DIRECTIVE_REGEX = /^(?:#+|\/\/)?\s*@assert\s+(.+)$/i;
const HEADER_LINE_REGEX = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/;
const DISABLED_HEADER_REGEX = /^(?:#|\/\/)\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/;

function stableId(name: string, method: string, url: string, index: number): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (clean.length > 0) {
    return clean;
  }
  const hash = crypto
    .createHash('sha1')
    .update(`${index}:${method}:${url}`)
    .digest('hex')
    .slice(0, 8);
  return `req_${index + 1}_${hash}`;
}

export function parseAssertionDirective(rawExpr: string): AssertionRule | null {
  const trimmed = rawExpr.trim();
  if (!trimmed) {
    return null;
  }

  // Handle unary `exists`: `@assert body.$.data.id exists`
  const existsMatch = trimmed.match(/^(\S+)\s+exists$/i);
  if (existsMatch) {
    const target = normalizeAssertionTarget(existsMatch[1]);
    if (!target) return null;
    return { target, operator: 'exists', raw: trimmed };
  }

  const binaryMatch = trimmed.match(
    /^(\S+)\s+(==|!=|<=|>=|<|>|contains)\s+(.+)$/i
  );
  if (!binaryMatch) {
    return null;
  }

  const target = normalizeAssertionTarget(binaryMatch[1]);
  if (!target) return null;
  const operator = binaryMatch[2].toLowerCase() as AssertionOperator;
  const rawExpected = binaryMatch[3].trim();
  const expected = parseExpectedLiteral(rawExpected);

  return {
    target,
    operator,
    expected,
    raw: trimmed,
  };
}

function normalizeAssertionTarget(raw: string): AssertionTarget | null {
  const lower = raw.toLowerCase();
  if (lower === 'status' || lower === 'latency') {
    return lower;
  }
  if (lower.startsWith('header.') && raw.length > 7) {
    return `header.${raw.slice(7).toLowerCase()}`;
  }
  if (lower.startsWith('body.') && raw.length > 5) {
    return `body.${raw.slice(5)}`;
  }
  return null;
}

function parseExpectedLiteral(raw: string): string | number | boolean {
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

function splitGraphQLBody(
  body: string,
  headers: HttpHeader[]
): { body: string; graphqlVariables?: string } {
  const isGraphQL = headers.some(
    (h) =>
      h.enabled &&
      ((h.key.toLowerCase() === 'x-request-type' &&
        h.value.toLowerCase() === 'graphql') ||
        (h.key.toLowerCase() === 'content-type' &&
          h.value.toLowerCase().includes('application/graphql')))
  );
  if (!isGraphQL) {
    return { body };
  }

  // Split query and optional JSON variables block separated by one or more blank lines
  const trimmed = body.trim();
  const match = trimmed.match(/([\s\S]+?)\r?\n\s*\r?\n(\{[\s\S]*\})\s*$/);
  if (match) {
    try {
      JSON.parse(match[2]);
      return {
        body: match[1].trim(),
        graphqlVariables: match[2].trim(),
      };
    } catch {
      return { body: trimmed };
    }
  }
  return { body: trimmed };
}

export function parseHttpDocument(
  content: string,
  filePath?: string
): HttpDocument {
  const lines = content.split(/\r?\n/);
  const variables: Record<string, string> = {};
  const requests: HttpRequestBlock[] = [];

  // Segment lines by `###` delimiters
  interface Segment {
    headerTitle?: string;
    startLine: number;
    endLine: number;
    lines: string[];
  }

  const segments: Segment[] = [];
  let currentStart = 0;
  let currentTitle: string | undefined;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^###(?:\s|$)/.test(line)) {
      if (currentLines.length > 0 || currentTitle !== undefined) {
        segments.push({
          headerTitle: currentTitle,
          startLine: currentStart,
          endLine: i - 1,
          lines: currentLines,
        });
      }
      currentStart = i;
      const titleText = line.replace(/^###\s*/, '').trim();
      currentTitle = titleText.length > 0 ? titleText : undefined;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 || currentTitle !== undefined) {
    segments.push({
      headerTitle: currentTitle,
      startLine: currentStart,
      endLine: lines.length - 1,
      lines: currentLines,
    });
  }

  for (const seg of segments) {
    let explicitName: string | undefined;
    const assertions: AssertionRule[] = [];
    let requestLineIdx = -1;
    let method: HttpMethod | undefined;
    let url = '';
    let httpVersion: string | undefined;

    for (let i = 0; i < seg.lines.length; i++) {
      const rawLine = seg.lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('###')) {
        continue;
      }

      const nameMatch = trimmed.match(NAME_DIRECTIVE_REGEX);
      if (nameMatch) {
        explicitName = nameMatch[1];
        continue;
      }

      const assertMatch = trimmed.match(ASSERT_DIRECTIVE_REGEX);
      if (assertMatch) {
        const parsed = parseAssertionDirective(assertMatch[1]);
        if (parsed) assertions.push(parsed);
        continue;
      }

      const varMatch = trimmed.match(VAR_DECL_REGEX);
      if (varMatch && requestLineIdx === -1) {
        variables[varMatch[1]] = varMatch[2].trim();
        continue;
      }

      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }

      const reqMatch = trimmed.match(REQUEST_LINE_REGEX);
      if (reqMatch) {
        const parsedMethod = reqMatch[1].toUpperCase() as HttpMethod;
        if (HTTP_METHODS.has(parsedMethod)) {
          method = parsedMethod;
          url = reqMatch[2];
          httpVersion = reqMatch[3];
          requestLineIdx = i;
          break;
        }
      }

      // Implicit GET when a standalone URL line is used (REST Client compat)
      if (/^(https?:\/\/|\{\{)/i.test(trimmed)) {
        method = 'GET';
        url = trimmed;
        requestLineIdx = i;
        break;
      }
    }

    if (requestLineIdx === -1 || !method) {
      continue;
    }

    // Parse query continuation lines (indented `?` or `&`), headers, and body
    const headers: HttpHeader[] = [];
    let bodyStartIdx = -1;
    let idx = requestLineIdx + 1;

    while (idx < seg.lines.length) {
      const line = seg.lines[idx];
      const trimmed = line.trim();

      if (trimmed === '') {
        bodyStartIdx = idx + 1;
        break;
      }

      // Multi-line query string continuation
      if (headers.length === 0 && /^[?&]/.test(trimmed)) {
        url += trimmed;
        idx++;
        continue;
      }

      const assertMatch = trimmed.match(ASSERT_DIRECTIVE_REGEX);
      if (assertMatch) {
        const parsed = parseAssertionDirective(assertMatch[1]);
        if (parsed) assertions.push(parsed);
        idx++;
        continue;
      }

      const disabledHeaderMatch = trimmed.match(DISABLED_HEADER_REGEX);
      if (disabledHeaderMatch) {
        headers.push({
          key: disabledHeaderMatch[1].trim(),
          value: disabledHeaderMatch[2].trim(),
          enabled: false,
        });
        idx++;
        continue;
      }

      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        idx++;
        continue;
      }

      const headerMatch = line.match(HEADER_LINE_REGEX);
      if (headerMatch) {
        headers.push({
          key: headerMatch[1].trim(),
          value: headerMatch[2].trim(),
          enabled: true,
        });
        idx++;
        continue;
      }

      // Non-header line starts body directly
      bodyStartIdx = idx;
      break;
    }

    let rawBody: string | undefined;
    let graphqlVariables: string | undefined;

    if (bodyStartIdx !== -1 && bodyStartIdx < seg.lines.length) {
      const bodyLines = seg.lines.slice(bodyStartIdx);
      // Trim trailing blank lines
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
        bodyLines.pop();
      }
      // Also allow trailing `@assert` lines after body
      while (bodyLines.length > 0) {
        const last = bodyLines[bodyLines.length - 1].trim();
        const m = last.match(ASSERT_DIRECTIVE_REGEX);
        if (m) {
          const parsed = parseAssertionDirective(m[1]);
          if (parsed) assertions.push(parsed);
          bodyLines.pop();
        } else {
          break;
        }
      }
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
        bodyLines.pop();
      }

      if (bodyLines.length > 0) {
        const joined = bodyLines.join('\n');
        const split = splitGraphQLBody(joined, headers);
        rawBody = split.body;
        graphqlVariables = split.graphqlVariables;
      }
    }

    // Compute accurate non-empty end line
    let endLine = seg.endLine;
    while (endLine > seg.startLine && lines[endLine].trim() === '') {
      endLine--;
    }

    // Determine display name and id
    const displayName =
      seg.headerTitle || explicitName || `${method} ${url}`;
    const id = explicitName
      ? explicitName
      : stableId(seg.headerTitle || '', method, url, requests.length);

    requests.push({
      id,
      name: displayName,
      method,
      url,
      httpVersion,
      headers,
      body: rawBody,
      graphqlVariables,
      assertions,
      lineStart: seg.startLine,
      lineEnd: endLine,
      sourceFile: filePath,
    });
  }

  return {
    filePath,
    variables,
    requests,
  };
}

export function serializeAssertionRule(rule: AssertionRule): string {
  if (rule.operator === 'exists') {
    return `# @assert ${rule.target} exists`;
  }
  const expectedStr =
    typeof rule.expected === 'string' && /\s/.test(rule.expected)
      ? `"${rule.expected}"`
      : String(rule.expected ?? '');
  return `# @assert ${rule.target} ${rule.operator} ${expectedStr}`;
}

export function serializeRequestBlock(
  req: HttpRequestBlock,
  includeSeparator = true
): string {
  const out: string[] = [];

  if (includeSeparator) {
    out.push(req.name ? `### ${req.name}` : '###');
  }
  if (req.id && /^[a-zA-Z0-9_.-]+$/.test(req.id) && req.id !== req.name) {
    out.push(`# @name ${req.id}`);
  }
  for (const assertion of req.assertions) {
    out.push(serializeAssertionRule(assertion));
  }

  const versionPart = req.httpVersion ? ` ${req.httpVersion}` : '';
  out.push(`${req.method} ${req.url}${versionPart}`);

  for (const h of req.headers) {
    if (!h.key.trim()) continue;
    if (h.enabled) {
      out.push(`${h.key}: ${h.value}`);
    } else {
      out.push(`# ${h.key}: ${h.value}`);
    }
  }

  if (req.body !== undefined && req.body.length > 0) {
    out.push('');
    out.push(req.body);
    if (req.graphqlVariables && req.graphqlVariables.trim().length > 0) {
      out.push('');
      out.push(req.graphqlVariables.trim());
    }
  }

  return out.join('\n');
}

export function serializeHttpDocument(doc: HttpDocument): string {
  const sections: string[] = [];
  const varEntries = Object.entries(doc.variables);
  if (varEntries.length > 0) {
    sections.push(varEntries.map(([k, v]) => `@${k} = ${v}`).join('\n'));
  }

  for (const req of doc.requests) {
    sections.push(serializeRequestBlock(req, true));
  }

  return sections.join('\n\n') + '\n';
}

/**
 * Losslessly updates a single request block in an existing `.http` document
 * while preserving surrounding `@var` declarations, comments, and other requests.
 */
export function updateRequestInDocument(
  originalContent: string,
  updatedRequest: HttpRequestBlock
): string {
  const lines = originalContent.split(/\r?\n/);
  const parsed = parseHttpDocument(originalContent, updatedRequest.sourceFile);
  const existing =
    parsed.requests.find((r) => r.id === updatedRequest.id) ||
    parsed.requests.find((r) => r.lineStart === updatedRequest.lineStart);

  const serialized = serializeRequestBlock(updatedRequest, true);

  if (!existing) {
    const trimmed = originalContent.trimEnd();
    return trimmed.length > 0
      ? `${trimmed}\n\n${serialized}\n`
      : `${serialized}\n`;
  }

  const before = lines.slice(0, existing.lineStart);
  const after = lines.slice(existing.lineEnd + 1);
  const combined = [...before, ...serialized.split('\n'), ...after];
  return combined.join('\n');
}
