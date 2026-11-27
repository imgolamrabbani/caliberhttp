import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

interface VaultEnvelopeV1 {
  version: 1;
  cipher: 'aes-256-gcm';
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

const DEFAULT_ITERATIONS = 210_000;
const KEY_LEN = 32; // 256 bits
const SALT_LEN = 16;
const IV_LEN = 12;

export class SecretVault {
  private readonly vaultPath: string;
  private readonly iterations: number;
  private passphrase: string | null = null;
  private secrets: Record<string, string> = {};

  constructor(workspaceRoot: string, options?: { iterations?: number }) {
    this.vaultPath = path.join(workspaceRoot, '.caliber', 'vault.enc');
    this.iterations = options?.iterations ?? DEFAULT_ITERATIONS;
  }

  getVaultPath(): string {
    return this.vaultPath;
  }

  isUnlocked(): boolean {
    return this.passphrase !== null;
  }

  lock(): void {
    this.passphrase = null;
    this.secrets = {};
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.vaultPath);
      return true;
    } catch {
      return false;
    }
  }

  async initOrUnlock(passphrase: string): Promise<string[]> {
    if (!passphrase || passphrase.length < 4) {
      throw new Error('Vault passphrase must be at least 4 characters.');
    }

    const fileExists = await this.exists();
    if (!fileExists) {
      this.passphrase = passphrase;
      this.secrets = {};
      await this.persist();
      return [];
    }

    const raw = await fs.readFile(this.vaultPath, 'utf8');
    const envelope = JSON.parse(raw) as VaultEnvelopeV1;
    if (
      envelope.version !== 1 ||
      envelope.cipher !== 'aes-256-gcm' ||
      envelope.kdf !== 'pbkdf2-sha256'
    ) {
      throw new Error('Unsupported vault format.');
    }

    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

    const derivedKey = crypto.pbkdf2Sync(
      passphrase,
      salt,
      envelope.iterations,
      KEY_LEN,
      'sha256'
    );

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
      const parsed = JSON.parse(plaintext) as Record<string, string>;
      this.passphrase = passphrase;
      this.secrets = parsed && typeof parsed === 'object' ? parsed : {};
      return Object.keys(this.secrets).sort();
    } catch {
      throw new Error('Invalid vault passphrase or corrupted vault file.');
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.ensureUnlocked();
    const cleanKey = key.trim();
    if (!cleanKey) {
      throw new Error('Secret key cannot be empty.');
    }
    this.secrets[cleanKey] = value;
    await this.persist();
  }

  getSecret(key: string): string | undefined {
    this.ensureUnlocked();
    return this.secrets[key];
  }

  async deleteSecret(key: string): Promise<boolean> {
    this.ensureUnlocked();
    if (!(key in this.secrets)) {
      return false;
    }
    delete this.secrets[key];
    await this.persist();
    return true;
  }

  listKeys(): string[] {
    this.ensureUnlocked();
    return Object.keys(this.secrets).sort();
  }

  getAllSecrets(): Record<string, string> {
    if (!this.isUnlocked()) {
      return {};
    }
    return { ...this.secrets };
  }

  private ensureUnlocked(): void {
    if (!this.passphrase) {
      throw new Error('Secret Vault is locked. Unlock it first.');
    }
  }

  private async persist(): Promise<void> {
    this.ensureUnlocked();
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const derivedKey = crypto.pbkdf2Sync(
      this.passphrase!,
      salt,
      this.iterations,
      KEY_LEN,
      'sha256'
    );

    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const plaintext = Buffer.from(JSON.stringify(this.secrets), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope: VaultEnvelopeV1 = {
      version: 1,
      cipher: 'aes-256-gcm',
      kdf: 'pbkdf2-sha256',
      iterations: this.iterations,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    await fs.mkdir(path.dirname(this.vaultPath), { recursive: true });
    await fs.writeFile(
      this.vaultPath,
      JSON.stringify(envelope, null, 2) + '\n',
      'utf8'
    );
  }
}
