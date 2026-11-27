import * as vscode from 'vscode';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ChainRunReport,
  DriftFinding,
  ExecutionResult,
  HistoryEntry,
  HttpRequestBlock,
  MockRequestLog,
} from '../core/types';
import type { LicenseState, ProFeatureId } from '../licensing';

export interface StudioStateSnapshot {
  activeFile?: string;
  activeRequest?: HttpRequestBlock;
  fileRequests: HttpRequestBlock[];
  environments: string[];
  activeEnvironment: string;
  lastResult?: ExecutionResult;
  history: HistoryEntry[];
  chainReport?: ChainRunReport;
  driftFindings?: DriftFinding[];
  hasSnapshot: boolean;
  mockServer: {
    running: boolean;
    url: string | null;
    routeCount: number;
    logs: MockRequestLog[];
  };
  vault: {
    exists: boolean;
    unlocked: boolean;
    keys: string[];
  };
  license: LicenseState;
  checkoutUrl: string;
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'sendRequest'; request: HttpRequestBlock }
  | { type: 'saveRequest'; request: HttpRequestBlock }
  | { type: 'selectRequest'; requestId: string }
  | { type: 'selectEnvironment'; envName: string }
  | { type: 'createStarterCollection' }
  | { type: 'importCurl'; curlText?: string }
  | { type: 'exportCurl'; request: HttpRequestBlock }
  | { type: 'importHar' }
  | { type: 'runChain' }
  | { type: 'exportChainReport'; format: 'json' | 'markdown' | 'junit' }
  | { type: 'captureSnapshot'; requestId: string }
  | { type: 'diffDrift'; requestId: string }
  | { type: 'toggleMockServer'; port?: number }
  | { type: 'unlockVault'; passphrase: string }
  | { type: 'lockVault' }
  | { type: 'setVaultSecret'; key: string; value: string }
  | { type: 'deleteVaultSecret'; key: string }
  | { type: 'activateLicense'; key?: string }
  | { type: 'deactivateLicense' }
  | { type: 'openCheckout'; feature?: ProFeatureId };

export type ExtensionToWebviewMessage =
  | { type: 'state'; payload: StudioStateSnapshot }
  | { type: 'loading'; loading: boolean; label?: string }
  | { type: 'toast'; level: 'info' | 'error' | 'warning'; message: string };

export interface StudioPanelHandlers {
  getState: () => Promise<StudioStateSnapshot>;
  onMessage: (msg: WebviewToExtensionMessage) => Promise<void>;
}

export class StudioPanel {
  private static current: StudioPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly handlers: StudioPanelHandlers;
  private disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    handlers: StudioPanelHandlers
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.handlers = handlers;

    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.disposed = true;
      if (StudioPanel.current === this) {
        StudioPanel.current = undefined;
      }
    });

    this.panel.webview.onDidReceiveMessage(
      async (msg: WebviewToExtensionMessage) => {
        try {
          if (msg.type === 'ready') {
            await this.pushState();
            return;
          }
          await this.handlers.onMessage(msg);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.postMessage({ type: 'toast', level: 'error', message });
        }
      }
    );
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    handlers: StudioPanelHandlers
  ): StudioPanel {
    const column =
      vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Beside
        : vscode.ViewColumn.One;

    if (StudioPanel.current && !StudioPanel.current.disposed) {
      StudioPanel.current.panel.reveal(column);
      return StudioPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'caliberhttp.studio',
      'CaliberHTTP Studio',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    StudioPanel.current = new StudioPanel(panel, extensionUri, handlers);
    return StudioPanel.current;
  }

  static getCurrent(): StudioPanel | undefined {
    return StudioPanel.current && !StudioPanel.current.disposed
      ? StudioPanel.current
      : undefined;
  }

  async pushState(): Promise<void> {
    if (this.disposed) return;
    const snapshot = await this.handlers.getState();
    this.postMessage({ type: 'state', payload: snapshot });
  }

  postMessage(msg: ExtensionToWebviewMessage): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage(msg);
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'dist',
        'webview',
        'assets',
        'index.js'
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'dist',
        'webview',
        'assets',
        'index.css'
      )
    );

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CaliberHTTP Studio</title>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

export async function createStarterFiles(workspaceRoot: string): Promise<string> {
  const apiHttpPath = path.join(workspaceRoot, 'api.http');
  const envJsonPath = path.join(workspaceRoot, 'caliber.env.json');

  const starterHttp = `@baseUrl = https://httpbin.org

### Health & Echo Check
# @name health
# @assert status == 200
# @assert latency < 5000
GET {{baseUrl}}/get?client=caliberhttp&reqId={{$uuid}}
Accept: application/json

### Create Resource (Chained Example)
# @name createItem
# @assert status == 200
# @assert body.$.json.source == "caliberhttp"
POST {{baseUrl}}/post
Content-Type: application/json
X-Correlation-Id: {{health.response.body.$.args.reqId}}

{
  "source": "caliberhttp",
  "timestamp": "{{$isoTimestamp}}",
  "randomScore": {{$randomInt 1 100}}
}
`;

  const starterEnv = {
    $shared: {
      appName: 'CaliberHTTP',
    },
    dev: {
      baseUrl: 'https://httpbin.org',
    },
    local: {
      baseUrl: 'http://127.0.0.1:4010',
    },
  };

  await fs.writeFile(apiHttpPath, starterHttp, 'utf8');
  try {
    await fs.access(envJsonPath);
  } catch {
    await fs.writeFile(
      envJsonPath,
      JSON.stringify(starterEnv, null, 2) + '\n',
      'utf8'
    );
  }
  return apiHttpPath;
}
