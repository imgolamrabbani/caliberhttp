import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExecutionResult, HistoryEntry, HttpRequestBlock } from './types.js';

export class HistoryStore {
  private readonly maxEntries: number;
  private readonly filePath?: string;
  private entries: HistoryEntry[] = [];
  private loaded = false;

  constructor(options: { filePath?: string; maxEntries?: number } = {}) {
    this.filePath = options.filePath;
    this.maxEntries = options.maxEntries ?? 100;
  }

  async load(): Promise<HistoryEntry[]> {
    if (this.loaded) {
      return this.getAll();
    }
    this.loaded = true;
    if (!this.filePath) {
      return this.getAll();
    }
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.slice(0, this.maxEntries);
      }
    } catch {
      this.entries = [];
    }
    return this.getAll();
  }

  async record(
    req: HttpRequestBlock,
    result: ExecutionResult
  ): Promise<HistoryEntry> {
    if (!this.loaded) {
      await this.load();
    }
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: result.url || req.url,
      status: result.status,
      statusText: result.statusText,
      durationMs: result.durationMs,
      sizeBytes: result.sizeBytes,
      timestampIso: result.timestampIso,
      sourceFile: req.sourceFile,
      error: result.error,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    await this.persist();
    return entry;
  }

  getAll(): HistoryEntry[] {
    return [...this.entries];
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.loaded = true;
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.entries, null, 2),
      'utf8'
    );
  }
}
