// Secure key storage via Electron safeStorage (OS Credential Manager on Windows).
// Provider API keys never live in plaintext. Presence flags are surfaced to the
// renderer; the actual key material never leaves the main process.

import { app, safeStorage } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type { Provider } from "../shared/types";

interface KeyFile {
  [provider: string]: string; // base64 of encrypted bytes
}

const FILE = "provider_keys.enc";
let cache: KeyFile | null = null;

function filePath(): string {
  return join(app.getPath("userData"), FILE);
}

function load(): KeyFile {
  if (cache) return cache;
  const p = filePath();
  if (!existsSync(p)) {
    cache = {};
    return cache;
  }
  try {
    const raw = readFileSync(p, "utf8");
    cache = JSON.parse(raw) as KeyFile;
  } catch {
    cache = {};
  }
  return cache;
}

function save(data: KeyFile): void {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), JSON.stringify(data, null, 2), "utf8");
  cache = data;
}

function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: base64-only (NOT secure). Warn in UI. Best-effort on systems
    // where safeStorage is unavailable.
    return "b64:" + Buffer.from(plain, "utf8").toString("base64");
  }
  const buf = safeStorage.encryptString(plain);
  return "enc:" + buf.toString("base64");
}

function decrypt(stored: string): string {
  if (stored.startsWith("b64:")) return Buffer.from(stored.slice(4), "base64").toString("utf8");
  if (stored.startsWith("enc:")) {
    const buf = Buffer.from(stored.slice(4), "base64");
    return safeStorage.decryptString(buf);
  }
  return "";
}

export const keyStore = {
  set(provider: Provider, key: string): void {
    const data = load();
    data[provider] = encrypt(key);
    save(data);
  },
  async get(provider: Provider): Promise<string | null> {
    const data = load();
    const stored = data[provider];
    if (!stored) return null;
    try {
      return decrypt(stored);
    } catch {
      return null;
    }
  },
  has(provider: Provider): boolean {
    return Boolean(load()[provider]);
  },
  delete(provider: Provider): void {
    const data = load();
    delete data[provider];
    save(data);
  },
  providers(): Provider[] {
    return Object.keys(load()) as Provider[];
  },
  isSecure(): boolean {
    return safeStorage.isEncryptionAvailable();
  },
};
