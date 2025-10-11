/**
 * SDK registry discovery utilities.
 *
 * Discovers generated SDKs under EXTERNAL_SDKS_ROOT and returns a map of
 * namespace -> absolute entry file path (prefers index.ts, falls back to index.js).
 *
 * Notes
 * - Paths are normalized to POSIX separators so they are safe for esbuild on all OSes.
 * - A small TTL cache is used to avoid frequent filesystem scans during rapid /run calls.
 */
import fs from "node:fs";
import path from "node:path";
import { EXTERNAL_SDKS_ROOT } from "./config.js";

/** Candidate entry file basenames in order of preference. */
const ENTRY_BASENAMES = ["index.ts", "index.js"] as const;
/** TTL for the discovery cache in milliseconds. */
const CACHE_TTL_MS = 1500;

/** Mapping from SDK namespace to absolute entry file path. */
export type SdkNamespaceMap = Record<string, string>;

let cache: { at: number; map: SdkNamespaceMap } | null = null;

function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Sanitize a directory name into a stable namespace id. */
function toNamespace(dirName: string): string {
  return dirName.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
}

/**
 * Scan EXTERNAL_SDKS_ROOT for SDK folders that contain an entry file and
 * return a map of namespace to absolute entry path.
 */
export function discoverExternalSDKs(): SdkNamespaceMap {
  const map: SdkNamespaceMap = {};
  if (!fs.existsSync(EXTERNAL_SDKS_ROOT)) return map;

  for (const name of fs.readdirSync(EXTERNAL_SDKS_ROOT)) {
    const folder = path.join(EXTERNAL_SDKS_ROOT, name);
    if (!fs.statSync(folder).isDirectory()) continue;

    for (const base of ENTRY_BASENAMES) {
      const entry = path.join(folder, base);
      if (fs.existsSync(entry)) {
        let ns = toNamespace(name);
        let i = 2;
        // Ensure unique namespace within this discovery pass
        while (map[ns]) ns = `${toNamespace(name)}-${i++}`;
        map[ns] = toPosixPath(entry); // absolute FS path (not file://)
        break;
      }
    }
  }
  return map;
}

/**
 * Cached variant of discoverExternalSDKs() with a small TTL to avoid repeated
 * filesystem scans under load.
 */
export function getExternalSDKsCached(): SdkNamespaceMap {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    cache = { at: now, map: discoverExternalSDKs() };
  }
  return cache.map;
}

/** Invalidate the discovery cache so the next call performs a fresh scan. */
export function invalidateExternalSDKCache(): void {
  cache = null;
}
