import * as vscode from 'vscode';
import { parseHttpDocument } from '../core/httpParser';

export class HttpCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const parsed = parseHttpDocument(document.getText(), document.uri.fsPath);
    const lenses: vscode.CodeLens[] = [];

    parsed.requests.forEach((req, idx) => {
      const line = Math.max(0, Math.min(req.lineStart, document.lineCount - 1));
      const range = new vscode.Range(line, 0, line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: '▶ Send Request',
          tooltip: `Send ${req.method} ${req.url}`,
          command: 'caliberhttp.sendRequest',
          arguments: [document.uri, req],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '◫ Open in Studio',
          tooltip: 'Edit and inspect this request in CaliberHTTP Studio',
          command: 'caliberhttp.openStudio',
          arguments: [document.uri, req],
        })
      );

      if (idx === 0 && parsed.requests.length > 1) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `⛓ Run Chain (${parsed.requests.length} steps)`,
            tooltip:
              'Run all requests in this file sequentially with assertions (Pro)',
            command: 'caliberhttp.runChain',
            arguments: [document.uri],
          })
        );
      }
    });

    return lenses;
  }
}
