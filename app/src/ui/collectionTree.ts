import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseHttpDocument } from '../core/httpParser';
import type { HttpRequestBlock } from '../core/types';

export type CollectionTreeItem =
  | { kind: 'file'; uri: vscode.Uri; label: string; requests: HttpRequestBlock[] }
  | { kind: 'request'; uri: vscode.Uri; request: HttpRequestBlock };

export class CollectionTreeProvider
  implements vscode.TreeDataProvider<CollectionTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<CollectionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedFiles: Array<{
    kind: 'file';
    uri: vscode.Uri;
    label: string;
    requests: HttpRequestBlock[];
  }> = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CollectionTreeItem): vscode.TreeItem {
    if (element.kind === 'file') {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.resourceUri = element.uri;
      item.description = `${element.requests.length} req${element.requests.length === 1 ? '' : 's'}`;
      item.contextValue = 'file';
      item.iconPath = new vscode.ThemeIcon('file-code');
      return item;
    }

    const req = element.request;
    const item = new vscode.TreeItem(
      req.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = req.method;
    item.tooltip = `${req.method} ${req.url}`;
    item.contextValue = 'request';
    item.iconPath = new vscode.ThemeIcon(methodToCodicon(req.method));
    item.command = {
      command: 'caliberhttp.openStudio',
      title: 'Open in CaliberHTTP Studio',
      arguments: [element.uri, req],
    };
    return item;
  }

  async getChildren(
    element?: CollectionTreeItem
  ): Promise<CollectionTreeItem[]> {
    if (element) {
      if (element.kind === 'file') {
        return element.requests.map((request) => ({
          kind: 'request' as const,
          uri: element.uri,
          request,
        }));
      }
      return [];
    }

    const uris = await vscode.workspace.findFiles(
      '**/*.{http,rest}',
      '{**/node_modules/**,**/.git/**,**/dist/**}'
    );
    uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const items: Array<{
      kind: 'file';
      uri: vscode.Uri;
      label: string;
      requests: HttpRequestBlock[];
    }> = [];

    for (const uri of uris) {
      try {
        const text = await fs.readFile(uri.fsPath, 'utf8');
        const doc = parseHttpDocument(text, uri.fsPath);
        const label = workspaceRoot
          ? path.relative(workspaceRoot, uri.fsPath)
          : path.basename(uri.fsPath);
        items.push({
          kind: 'file',
          uri,
          label,
          requests: doc.requests,
        });
      } catch {
        // Skip unreadable files
      }
    }

    this.cachedFiles = items;
    return items;
  }

  getCachedFiles(): Array<{
    uri: vscode.Uri;
    label: string;
    requests: HttpRequestBlock[];
  }> {
    return this.cachedFiles;
  }
}

function methodToCodicon(method: string): string {
  switch (method) {
    case 'GET':
      return 'arrow-down';
    case 'POST':
      return 'arrow-up';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'trash';
    default:
      return 'globe';
  }
}
