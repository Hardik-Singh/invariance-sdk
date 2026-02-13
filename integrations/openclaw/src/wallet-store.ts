import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import type { Account } from 'viem';

/** Path to the encrypted wallet file */
const WALLET_DIR = join(
  process.env['HOME'] ?? '~',
  '.openclaw',
  'workspace',
  'skills',
  'invariance',
);
const WALLET_PATH = join(WALLET_DIR, '.wallet.enc');

/** AES-256-GCM encryption for wallet persistence */
interface EncryptedWallet {
  iv: string;
  tag: string;
  data: string;
  salt: string;
}

/**
 * Derives a 32-byte key from a password using SHA-256 + salt.
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(password), salt]))
    .digest();
}

/**
 * Encrypts a private key string with AES-256-GCM.
 */
function encrypt(privateKey: string, password: string): EncryptedWallet {
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted,
    salt: salt.toString('hex'),
  };
}

/**
 * Decrypts a stored wallet with AES-256-GCM.
 */
function decrypt(wallet: EncryptedWallet, password: string): string {
  const salt = Buffer.from(wallet.salt, 'hex');
  const key = deriveKey(password, salt);
  const iv = Buffer.from(wallet.iv, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(wallet.tag, 'hex'));

  let decrypted = decipher.update(wallet.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypted wallet persistence for the OpenClaw skill.
 *
 * Creates or loads an agent wallet, encrypted at rest with a user-provided password.
 */
export class WalletStore {
  private password: string;

  constructor(password: string) {
    this.password = password;
  }

  /**
   * Load existing wallet or create a new one.
   * @returns viem Account ready for SDK use
   */
  loadOrCreate(): { account: Account; isNew: boolean } {
    if (existsSync(WALLET_PATH)) {
      const raw = readFileSync(WALLET_PATH, 'utf8');
      const wallet: EncryptedWallet = JSON.parse(raw);
      const privateKey = decrypt(wallet, this.password) as `0x${string}`;
      return { account: privateKeyToAccount(privateKey), isNew: false };
    }

    const privateKey = generatePrivateKey();
    const encrypted = encrypt(privateKey, this.password);

    mkdirSync(dirname(WALLET_PATH), { recursive: true });
    writeFileSync(WALLET_PATH, JSON.stringify(encrypted), { mode: 0o600 });

    return { account: privateKeyToAccount(privateKey), isNew: true };
  }

  /** Check if a wallet already exists on disk */
  exists(): boolean {
    return existsSync(WALLET_PATH);
  }
}
