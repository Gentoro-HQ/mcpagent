/**
 * Startup utilities for the TypeScript runtime.
 *
 * This module provides a defensive cleanup routine for the external SDKs root
 * directory used by the service to store generated OpenAPI SDKs. The cleanup
 * removes only the contents of the directory and never deletes the root itself.
 *
 * Safety guards:
 * - Operates only on absolute paths under /tmp by default (configurable via EXTERNAL_SDKS_ROOT).
 * - No-ops if the target path is not a directory.
 * - Ignores per-entry errors and continues.
 */
import fs from "node:fs";
import path from "node:path";
import { EXTERNAL_SDKS_ROOT } from "./config.js";

/**
 * Determine if the given directory path is allowed to be cleaned.
 *
 * Rules:
 * - Must be an absolute path.
 * - Must start with "/tmp/" (to avoid accidental destructive operations).
 */
function isSafeExternalRoot(rootDir: string): boolean {
  if (!path.isAbsolute(rootDir)) return false;
  if (!rootDir.startsWith("/tmp/")) return false;
  return true;
}

/**
 * Remove the contents of EXTERNAL_SDKS_ROOT (or a provided directory) without
 * removing the root directory itself.
 *
 * Notes:
 * - Accepts an optional rootDir argument to facilitate testing; defaults to EXTERNAL_SDKS_ROOT.
 * - Returns void; callers typically run this once on process startup.
 */
export function cleanExternalSDKsRoot(rootDir: string = EXTERNAL_SDKS_ROOT): void {
  const target = rootDir;

  // Safety guards
  if (!isSafeExternalRoot(target)) return;

  fs.mkdirSync(target, { recursive: true });
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return;

  for (const entryName of fs.readdirSync(target)) {
    const entryPath = path.join(target, entryName);
    try {
      const entryStat = fs.lstatSync(entryPath);
      if (entryStat.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.rmSync(entryPath, { force: true });
      }
    } catch {
      // ignore per-entry errors; keep going
    }
  }
}
