import type { ExecutionResult, HttpRequestBlock } from './types.js';
import {
  interpolateRequest,
  type InterpolationContext,
} from './interpolator.js';

export interface ExecuteOptions {
  timeoutMs?: number;
  followRedirects?: boolean;
  signal?: AbortSignal;
  interpolation?: InterpolationContext;
  fetchImpl?: typeof fetch;
}

export async function executeHttpRequest(
  rawRequest: HttpRequestBlock,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const req = options.interpolation
    ? interpolateRequest(rawRequest, options.interpolation)
    : rawRequest;

  const timeoutMs = options.timeoutMs ?? 30000;
  const followRedirects = options.followRedirects ?? true;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  const headersObj: Record<string, string> = {};
  let isGraphQL = false;

  for (const h of req.headers) {
    if (!h.enabled || !h.key.trim()) continue;
    const lower = h.key.toLowerCase();
    if (lower === 'x-request-type' && h.value.toLowerCase() === 'graphql') {
      isGraphQL = true;
      continue;
    }
    if (
      lower === 'content-type' &&
      h.value.toLowerCase().includes('application/graphql')
    ) {
      isGraphQL = true;
    }
    headersObj[h.key] = h.value;
  }

  let bodyToSend: string | undefined = req.body;
  if (
    (isGraphQL || req.graphqlVariables !== undefined) &&
    req.body !== undefined &&
    req.method !== 'GET' &&
    req.method !== 'HEAD'
  ) {
    let variables: unknown = undefined;
    if (req.graphqlVariables && req.graphqlVariables.trim().length > 0) {
      try {
        variables = JSON.parse(req.graphqlVariables);
      } catch {
        variables = undefined;
      }
    }
    bodyToSend = JSON.stringify(
      variables !== undefined
        ? { query: req.body, variables }
        : { query: req.body }
    );
    // Ensure Content-Type is application/json for GraphQL-over-HTTP envelope
    const existingCtKey = Object.keys(headersObj).find(
      (k) => k.toLowerCase() === 'content-type'
    );
    if (existingCtKey) {
      headersObj[existingCtKey] = 'application/json';
    } else {
      headersObj['Content-Type'] = 'application/json';
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    bodyToSend = undefined;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(options.signal?.reason ?? new Error('Request aborted'));
  };
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutHandle);
      return {
        requestId: req.id,
        requestName: req.name,
        method: req.method,
        url: req.url,
        status: 0,
        statusText: 'Aborted',
        durationMs: 0,
        sizeBytes: 0,
        headers: {},
        bodyText: '',
        timestampIso: new Date().toISOString(),
        error: 'Request aborted',
      };
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const start = performance.now();
  try {
    const response = await fetchFn(req.url, {
      method: req.method,
      headers: headersObj,
      body: bodyToSend,
      redirect: followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
    });

    const arrayBuf = await response.arrayBuffer();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const sizeBytes = arrayBuf.byteLength;
    const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuf);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let bodyJson: unknown = undefined;
    const ct = (responseHeaders['content-type'] || '').toLowerCase();
    if (
      ct.includes('json') ||
      bodyText.trimStart().startsWith('{') ||
      bodyText.trimStart().startsWith('[')
    ) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = undefined;
      }
    }

    return {
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: req.url,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      sizeBytes,
      headers: responseHeaders,
      bodyText,
      bodyJson,
      timestampIso: new Date().toISOString(),
    };
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const message =
      err instanceof Error ? err.message : String(err ?? 'Unknown error');
    return {
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: req.url,
      status: 0,
      statusText: 'Error',
      durationMs,
      sizeBytes: 0,
      headers: {},
      bodyText: '',
      timestampIso: new Date().toISOString(),
      error: message,
    };
  } finally {
    clearTimeout(timeoutHandle);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
