import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CACHE_DIR } from "../config/paths.js";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: string;
  key: string;
};

const store = new Map<string, CacheEntry<unknown>>();

const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
};

const getCacheFilePath = (key: string) => {
  const hash = crypto.createHash("sha1").update(key).digest("hex");
  return path.resolve(CACHE_DIR, `${hash}.json`);
};

const readDiskEntry = <T>(key: string): CacheEntry<T> | null => {
  try {
    const filePath = getCacheFilePath(key);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry<T>;

    if (!entry || entry.key !== key) return null;

    if (Date.now() > entry.expiresAt) {
      fs.rmSync(filePath, { force: true });
      return null;
    }

    return entry;
  } catch {
    return null;
  }
};

const writeDiskEntry = <T>(key: string, entry: CacheEntry<T>) => {
  try {
    ensureCacheDir();
    fs.writeFileSync(getCacheFilePath(key), JSON.stringify(entry, null, 2), "utf-8");
  } catch {
    // Cache nunca deve derrubar a API.
  }
};

export const cacheGet = <T>(key: string): T | null => {
  const memoryEntry = store.get(key);

  if (memoryEntry) {
    if (Date.now() <= memoryEntry.expiresAt) {
      return memoryEntry.value as T;
    }

    store.delete(key);
  }

  const diskEntry = readDiskEntry<T>(key);

  if (!diskEntry) return null;

  store.set(key, diskEntry as CacheEntry<unknown>);
  return diskEntry.value;
};

export const cacheSet = <T>(key: string, value: T, ttlMs: number): void => {
  const entry: CacheEntry<T> = {
    key,
    value,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMs
  };

  store.set(key, entry as CacheEntry<unknown>);
  writeDiskEntry(key, entry);
};

/**
 * Sentinela de "nunca expira". Usado pelos dados ao vivo: uma vez que a
 * camada de IA preenche os dados, eles ficam gravados em disco e nunca são
 * buscados de novo automaticamente (economiza tokens). A atualização só
 * acontece quando o usuário força um refresh ("Refresh" / "Is something wrong?").
 */
const NEVER_EXPIRES = Number.MAX_SAFE_INTEGER;

export const cacheSetPersistent = <T>(key: string, value: T): void => {
  const entry: CacheEntry<T> = {
    key,
    value,
    createdAt: new Date().toISOString(),
    expiresAt: NEVER_EXPIRES
  };

  store.set(key, entry as CacheEntry<unknown>);
  writeDiskEntry(key, entry);
};

export const cacheClear = (prefix?: string): void => {
  if (!prefix) {
    store.clear();

    try {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      ensureCacheDir();
    } catch {
      // ignore
    }

    return;
  }

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }

  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);

    for (const file of files) {
      const filePath = path.resolve(CACHE_DIR, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const entry = JSON.parse(raw) as CacheEntry<unknown>;

      if (entry.key?.startsWith(prefix)) {
        fs.rmSync(filePath, { force: true });
      }
    }
  } catch {
    // ignore
  }
};

export const cacheStats = () => {
  ensureCacheDir();

  const diskFiles = fs
    .readdirSync(CACHE_DIR)
    .filter((file) => file.endsWith(".json"));

  return {
    memoryEntries: store.size,
    diskEntries: diskFiles.length,
    cacheDir: CACHE_DIR
  };
};
