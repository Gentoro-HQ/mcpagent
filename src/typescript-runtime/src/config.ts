import path from "node:path";

/**
 * Absolute directory where generated SDKs are written and discovered.
 * Default is an ephemeral /tmp path to avoid accidental persistence inside containers.
 * Override via EXTERNAL_SDKS_ROOT when deploying (e.g., to a mounted volume).
 */
export const EXTERNAL_SDKS_ROOT = process.env.EXTERNAL_SDKS_ROOT
  ? path.resolve(process.env.EXTERNAL_SDKS_ROOT)
  : "/tmp/external-sdks"; // default mount point
