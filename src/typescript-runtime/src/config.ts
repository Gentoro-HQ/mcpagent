import path from "node:path";
import { getEnv } from "./env.js";

/**
 * Absolute directory where generated SDKs are written and discovered.
 * Default is an ephemeral /tmp path to avoid accidental persistence inside containers.
 * Override via EXTERNAL_SDKS_ROOT when deploying (e.g., to a mounted volume).
 */
const EXTERNAL_SDKS_ROOT_RAW = getEnv("EXTERNAL_SDKS_ROOT");
export const EXTERNAL_SDKS_ROOT = EXTERNAL_SDKS_ROOT_RAW
  ? path.resolve(EXTERNAL_SDKS_ROOT_RAW)
  : "/tmp/external-sdks"; // default mount point
