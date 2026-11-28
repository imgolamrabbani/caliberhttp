import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCurl, toCurl } from './core/curlCodec';
import { importOpenApiToHttp } from './core/openapiImporter';
import { executeHttpRequest } from './core/httpExecutor';
import {
  parseHttpDocument,
  serializeRequestBlock,
  updateRequestInDocument,
} from './core/httpParser';
import { HistoryStore } from './core/historyStore';
import {
  getEnvironmentNames,
  loadDotEnv,
  loadEnvConfig,
  resolveEnvironmentVariables,
  type InterpolationContext,
} from './core/interpolator';
import type {
  ChainRunReport,
  DriftFinding,
  ExecutionResult,
  HttpRequestBlock,
} from './core/types';
import {
  FeatureGate,
  LicenseManager,
  PRO_FEATURE_LABELS,
  type ProFeatureId,
} from './licensing';
import {
  exportChainReportJUnit,
  exportChainReportJson,
  exportChainReportMarkdown,
  runRequestChain,
} from './pro/chainRunner';
import { importHarToHttp } from './pro/harImporter';
import {
  LocalMockServer,
  routesFromHttpContent,
  routesFromOpenApiJson,
} from './pro/mockServer';
import { diffSnapshot, loadSnapshot, saveSnapshot } from './pro/schemaDrift';
import { SecretVault } from './pro/secretVault';
import { HttpCodeLensProvider } from './ui/codeLensProvider';
import { CollectionTreeProvider } from './ui/collectionTree';
import {
  StudioPanel,
  createStarterFiles,
  type StudioPanelHandlers,
  type StudioStateSnapshot,
  type WebviewToExtensionMessage,
} from './ui/studioPanel';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('caliberhttp');
  const organizationId = config.get<string>('polarOrganizationId') || '';
  const checkoutUrl =
    config.get<string>('polarCheckoutUrl') ||
    'https://caliberhttp.github.io/caliberhttp/#pricing';

  const licenseManager = new LicenseManager(
    context.secrets,
    context.globalState,
    {
      organizationId,
      apiBaseUrl: 'https://api.polar.sh',
    }
  );
  const featureGate = new FeatureGate(licenseManager, checkoutUrl);

  const getWorkspaceRoot = (): string | undefined =>
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const historyPath = getWorkspaceRoot()
    ? path.join(getWorkspaceRoot()!, '.caliber', 'history.json')
    : undefined;
  const historyStore = new HistoryStore({ filePath: historyPath, maxEntries: 100 });
  void historyStore.load();

  const mockServer = new LocalMockServer();
  let secretVault: SecretVault | undefined = getWorkspaceRoot()
    ? new SecretVault(getWorkspaceRoot()!)
    : undefined;

  let activeFile: string | undefined;
  let activeRequest: HttpRequestBlock | undefined;
  let fileRequests: HttpRequestBlock[] = [];
  let fileVariables: Record<string, string> = {};
  let activeEnvironment = '';
  let lastResult: ExecutionResult | undefined;
  let lastChainReport: ChainRunReport | undefined;
  let lastDriftFindings: DriftFinding[] | undefined;

  // Status bar items
  const licenseStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  licenseStatusBar.command = 'caliberhttp.licenseStatus';
  context.subscriptions.push(licenseStatusBar);

  const mockStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  mockStatusBar.command = 'caliberhttp.stopMockServer';
  context.subscriptions.push(mockStatusBar);

  const updateStatusBars = () => {
    const state = licenseManager.getState();
    if (state.tier === 'pro') {
      licenseStatusBar.text = state.offlineGraceActive
        ? '$(shield) CaliberHTTP Pro (Offline Grace)'
        : '$(shield) CaliberHTTP Pro';
      licenseStatusBar.tooltip = `Licensed (${state.keyMask || 'Pro'}). Click for license details.`;
    } else {
      licenseStatusBar.text = '$(globe) CaliberHTTP Free';
      licenseStatusBar.tooltip =
        'CaliberHTTP Free (100% Local). Click to view license status or activate Pro.';
    }
    licenseStatusBar.show();

    if (mockServer.isRunning()) {
      mockStatusBar.text = `$(radio-tower) Mock: ${mockServer.getPort()}`;
      mockStatusBar.tooltip = `CaliberHTTP Mock Server running at ${mockServer.getAddress()}. Click to stop.`;
      mockStatusBar.show();
    } else {
      mockStatusBar.hide();
    }
  };

  updateStatusBars();
  // Silent non-blocking refresh if >= 72h elapsed
  void licenseManager.refreshIfNeeded().then(() => {
    updateStatusBars();
    void StudioPanel.getCurrent()?.pushState();
  });

  const collectionTree = new CollectionTreeProvider();
  const treeView = vscode.window.createTreeView('caliberhttp.collections', {
    treeDataProvider: collectionTree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const codeLensProvider = new HttpCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: 'http', scheme: 'file' },
        { pattern: '**/*.{http,rest}', scheme: 'file' },
      ],
      codeLensProvider
    )
  );

  // Two-way sync: watch .http/.rest edits
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.fileName.endsWith('.http') || doc.fileName.endsWith('.rest')) {
        collectionTree.refresh();
        codeLensProvider.refresh();
        if (activeFile === doc.fileName) {
          await loadFileIntoState(doc.fileName, activeRequest?.id);
          await StudioPanel.getCurrent()?.pushState();
        }
      }
      if (
        doc.fileName.endsWith('caliber.env.json') ||
        doc.fileName.endsWith('.env')
      ) {
        await StudioPanel.getCurrent()?.pushState();
      }
    })
  );

  const loadFileIntoState = async (
    filePath: string,
    preferredRequestId?: string
  ) => {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseHttpDocument(content, filePath);
    activeFile = filePath;
    fileRequests = parsed.requests;
    fileVariables = parsed.variables;
    if (preferredRequestId) {
      activeRequest =
        parsed.requests.find((r) => r.id === preferredRequestId) ??
        parsed.requests[0];
    } else {
      activeRequest = parsed.requests[0];
    }
  };

  const buildInterpolationContext = async (): Promise<InterpolationContext> => {
    const root = getWorkspaceRoot();
    const envConfig = root ? await loadEnvConfig(root) : {};
    const dotenvVariables = root ? await loadDotEnv(root) : {};
    const envVariables = resolveEnvironmentVariables(
      envConfig,
      activeEnvironment || undefined
    );
    return {
      fileVariables,
      envVariables,
      dotenvVariables,
      vaultSecrets: secretVault?.getAllSecrets(),
    };
  };

  const showProUpgradePrompt = (feature: ProFeatureId, url: string) => {
    const info = PRO_FEATURE_LABELS[feature];
    void vscode.window
      .showInformationMessage(
        `${info.title} is a CaliberHTTP Pro feature. ${info.summary}`,
        'Upgrade to Pro',
        'Activate License Key'
      )
      .then((choice) => {
        if (choice === 'Upgrade to Pro') {
          void vscode.env.openExternal(vscode.Uri.parse(url));
        } else if (choice === 'Activate License Key') {
          void vscode.commands.executeCommand('caliberhttp.activateLicense');
        }
      });
  };

  const getStudioState = async (): Promise<StudioStateSnapshot> => {
    const root = getWorkspaceRoot();
    const envConfig = root ? await loadEnvConfig(root) : {};
    const environments = getEnvironmentNames(envConfig);
    const hasSnapshot =
      root && activeRequest
        ? (await loadSnapshot(root, activeRequest.id)) !== null
        : false;
    const vaultExists = secretVault ? await secretVault.exists() : false;

    return {
      activeFile,
      activeRequest,
      fileRequests,
      environments,
      activeEnvironment,
      lastResult,
      history: historyStore.getAll(),
      chainReport: lastChainReport,
      driftFindings: lastDriftFindings,
      hasSnapshot,
      mockServer: {
        running: mockServer.isRunning(),
        url: mockServer.getAddress(),
        routeCount: mockServer.getRoutes().length,
        logs: mockServer.getLogs(),
      },
      vault: {
        exists: vaultExists,
        unlocked: secretVault?.isUnlocked() ?? false,
        keys: secretVault?.isUnlocked() ? secretVault.listKeys() : [],
      },
      license: licenseManager.getState(),
      checkoutUrl: featureGate.getCheckoutUrl(),
    };
  };

  const sendSingleRequest = async (req: HttpRequestBlock) => {
    const panel = StudioPanel.getCurrent();
    panel?.postMessage({
      type: 'loading',
      loading: true,
      label: `Sending ${req.method} ${req.url}...`,
    });

    try {
      const cfg = vscode.workspace.getConfiguration('caliberhttp');
      const timeoutMs = cfg.get<number>('defaultTimeoutMs') ?? 30000;
      const followRedirects = cfg.get<boolean>('followRedirects') ?? true;
      const interpolation = await buildInterpolationContext();

      const result = await executeHttpRequest(req, {
        timeoutMs,
        followRedirects,
        interpolation,
      });

      activeRequest = req;
      lastResult = result;
      await historyStore.record(req, result);
      await panel?.pushState();
    } finally {
      panel?.postMessage({ type: 'loading', loading: false });
    }
  };

  const handleWebviewMessage = async (
    msg: WebviewToExtensionMessage
  ): Promise<void> => {
    const panel = StudioPanel.getCurrent();

    switch (msg.type) {
      case 'sendRequest':
        await sendSingleRequest(msg.request);
        break;

      case 'saveRequest': {
        activeRequest = msg.request;
        if (activeFile) {
          const currentText = await fs.readFile(activeFile, 'utf8');
          const updatedText = updateRequestInDocument(currentText, msg.request);
          await fs.writeFile(activeFile, updatedText, 'utf8');
          await loadFileIntoState(activeFile, msg.request.id);
          collectionTree.refresh();
          codeLensProvider.refresh();
          panel?.postMessage({
            type: 'toast',
            level: 'info',
            message: `Saved changes to ${path.basename(activeFile)}`,
          });
          await panel?.pushState();
        } else {
          const root = getWorkspaceRoot();
          if (!root) {
            throw new Error('Open a workspace folder first to save .http files.');
          }
          const targetPath = path.join(root, 'api.http');
          const content = serializeRequestBlock(msg.request, true) + '\n';
          await fs.writeFile(targetPath, content, 'utf8');
          await loadFileIntoState(targetPath, msg.request.id);
          collectionTree.refresh();
          await panel?.pushState();
        }
        break;
      }

      case 'selectRequest': {
        const found = fileRequests.find((r) => r.id === msg.requestId);
        if (found) {
          activeRequest = found;
          lastDriftFindings = undefined;
          await panel?.pushState();
        }
        break;
      }

      case 'selectEnvironment':
        activeEnvironment = msg.envName;
        await panel?.pushState();
        break;

      case 'createStarterCollection':
        await vscode.commands.executeCommand(
          'caliberhttp.createStarterCollection'
        );
        break;

      case 'importCurl':
        await vscode.commands.executeCommand(
          'caliberhttp.importCurl',
          msg.curlText
        );
        break;

      case 'exportCurl': {
        const curlStr = toCurl(msg.request);
        await vscode.env.clipboard.writeText(curlStr);
        panel?.postMessage({
          type: 'toast',
          level: 'info',
          message: 'Copied request as cURL to clipboard.',
        });
        break;
      }

      case 'importHar':
        await vscode.commands.executeCommand('caliberhttp.importHar');
        break;

      case 'runChain':
        await vscode.commands.executeCommand(
          'caliberhttp.runChain',
          activeFile ? vscode.Uri.file(activeFile) : undefined
        );
        break;

      case 'exportChainReport': {
        if (!lastChainReport) {
          throw new Error('Run a chain first before exporting a report.');
        }
        const ext =
          msg.format === 'junit'
            ? 'xml'
            : msg.format === 'markdown'
              ? 'md'
              : 'json';
        const content =
          msg.format === 'junit'
            ? exportChainReportJUnit(lastChainReport)
            : msg.format === 'markdown'
              ? exportChainReportMarkdown(lastChainReport)
              : exportChainReportJson(lastChainReport);
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: getWorkspaceRoot()
            ? vscode.Uri.file(
                path.join(getWorkspaceRoot()!, `caliber-chain-report.${ext}`)
              )
            : undefined,
        });
        if (saveUri) {
          await fs.writeFile(saveUri.fsPath, content, 'utf8');
          panel?.postMessage({
            type: 'toast',
            level: 'info',
            message: `Exported report to ${path.basename(saveUri.fsPath)}`,
          });
        }
        break;
      }

      case 'captureSnapshot':
        await vscode.commands.executeCommand('caliberhttp.captureSnapshot');
        break;

      case 'diffDrift':
        await vscode.commands.executeCommand('caliberhttp.diffSchemaDrift');
        break;

      case 'toggleMockServer':
        if (mockServer.isRunning()) {
          await vscode.commands.executeCommand('caliberhttp.stopMockServer');
        } else {
          await vscode.commands.executeCommand(
            'caliberhttp.startMockServer',
            msg.port
          );
        }
        break;

      case 'unlockVault': {
        if (!featureGate.requirePro('secret_vault', showProUpgradePrompt)) {
          return;
        }
        const root = getWorkspaceRoot();
        if (!root) throw new Error('Open a workspace folder to use Secret Vault.');
        if (!secretVault) secretVault = new SecretVault(root);
        await secretVault.initOrUnlock(msg.passphrase);
        panel?.postMessage({
          type: 'toast',
          level: 'info',
          message: 'Local Secret Vault unlocked (AES-256-GCM).',
        });
        await panel?.pushState();
        break;
      }

      case 'lockVault':
        secretVault?.lock();
        await panel?.pushState();
        break;

      case 'setVaultSecret': {
        if (!featureGate.requirePro('secret_vault', showProUpgradePrompt)) {
          return;
        }
        if (!secretVault?.isUnlocked()) {
          throw new Error('Unlock the Secret Vault first.');
        }
        await secretVault.setSecret(msg.key, msg.value);
        panel?.postMessage({
          type: 'toast',
          level: 'info',
          message: `Saved encrypted secret "${msg.key}".`,
        });
        await panel?.pushState();
        break;
      }

      case 'deleteVaultSecret': {
        if (!featureGate.requirePro('secret_vault', showProUpgradePrompt)) {
          return;
        }
        if (!secretVault?.isUnlocked()) {
          throw new Error('Unlock the Secret Vault first.');
        }
        await secretVault.deleteSecret(msg.key);
        await panel?.pushState();
        break;
      }

      case 'activateLicense':
        await vscode.commands.executeCommand(
          'caliberhttp.activateLicense',
          msg.key
        );
        break;

      case 'deactivateLicense':
        await vscode.commands.executeCommand('caliberhttp.deactivateLicense');
        break;

      case 'openCheckout':
        void vscode.env.openExternal(
          vscode.Uri.parse(featureGate.getCheckoutUrl())
        );
        break;
    }
  };

  const studioHandlers: StudioPanelHandlers = {
    getState: getStudioState,
    onMessage: handleWebviewMessage,
  };

  const openStudio = async (uri?: vscode.Uri, req?: HttpRequestBlock) => {
    if (uri) {
      await loadFileIntoState(uri.fsPath, req?.id);
    } else if (
      !activeFile &&
      vscode.window.activeTextEditor?.document.fileName.match(/\.(http|rest)$/)
    ) {
      await loadFileIntoState(vscode.window.activeTextEditor.document.fileName);
    }
    if (req) {
      activeRequest = req;
    }
    const panel = StudioPanel.createOrShow(context.extensionUri, studioHandlers);
    await panel.pushState();
  };

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'caliberhttp.openStudio',
      async (uri?: vscode.Uri, req?: HttpRequestBlock) => {
        await openStudio(uri, req);
      }
    ),

    vscode.commands.registerCommand(
      'caliberhttp.sendRequest',
      async (uri?: vscode.Uri, req?: HttpRequestBlock) => {
        if (uri) {
          await loadFileIntoState(uri.fsPath, req?.id);
        }
        const target = req ?? activeRequest;
        if (!target) {
          void vscode.window.showWarningMessage(
            'Select or open a request in a .http file first.'
          );
          return;
        }
        const panel = StudioPanel.createOrShow(
          context.extensionUri,
          studioHandlers
        );
        await panel.pushState();
        await sendSingleRequest(target);
      }
    ),

    vscode.commands.registerCommand(
      'caliberhttp.createStarterCollection',
      async () => {
        const root = getWorkspaceRoot();
        if (!root) {
          void vscode.window.showErrorMessage(
            'Open a folder in VS Code first to create a starter api.http collection.'
          );
          return;
        }
        const filePath = await createStarterFiles(root);
        collectionTree.refresh();
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await openStudio(vscode.Uri.file(filePath));
        void vscode.window.showInformationMessage(
          'Created starter api.http & caliber.env.json!'
        );
      }
    ),

    vscode.commands.registerCommand('caliberhttp.refreshCollections', () => {
      collectionTree.refresh();
      codeLensProvider.refresh();
    }),

    vscode.commands.registerCommand(
      'caliberhttp.importCurl',
      async (providedCurl?: string) => {
        const raw =
          providedCurl ??
          (await vscode.window.showInputBox({
            prompt: 'Paste a cURL command to import into CaliberHTTP',
            placeHolder: 'curl -X POST https://api.example.com/items -H "Content-Type: application/json" -d \'{"name":"test"}\'',
            ignoreFocusOut: true,
          }));
        if (!raw) return;

        try {
          const parsedReq = parseCurl(raw);
          activeRequest = parsedReq;
          const root = getWorkspaceRoot();
          if (root) {
            const targetFile = activeFile || path.join(root, 'imported.http');
            let existing = '';
            try {
              existing = await fs.readFile(targetFile, 'utf8');
            } catch {
              existing = '';
            }
            const block = serializeRequestBlock(parsedReq, true);
            const next = existing.trimEnd()
              ? `${existing.trimEnd()}\n\n${block}\n`
              : `${block}\n`;
            await fs.writeFile(targetFile, next, 'utf8');
            await loadFileIntoState(targetFile, parsedReq.id);
            collectionTree.refresh();
          }
          const panel = StudioPanel.createOrShow(
            context.extensionUri,
            studioHandlers
          );
          await panel.pushState();
          void vscode.window.showInformationMessage(
            `Imported cURL request: ${parsedReq.method} ${parsedReq.url}`
          );
        } catch (err) {
          void vscode.window.showErrorMessage(
            `Failed to parse cURL: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand('caliberhttp.importOpenApi', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'OpenAPI 3.x JSON': ['json'] },
        openLabel: 'Import OpenAPI 3.x JSON',
      });
      const specUri = picked?.[0];
      if (!specUri) return;

      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage(
          'Open a workspace folder before importing an OpenAPI specification.'
        );
        return;
      }

      try {
        const rawJson = await fs.readFile(specUri.fsPath, 'utf8');
        const result = importOpenApiToHttp(rawJson);
        const outName = `${path.basename(specUri.fsPath, path.extname(specUri.fsPath))}.http`;
        const outPath = path.join(root, outName);
        await fs.writeFile(outPath, result.httpContent, 'utf8');
        collectionTree.refresh();
        const doc = await vscode.workspace.openTextDocument(outPath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await openStudio(vscode.Uri.file(outPath));
        void vscode.window.showInformationMessage(
          `Imported ${result.operationCount} OpenAPI operation(s) from "${result.title}" into ${outName}.`
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Failed to import OpenAPI JSON: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }),

    vscode.commands.registerCommand('caliberhttp.exportCurl', async () => {
      if (!activeRequest) {
        void vscode.window.showWarningMessage('No active request to export.');
        return;
      }
      await vscode.env.clipboard.writeText(toCurl(activeRequest));
      void vscode.window.showInformationMessage(
        'Copied active request as cURL to clipboard.'
      );
    }),

    vscode.commands.registerCommand(
      'caliberhttp.runChain',
      async (uri?: vscode.Uri) => {
        if (!featureGate.requirePro('chain_runner', showProUpgradePrompt)) {
          return;
        }
        const targetPath =
          uri?.fsPath ??
          activeFile ??
          vscode.window.activeTextEditor?.document.fileName;
        if (!targetPath) {
          void vscode.window.showWarningMessage(
            'Open a .http collection file to run a multi-step chain.'
          );
          return;
        }
        await loadFileIntoState(targetPath);
        if (fileRequests.length === 0) {
          void vscode.window.showWarningMessage(
            'No HTTP requests found in this file.'
          );
          return;
        }
        const panel = StudioPanel.createOrShow(
          context.extensionUri,
          studioHandlers
        );
        panel.postMessage({
          type: 'loading',
          loading: true,
          label: `Running ${fileRequests.length}-step chain...`,
        });
        try {
          const interpolation = await buildInterpolationContext();
          lastChainReport = await runRequestChain(fileRequests, {
            collectionName: path.basename(targetPath),
            interpolation,
          });
          await panel.pushState();
          panel.postMessage({
            type: 'toast',
            level: lastChainReport.passed ? 'info' : 'warning',
            message: `Chain finished: ${lastChainReport.passedSteps}/${lastChainReport.totalSteps} steps passed (${lastChainReport.totalDurationMs}ms)`,
          });
        } finally {
          panel.postMessage({ type: 'loading', loading: false });
        }
      }
    ),

    vscode.commands.registerCommand('caliberhttp.captureSnapshot', async () => {
      if (!featureGate.requirePro('schema_drift', showProUpgradePrompt)) {
        return;
      }
      const root = getWorkspaceRoot();
      if (!root || !activeRequest || !lastResult) {
        void vscode.window.showWarningMessage(
          'Send a request first in a workspace before capturing a schema baseline.'
        );
        return;
      }
      const { filePath } = await saveSnapshot(root, activeRequest.id, lastResult);
      lastDriftFindings = [];
      await StudioPanel.getCurrent()?.pushState();
      void vscode.window.showInformationMessage(
        `Saved schema baseline snapshot to ${path.relative(root, filePath)}`
      );
    }),

    vscode.commands.registerCommand('caliberhttp.diffSchemaDrift', async () => {
      if (!featureGate.requirePro('schema_drift', showProUpgradePrompt)) {
        return;
      }
      const root = getWorkspaceRoot();
      if (!root || !activeRequest || !lastResult) {
        void vscode.window.showWarningMessage(
          'Send a request first to diff against its saved baseline.'
        );
        return;
      }
      const baseline = await loadSnapshot(root, activeRequest.id);
      if (!baseline) {
        void vscode.window.showWarningMessage(
          'No baseline snapshot found for this request. Capture a snapshot first.'
        );
        return;
      }
      lastDriftFindings = diffSnapshot(baseline, lastResult);
      await StudioPanel.getCurrent()?.pushState();
      const breakingCount = lastDriftFindings.filter(
        (f) => f.severity === 'breaking'
      ).length;
      void vscode.window.showInformationMessage(
        lastDriftFindings.length === 0
          ? 'Zero schema drift detected!'
          : `Detected ${lastDriftFindings.length} schema change(s) (${breakingCount} breaking).`
      );
    }),

    vscode.commands.registerCommand(
      'caliberhttp.startMockServer',
      async (providedPort?: number) => {
        if (!featureGate.requirePro('mock_server', showProUpgradePrompt)) {
          return;
        }
        const cfg = vscode.workspace.getConfiguration('caliberhttp');
        const port = providedPort ?? cfg.get<number>('mockServerPort') ?? 4010;

        let sourcePath = activeFile;
        if (!sourcePath) {
          const picked = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
              'HTTP or OpenAPI': ['http', 'rest', 'json'],
            },
            openLabel: 'Load Mock Routes',
          });
          sourcePath = picked?.[0]?.fsPath;
        }
        if (!sourcePath) return;

        const content = await fs.readFile(sourcePath, 'utf8');
        const routes = sourcePath.endsWith('.json')
          ? routesFromOpenApiJson(content, path.basename(sourcePath))
          : routesFromHttpContent(content, path.basename(sourcePath));

        mockServer.setRoutes(routes);
        const started = await mockServer.start(port);
        updateStatusBars();
        await StudioPanel.getCurrent()?.pushState();
        void vscode.window.showInformationMessage(
          `CaliberHTTP Mock Server listening at ${started.url} (${routes.length} routes)`
        );
      }
    ),

    vscode.commands.registerCommand('caliberhttp.stopMockServer', async () => {
      await mockServer.stop();
      updateStatusBars();
      await StudioPanel.getCurrent()?.pushState();
      void vscode.window.showInformationMessage(
        'CaliberHTTP Local Mock Server stopped.'
      );
    }),

    vscode.commands.registerCommand('caliberhttp.importHar', async () => {
      if (!featureGate.requirePro('har_import', showProUpgradePrompt)) {
        return;
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'HAR Archive': ['har', 'json'] },
        openLabel: 'Import HAR File',
      });
      const harUri = picked?.[0];
      if (!harUri) return;

      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage(
          'Open a workspace folder before importing a HAR collection.'
        );
        return;
      }

      const rawHar = await fs.readFile(harUri.fsPath, 'utf8');
      const result = importHarToHttp(rawHar);
      const outName = `${path.basename(harUri.fsPath, path.extname(harUri.fsPath))}.http`;
      const outPath = path.join(root, outName);
      await fs.writeFile(outPath, result.httpContent, 'utf8');
      collectionTree.refresh();
      await openStudio(vscode.Uri.file(outPath));
      void vscode.window.showInformationMessage(
        `Imported ${result.importedCount} deduplicated requests from HAR into ${outName}.`
      );
    }),

    vscode.commands.registerCommand(
      'caliberhttp.manageSecretVault',
      async () => {
        if (!featureGate.requirePro('secret_vault', showProUpgradePrompt)) {
          return;
        }
        const root = getWorkspaceRoot();
        if (!root) {
          void vscode.window.showErrorMessage(
            'Open a workspace folder to manage .caliber/vault.enc.'
          );
          return;
        }
        if (!secretVault) secretVault = new SecretVault(root);
        if (!secretVault.isUnlocked()) {
          const passphrase = await vscode.window.showInputBox({
            prompt:
              'Enter passphrase to unlock (or initialize) .caliber/vault.enc',
            password: true,
            ignoreFocusOut: true,
          });
          if (!passphrase) return;
          await secretVault.initOrUnlock(passphrase);
        }
        const action = await vscode.window.showQuickPick(
          ['Add / Update Secret', 'List Secret Keys', 'Lock Vault'],
          { placeHolder: 'CaliberHTTP AES-256-GCM Secret Vault' }
        );
        if (action === 'Add / Update Secret') {
          const key = await vscode.window.showInputBox({
            prompt: 'Secret key name (referenced as {{vault.KEY}})',
          });
          if (!key) return;
          const val = await vscode.window.showInputBox({
            prompt: `Secret value for ${key}`,
            password: true,
          });
          if (val === undefined) return;
          await secretVault.setSecret(key, val);
          void vscode.window.showInformationMessage(
            `Encrypted and saved "${key}" in .caliber/vault.enc`
          );
        } else if (action === 'List Secret Keys') {
          const keys = secretVault.listKeys();
          void vscode.window.showInformationMessage(
            keys.length > 0
              ? `Vault keys: ${keys.join(', ')}`
              : 'Vault is unlocked and empty.'
          );
        } else if (action === 'Lock Vault') {
          secretVault.lock();
          void vscode.window.showInformationMessage('Secret Vault locked.');
        }
        await StudioPanel.getCurrent()?.pushState();
      }
    ),

    vscode.commands.registerCommand(
      'caliberhttp.activateLicense',
      async (providedKey?: string) => {
        const key =
          providedKey ??
          (await vscode.window.showInputBox({
            prompt: 'Enter your CaliberHTTP Pro license key (from Polar.sh)',
            placeHolder: 'CLBR-XXXX-XXXX-XXXX',
            password: true,
            ignoreFocusOut: true,
          }));
        if (!key) return;
        try {
          const state = await licenseManager.activate(key, os.hostname());
          updateStatusBars();
          await StudioPanel.getCurrent()?.pushState();
          void vscode.window.showInformationMessage(
            `CaliberHTTP Pro activated (${state.keyMask || 'Pro'})!`
          );
        } catch (err) {
          void vscode.window.showErrorMessage(
            `License activation failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'caliberhttp.deactivateLicense',
      async () => {
        await licenseManager.deactivate();
        updateStatusBars();
        await StudioPanel.getCurrent()?.pushState();
        void vscode.window.showInformationMessage(
          'CaliberHTTP Pro license deactivated on this machine.'
        );
      }
    ),

    vscode.commands.registerCommand('caliberhttp.licenseStatus', async () => {
      const state = licenseManager.getState();
      if (state.tier === 'pro') {
        const msg = state.offlineGraceActive
          ? `CaliberHTTP Pro (${state.keyMask}) — Offline Grace active until ${state.graceUntilIso}`
          : `CaliberHTTP Pro (${state.keyMask}) — Active & verified ${state.validatedAtIso}`;
        const choice = await vscode.window.showInformationMessage(
          msg,
          'Refresh Validation',
          'Deactivate License'
        );
        if (choice === 'Refresh Validation') {
          await licenseManager.refreshIfNeeded(true);
          updateStatusBars();
        } else if (choice === 'Deactivate License') {
          await vscode.commands.executeCommand('caliberhttp.deactivateLicense');
        }
      } else {
        const choice = await vscode.window.showInformationMessage(
          'CaliberHTTP Free — 100% local, unlimited collections & environments. Upgrade to Pro for Chaining, Schema Drift, Mock Server, HAR Import & Secret Vault.',
          'Activate License Key',
          'Get CaliberHTTP Pro'
        );
        if (choice === 'Activate License Key') {
          await vscode.commands.executeCommand('caliberhttp.activateLicense');
        } else if (choice === 'Get CaliberHTTP Pro') {
          void vscode.env.openExternal(
            vscode.Uri.parse(featureGate.getCheckoutUrl())
          );
        }
      }
    }),

    {
      dispose: () => {
        void mockServer.stop();
      },
    }
  );
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions
}
