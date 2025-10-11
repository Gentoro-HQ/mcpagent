/**
 * Utilities for generating safe and unique SDK namespaces and folder paths
 * under EXTERNAL_SDKS_ROOT.
 *
 * Rules
 * - Allowed characters for a requested namespace: letters, digits, underscore.
 * - Names are normalized to lowercase when persisted on disk.
 * - If the requested name is empty/invalid or collides with an existing folder,
 *   a unique fallback `sdk_<timestamp>_<rand>` (and optionally `_N`) is used.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EXTERNAL_SDKS_ROOT } from "./config.js";

/** Describes the resolved SDK namespace and its absolute folder path on disk. */
export type SdkFolderInfo = {
  /** Final, lowercase-safe namespace used to expose the SDK to snippets. */
  namespace: string;
  /** Absolute path to the SDK folder under EXTERNAL_SDKS_ROOT. */
  absPath: string;
};

/**
 * Sanitize a preferred namespace string.
 *
 * - Trims whitespace.
 * - Returns an empty string if it contains characters outside [a-zA-Z0-9_].
 * - Preserves case; lowercase normalization happens when generating the folder name.
 */
export function sanitizeNamespace(raw: string | undefined): string {
  const nameRaw = (raw ?? "").trim();
  if (!nameRaw) return "";
  if (!/^[a-zA-Z0-9_]+$/.test(nameRaw)) return "";
  return nameRaw;
}

/**
 * Resolve a collision-free SDK folder and namespace under EXTERNAL_SDKS_ROOT.
 *
 * Example output: { namespace: "petstore", absPath: "/tmp/external-sdks/petstore" }
 */
export function createUniqueSdkFolder(preferred: string | undefined): SdkFolderInfo {
  const base =
    sanitizeNamespace(preferred) ||
    `sdk_${Date.now()}_${randomUUID().slice(0, 6)}`;
  let candidate = base.toLowerCase();
  let i = 2;

  while (true) {
    const abs = path.join(EXTERNAL_SDKS_ROOT, candidate);
    if (!fs.existsSync(abs)) {
      return { namespace: candidate, absPath: abs };
    }
    candidate = `${base.toLowerCase()}_${i++}`;
  }
}
