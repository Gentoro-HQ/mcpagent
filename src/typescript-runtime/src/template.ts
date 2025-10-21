/**
 * Generate an entry source string that:
 * - Imports all discovered SDKs as ESM modules and exposes them under a `sdk` object.
 * - Installs an axios-style HTTP bridge that delegates to the host's FETCH_BRIDGE.
 * - Wires per-SDK OpenAPI config to use the bridge for requests.
 * - Captures console logs and returns a stable shape from main().
 *
 * This source is bundled by esbuild into a single IIFE and executed inside an isolate.
 */
export function createEntrySourceMulti(
  sdkMap: Record<string, string>,
  userCode: string,
): string {
  const imports = Object.entries(sdkMap)
    .map(([ns, p]) => `import * as ${ns} from "${p.substring(0, p.lastIndexOf("."))}";`)
    .join("\n");
  const sdkObj = "{ " + Object.keys(sdkMap).join(", ") + " }";

  return `
${imports}
const sdk = ${sdkObj};

/* ---------- Logging + execution (same as before) ---------- */

type LogEntry = { level: "log" | "error" | "warn"; args: any[] };
const logs: LogEntry[] = [];
const safeConsole = {
  log:  (...args: any[]) => logs.push({ level: "log", args: safePlain(args || []) }),
  error:(...args: any[]) => logs.push({ level: "error", args: safePlain(args || []) }),
  warn: (...args: any[]) => logs.push({ level: "warn", args: safePlain(args || []) }),
};

function isThenable(v: any): v is Promise<any> { return !!v && typeof v.then === "function"; }
function toPlainError(e: any) { return JSON.stringify( { name: e?.name ?? "Error", message: String(e?.message ?? e), stack: typeof e?.stack==="string"?e.stack:undefined, status: (e as any)?.status, body: (e as any)?.body } ); }
function safePlain(v: any, seen = new WeakSet()): any {
  if (v===null || typeof v!=="object") { if (typeof v==="function") return \`[Function \${v.name||"anonymous"}]\`; if (isThenable(v)) return "[Promise]"; return v; }
  if (v instanceof Error) return toPlainError(v);
  if (seen.has(v)) return "[Circular]"; seen.add(v);
  if (Array.isArray(v)) return v.map(x=>safePlain(x, seen));
  const out: any = {}; for (const k of Object.keys(v)) { try { out[k] = safePlain((v as any)[k], seen); } catch { out[k]="[Unserializable]"; } } return out;
}
async function awaitThenable<T>(v: T): Promise<any> { return isThenable(v) ? await (v as any) : v; }

async function __run() {
  const console = safeConsole;
  const _sdk = sdk;
  let result: any;

  const _ret = await (async () => {
    try {
    // Auto-generated snippet goes here
        
    ${userCode}
    
    } catch (err: any) {
        console.error('failed while executing snippet', err);
        throw err;        
    } 
  })();
  const finalValue = (typeof result === 'undefined') ? _ret : result;
  const value = await awaitThenable(finalValue);

  const plainLogs = logs.map(l => ({ level: l.level, args: Array.isArray(l.args) ? l.args.map(a => safePlain(a)) : [] }));
  return { value, logs: plainLogs };
}

export async function main() {
  try { return await __run(); }
  catch (err: any) {
    logs.push({ level: "error", args: [toPlainError(err)] });
    return { error: toPlainError(err), logs: logs.map(l => ({ level: l.level, args: Array.isArray(l.args) ? l.args.map(a => safePlain(a)) : [] })) };
  }
}

(globalThis as any).__SNIPPET_MAIN = main;
`;
};

/** @deprecated Use createEntrySourceMulti instead. */
export const makeEntrySourceMulti = createEntrySourceMulti;
