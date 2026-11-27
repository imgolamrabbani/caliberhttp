interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cachedApi: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (cachedApi) {
    return cachedApi;
  }
  if (typeof acquireVsCodeApi === 'function') {
    cachedApi = acquireVsCodeApi();
  } else {
    cachedApi = {
      postMessage: () => undefined,
      getState: () => undefined,
      setState: () => undefined,
    };
  }
  return cachedApi;
}

export function postToExtension(message: Record<string, unknown>): void {
  getVsCodeApi().postMessage(message);
}
