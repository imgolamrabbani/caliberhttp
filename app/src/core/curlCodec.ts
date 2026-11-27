import type { HttpHeader, HttpMethod, HttpRequestBlock } from './types.js';

const VALID_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

function tokenizeShell(input: string): string[] {
  // Collapse backslash-newline continuations
  const normalized = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

export function parseCurl(curlCommand: string): HttpRequestBlock {
  const tokens = tokenizeShell(curlCommand);
  if (tokens.length === 0) {
    throw new Error('Empty cURL command.');
  }

  let i = 0;
  if (tokens[0].toLowerCase() === 'curl') {
    i = 1;
  }

  let method: HttpMethod | undefined;
  let url = '';
  const headers: HttpHeader[] = [];
  const dataParts: string[] = [];

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === '-X' || tok === '--request') {
      const m = (tokens[++i] || 'GET').toUpperCase() as HttpMethod;
      if (VALID_METHODS.has(m)) {
        method = m;
      }
    } else if (tok === '-H' || tok === '--header') {
      const hdr = tokens[++i] || '';
      const colonIdx = hdr.indexOf(':');
      if (colonIdx > 0) {
        headers.push({
          key: hdr.slice(0, colonIdx).trim(),
          value: hdr.slice(colonIdx + 1).trim(),
          enabled: true,
        });
      }
    } else if (
      tok === '-d' ||
      tok === '--data' ||
      tok === '--data-raw' ||
      tok === '--data-binary' ||
      tok === '--data-urlencode'
    ) {
      const data = tokens[++i] ?? '';
      dataParts.push(data);
    } else if (tok === '-u' || tok === '--user') {
      const creds = tokens[++i] ?? '';
      const encoded = Buffer.from(creds, 'utf8').toString('base64');
      headers.push({
        key: 'Authorization',
        value: `Basic ${encoded}`,
        enabled: true,
      });
    } else if (tok === '-A' || tok === '--user-agent') {
      headers.push({
        key: 'User-Agent',
        value: tokens[++i] ?? '',
        enabled: true,
      });
    } else if (tok === '--url') {
      url = tokens[++i] ?? '';
    } else if (
      tok === '-I' ||
      tok === '--head'
    ) {
      method = 'HEAD';
    } else if (
      tok === '-L' ||
      tok === '--location' ||
      tok === '-s' ||
      tok === '--silent' ||
      tok === '-S' ||
      tok === '--show-error' ||
      tok === '-k' ||
      tok === '--insecure' ||
      tok === '-v' ||
      tok === '--verbose' ||
      tok === '--compressed'
    ) {
      // Boolean flags without values
    } else if (tok.startsWith('-')) {
      // Unknown flag with possible value — skip flag only if next looks like URL
      if (
        i + 1 < tokens.length &&
        !tokens[i + 1].startsWith('-') &&
        !/^https?:\/\//i.test(tokens[i + 1])
      ) {
        i++;
      }
    } else if (!url) {
      url = tok;
    }

    i++;
  }

  if (!url) {
    throw new Error('Could not find a URL in the cURL command.');
  }

  const body = dataParts.length > 0 ? dataParts.join('&') : undefined;
  const finalMethod: HttpMethod = method ?? (body !== undefined ? 'POST' : 'GET');

  let name = `${finalMethod} ${url}`;
  try {
    const parsedUrl = new URL(url);
    name = `${finalMethod} ${parsedUrl.pathname || '/'}`;
  } catch {
    // Keep default name if URL has template variables
  }

  return {
    id: `curl_${Date.now()}`,
    name,
    method: finalMethod,
    url,
    headers,
    body,
    assertions: [],
    lineStart: 0,
    lineEnd: 0,
  };
}

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(request: HttpRequestBlock): string {
  const parts: string[] = ['curl'];

  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  parts.push(shellEscapeSingle(request.url));

  for (const h of request.headers) {
    if (!h.enabled || !h.key.trim()) continue;
    parts.push(`-H ${shellEscapeSingle(`${h.key}: ${h.value}`)}`);
  }

  if (
    request.body !== undefined &&
    request.body.length > 0 &&
    request.method !== 'GET' &&
    request.method !== 'HEAD'
  ) {
    parts.push(`--data-raw ${shellEscapeSingle(request.body)}`);
  }

  return parts.join(' \\\n  ');
}
