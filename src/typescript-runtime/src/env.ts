/**
 * Environment loader and accessors for the TypeScript runtime.
 *
 * - Loads variables from .env (defaults / documented) and .env.local (developer overrides).
 * - .env.local overrides .env when keys overlap.
 * - Exposes small helpers to read typed values with sane defaults.
 *
 * This module uses dotenv to populate process.env, so existing tests that mutate
 * process.env will continue to work as expected.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Resolve from current working directory so it works in dev (tsx) and prod (dist)
const CWD = process.cwd();
const ENV_PATH = path.join(CWD, ".env");
const ENV_LOCAL_PATH = path.join(CWD, ".env.local");

// 1) Load base .env first (no override)
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH, override: false });
}
// 2) Load .env.local afterwards to override developer-specific values
if (fs.existsSync(ENV_LOCAL_PATH)) {
  dotenv.config({ path: ENV_LOCAL_PATH, override: true });
}

/** Read a string env var with optional default. Trims surrounding whitespace. */
export function getEnv(name: string, defaultValue?: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }
  return String(raw).trim();
}

/** Read a number env var with optional default; ignores NaN and invalid values. */
export function getNumber(name: string, defaultValue?: number): number | undefined {
  const v = getEnv(name);
  if (v === undefined) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Read a boolean env var ("true"/"1" => true, "false"/"0" => false). */
export function getBoolean(name: string, defaultValue?: boolean): boolean | undefined {
  const v = getEnv(name);
  if (v === undefined) return defaultValue;
  const norm = v.toLowerCase();
  if (norm === "true" || norm === "1" || norm === "yes") return true;
  if (norm === "false" || norm === "0" || norm === "no") return false;
  return defaultValue;
}
