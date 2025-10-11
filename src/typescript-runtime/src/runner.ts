/**
 * Execution runner for user-provided TypeScript/JavaScript snippets.
 *
 * Responsibilities
 * - Discover external SDKs (sdk-registry.ts) and generate the entry source (template.ts).
 * - Bundle the entry to a single IIFE with esbuild and alias axios/form-data to local shims.
 * - Execute inside isolated-vm with strict memory and time limits.
 * - Expose a host-side HTTP bridge (FETCH_BRIDGE) implemented via createHttpBridge.
 * - Return a stable result shape with logs and either value or error.
 */
import ivm from "isolated-vm";
import * as esbuild from "esbuild";
import { createEntrySourceMulti } from "./template.js";
import { getExternalSDKsCached } from "./sdk-registry.js";
import path from "node:path";
import { createAliasPlugin } from "./esbuild-alias.js";
import { createHttpBridge } from "./http-bridge.js";

/** One console call captured from inside the isolate. */
export type RunLogEntry = { level: string; args: unknown[] };

/** Final outcome of a snippet execution. */
export type RunResult =
  | { ok: true; value: unknown; logs: RunLogEntry[] }
  | { ok: false; error: string; logs: RunLogEntry[] };

// Environment-driven execution limits with sane defaults.
const SNIPPET_MEM_MB = Number(process.env.SNIPPET_MEM_MB ?? 128);
const SNIPPET_TIMEOUT_MS = Number(process.env.SNIPPET_TIMEOUT_MS ?? 60000);

/**
 * Bundle and run a snippet in an isolated-vm context.
 *
 * Notes
 * - The isolate has no access to Node core modules; the bundle excludes them and globals are nulled.
 * - Network is allowed only through FETCH_BRIDGE, backed by the host's createHttpBridge.
 * - Timeouts are enforced both at script.run and at the awaited main() call to guard CPU and async waits.
 */
export async function runSnippetTS(userCode: string): Promise<RunResult> {
  // Discover registered external SDKs and compose the entry source.
  const sdkMap = getExternalSDKsCached();
  const entrySource = createEntrySourceMulti(sdkMap, userCode);

  // Build a self-contained IIFE bundle of the entry source.
  const buildResult = await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: process.cwd(),
      sourcefile: "entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "iife",
    target: ["node20"],
    treeShaking: true,
    plugins: [
      alias({
        axios: path.resolve("src/shims/axios.ts"),
        "form-data": path.resolve("src/shims/form-data.ts"),
      }),
    ],
    external: [
      "fs",
      "child_process",
      "worker_threads",
      "vm",
      "cluster",
      "net",
      "tls",
      "dgram",
      "inspector",
    ],
  });
  const bundledCode = buildResult.outputFiles[0].text;

  // Create an isolate with a strict memory cap.
  const isolate = new ivm.Isolate({ memoryLimit: SNIPPET_MEM_MB });
  try {
    const context = await isolate.createContext();
    const jail = context.global;

    await jail.set("global", jail.derefInto());

    // Disable Node-ish globals inside the isolate.
    await jail.set("process", null as any);
    await jail.set("Buffer", null as any);

    // Wire the host-side HTTP bridge. Snippet code calls global FETCH_BRIDGE(url, init).
    const httpBridge = createHttpBridge(); // optionally pass baseURL/headers in the future
    await jail.set(
      "FETCH_BRIDGE",
      new ivm.Reference((url: any, init: any) => httpBridge(String(url), init)),
    );

    // Compile and run the bundled user program (CPU time limit only here).
    const script = await isolate.compileScript(bundledCode, {
      filename: "bundle.iife.js",
    });
    await script.run(context, { timeout: SNIPPET_TIMEOUT_MS });

    // Grab the exported main entry from the bundle.
    const mainRef = (await jail.get("__SNIPPET_MAIN", {
      reference: true,
    })) as ivm.Reference<
      () => Promise<{ value?: unknown; logs?: any[]; error?: string }>
    > | null;
    if (!mainRef) {
      return { ok: false, error: "main() not found in bundle", logs: [] };
    }

    // Call main() with a timeout on the awaited result as well.
    const runPromise = mainRef.apply(undefined, [], {
      timeout: SNIPPET_TIMEOUT_MS,
      result: { promise: true, copy: true },
    });

    // Add an outer timeout that disposes the isolate if the promise hangs on async work.
    const timed = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        try {
          isolate.dispose();
        } catch {}
        reject(new Error(`Snippet timed out after ${SNIPPET_TIMEOUT_MS} ms`));
      }, SNIPPET_TIMEOUT_MS);
      runPromise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

    const res: any = await timed;
    if (res?.error) {
      return { ok: false, error: res.error, logs: res.logs ?? [] };
    }
    return { ok: true, value: res?.value, logs: res?.logs ?? [] };
  } finally {
    // Ensure we always free isolate resources.
    try {
      isolate.dispose();
    } catch {}
  }
}
