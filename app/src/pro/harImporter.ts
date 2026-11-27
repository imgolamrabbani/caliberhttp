import { serializeHttpDocument } from '../core/httpParser.js';
import type {
  HttpDocument,
  HttpHeader,
  HttpMethod,
  HttpRequestBlock,
} from '../core/types.js';

interface HarHeader {
  name: string;
  value: string;
}

interface HarEntry {
  request?: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
    postData?: {
      mimeType?: string;
      text?: string;
    };
  };
}

interface HarFile {
  log?: {
    version?: string;
    entries?: HarEntry[];
  };
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

const STATIC_EXTENSIONS = /\.(css|js|mjs|map|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp4|webm)(\?.*)?$/i;

const NOISE_HEADER_PREFIXES = [':', 'sec-ch-', 'sec-fetch-'];
const NOISE_HEADER_EXACT = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'cookie',
  'origin',
  'referer',
  'pragma',
  'cache-control',
  'upgrade-insecure-requests',
  'priority',
]);

export interface HarImportOptions {
  skipStaticAssets?: boolean;
  deduplicate?: boolean;
  includeCookies?: boolean;
}

export interface HarImportResult {
  document: HttpDocument;
  httpContent: string;
  totalEntries: number;
  importedCount: number;
  skippedCount: number;
  baseUrl?: string;
}

export function importHarToHttp(
  harJsonText: string,
  options: HarImportOptions = {}
): HarImportResult {
  const skipStaticAssets = options.skipStaticAssets ?? true;
  const deduplicate = options.deduplicate ?? true;
  const includeCookies = options.includeCookies ?? false;

  const parsed = JSON.parse(harJsonText) as HarFile;
  const entries = parsed?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Invalid HAR 1.2 file: missing log.entries array.');
  }

  // Count origins to extract the most common {{baseUrl}}
  const originCounts = new Map<string, number>();
  const validEntries: Array<{
    method: HttpMethod;
    parsedUrl: URL;
    entry: HarEntry;
  }> = [];

  for (const entry of entries) {
    const req = entry.request;
    if (!req?.url || !req.method) continue;
    const method = req.method.toUpperCase() as HttpMethod;
    if (!VALID_METHODS.has(method)) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      continue;
    }
    if (skipStaticAssets && STATIC_EXTENSIONS.test(parsedUrl.pathname)) {
      continue;
    }

    originCounts.set(
      parsedUrl.origin,
      (originCounts.get(parsedUrl.origin) ?? 0) + 1
    );
    validEntries.push({ method, parsedUrl, entry });
  }

  let baseUrl: string | undefined;
  let maxCount = 0;
  for (const [origin, count] of originCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      baseUrl = origin;
    }
  }

  const seenKeys = new Set<string>();
  const requests: HttpRequestBlock[] = [];

  for (const { method, parsedUrl, entry } of validEntries) {
    const dedupKey = `${method} ${parsedUrl.origin}${parsedUrl.pathname}`;
    if (deduplicate && seenKeys.has(dedupKey)) {
      continue;
    }
    seenKeys.add(dedupKey);

    const urlStr =
      baseUrl && parsedUrl.origin === baseUrl
        ? `{{baseUrl}}${parsedUrl.pathname}${parsedUrl.search}`
        : parsedUrl.toString();

    const headers: HttpHeader[] = [];
    for (const h of entry.request?.headers ?? []) {
      const lower = h.name.toLowerCase();
      if (NOISE_HEADER_PREFIXES.some((p) => lower.startsWith(p))) continue;
      if (NOISE_HEADER_EXACT.has(lower)) {
        if (lower === 'cookie' && includeCookies) {
          headers.push({ key: h.name, value: h.value, enabled: true });
        }
        continue;
      }
      headers.push({ key: h.name, value: h.value, enabled: true });
    }

    let body = entry.request?.postData?.text;
    if (body) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        // Keep raw body
      }
    }

    const slug = `${method.toLowerCase()}_${parsedUrl.pathname
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'root'}_${requests.length + 1}`;

    requests.push({
      id: slug,
      name: `${method} ${parsedUrl.pathname || '/'}`,
      method,
      url: urlStr,
      headers,
      body,
      assertions: [],
      lineStart: 0,
      lineEnd: 0,
    });
  }

  const variables: Record<string, string> = {};
  if (baseUrl) {
    variables.baseUrl = baseUrl;
  }

  const document: HttpDocument = {
    variables,
    requests,
  };

  return {
    document,
    httpContent: serializeHttpDocument(document),
    totalEntries: entries.length,
    importedCount: requests.length,
    skippedCount: entries.length - requests.length,
    baseUrl,
  };
}
