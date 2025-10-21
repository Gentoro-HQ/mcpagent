import vm from "node:vm";
import * as esbuild from "esbuild";
import { createEntrySourceMulti } from "./template.js";
import { getExternalSDKsCached } from "./sdk-registry.js";
import { createAliasPlugin } from "./esbuild-alias.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getNumber } from "./env.js";
export type RunLogEntry = { level: string; args: unknown[] };
export type RunResult =
    | { ok: true; value: unknown; logs: RunLogEntry[] }
    | { ok: false; error: string; logs: RunLogEntry[] };

const SNIPPET_TIMEOUT_MS = getNumber("SNIPPET_TIMEOUT_MS", 60_000)!;

// --- add these for ESM compatibility ---
const requireForVm = createRequire(import.meta.url);
const __filename_vm = fileURLToPath(import.meta.url);
const __dirname_vm = path.dirname(__filename_vm);
const moduleForVm: { exports: any } = { exports: {} };
const exportsForVm = moduleForVm.exports;

export async function runSnippetTS(userCode: string): Promise<RunResult> {
    // 1) Compose the entry from your SDK registry + user code
    const sdkMap = getExternalSDKsCached();
    const entrySource = createEntrySourceMulti(sdkMap, userCode);
    console.log(entrySource);
    // 2) Bundle to a single IIFE; leave axios/form-data external on purpose
    const build = await esbuild.build({
        stdin: {
            contents: entrySource,
            resolveDir: process.cwd(),
            sourcefile: "entry.ts",
            loader: "ts",
        },
        bundle: true,
        write: false,
        platform: "node",
        format: "iife",           // exposes globalThis.__SNIPPET_MAIN
        target: ["node20"],
        treeShaking: true,
        plugins: [
            createAliasPlugin({
                // IMPORTANT: no axios/form-data aliases now
            }),
        ],
        external: [
            "axios",                // ← keep axios external
            "form-data",            // ← only if your SDK imports it directly
            // Node core externals you already had:
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
        // Optional, but helps module resolution in mono-repos:
        mainFields: ["module", "main"],
        conditions: ["node", "default"],
        // Useful if you want to inspect what’s external/bundled:
        // metafile: true,
    });

    const bundledCode = build.outputFiles[0].text;

    // 4) Prepare a Node vm context with CommonJS globals so external requires work
    let context;
    try {
        context = vm.createContext({
            // make the same global shared to catch __SNIPPET_MAIN
            globalThis,
            // CommonJS globals for externals like axios:
            require: requireForVm,
            module: moduleForVm,
            exports: exportsForVm,
            __dirname: __dirname_vm,
            __filename: __filename_vm,
            process,

            // 🔑 Web/WHATWG globals the SDK may use
            URL,                         // <-- fixes "URL is not defined"
            URLSearchParams,
            TextEncoder,
            TextDecoder,
            AbortController,

            // Nice to have if your SDK ever hits them (Node 18+ provides these)
            Blob: globalThis.Blob,
            FormData: globalThis.FormData,
            Headers: globalThis.Headers,

            // timers if your snippet uses them directly
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });
    } catch (err: any) {
        return { ok: false, error: err?.stack ?? String(err), logs: [] };
    }

    // 5) Run the IIFE so it defines globalThis.__SNIPPET_MAIN
    try {
        new vm.Script(
            // set a filename for better stack traces
            `"use strict";\n${bundledCode}\n//# sourceURL=bundle.iife.js\n`,
            { filename: "bundle.iife.js"}
        ).runInContext(context, { timeout: SNIPPET_TIMEOUT_MS });
    } catch (err: any) {
        return { ok: false, error: err?.stack ?? String(err), logs: [] };
    }

    // 6) Grab and invoke __SNIPPET_MAIN with a timeout
    const mainFn = (globalThis as any).__SNIPPET_MAIN as
        | (() => Promise<{ value?: unknown; logs?: any[]; error?: string }>)
        | undefined;

    if (typeof mainFn !== "function") {
        return { ok: false, error: "main() not found in bundle", logs: [] };
    }

    // Promise.race-based async timeout (separate from vm run timeout)
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
            () => reject(new Error(`Snippet timed out after ${SNIPPET_TIMEOUT_MS} ms`)),
            SNIPPET_TIMEOUT_MS
        )
    );

    const normalizeLogs = (logs: RunLogEntry[] ) => {
        return logs.map(normalizeLogArgs);
    }

    const normalizeLogArgs = (log:RunLogEntry) => {
        log.args = (log.args ?? []).map((arg) => JSON.stringify(arg));
        return log;
    }

    try {
        const result: any = await Promise.race([mainFn(), timeoutPromise]);
        let formattedResult: any;
        if (result?.error) {
            formattedResult = { ok: false, error: String(result.error), logs: normalizeLogs(result.logs ?? []) };
        } else {
            formattedResult = { ok: true, value: JSON.stringify(result?.value), logs: normalizeLogs(result?.logs ?? []) };
        }
        console.log('result', formattedResult);
        return formattedResult;
    } catch (err: any) {
        return { ok: false, error: err?.stack ?? String(err), logs: [] };
    } finally {
        // 7) Cleanup globals if you don’t want them to leak between runs
        try { delete (globalThis as any).__SNIPPET_MAIN; } catch {}
        // try { delete (globalThis as any).FETCH_BRIDGE; } catch {}
    }
}
