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
    .map(([ns, p]) => `import * as ${ns} from "${p}";`)
    .join("\n");
  const sdkObj = "{ " + Object.keys(sdkMap).join(", ") + " }";

  return `
${imports}
const sdk = ${sdkObj};

// template.ts (keep the rest of your template as-is)
declare const FETCH_BRIDGE: any;

// Axios shim will call this
(globalThis as any).__AXIOS_BRIDGE__ = async (url: string, init?: any) => {
  return await FETCH_BRIDGE.apply(undefined, [url, init], {
    arguments: { copy: true },
    result: { promise: true, copy: true },
  });
};

/* ---------- Axios-style HTTP bridge ---------- */

function buildQuery(q?: Record<string, any>): string {
  if (!q) return ""; const s = new URLSearchParams(
    Object.entries(q).flatMap(([k,v]) =>
      v==null ? [] : Array.isArray(v) ? v.map(x=>[k,String(x)]) : [[k,String(v)]]
    ) as any
  ).toString(); return s ? ("?" + s) : "";
}

function b64(s: string) {
  if (typeof (globalThis as any).btoa === "function") return (globalThis as any).btoa(s);
  const enc = new TextEncoder(); const bytes = enc.encode(s);
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "", i = 0;
  while (i < bytes.length) {
    const a = bytes[i++], b = bytes[i++], c = bytes[i++];
    const d1 = a >> 2;
    const d2 = ((a & 3) << 4) | (b >> 4);
    const d3 = b == undefined ? 64 : ((b & 15) << 2) | (c >> 6);
    const d4 = c == undefined ? 64 : (c & 63);
    out += table[d1] + table[d2] + table[d3] + table[d4];
  }
  return out;
}

async function buildHeaders(OpenAPI: any, opt: any): Promise<Record<string,string>> {
  const out: Record<string,string> = {};
  const H = OpenAPI.HEADERS;
  const glob = typeof H === "function" ? await H() : H;
  Object.entries(glob ?? {}).forEach(([k,v]) => (out[k] = String(v)));

  const T = OpenAPI.TOKEN;
  const token = typeof T === "function" ? await T() : T;
  if (token) out["Authorization"] = \`Bearer \${token}\`;

  if (OpenAPI.USERNAME || OpenAPI.PASSWORD) {
    out["Authorization"] = \`Basic \${b64(\`\${OpenAPI.USERNAME ?? ""}:\${OpenAPI.PASSWORD ?? ""}\`)}\`;
  }

  Object.entries(opt?.headers ?? {}).forEach(([k,v]) => (out[k] = String(v)));
  if (opt?.body != null && opt?.mediaType && !("Content-Type" in out)) {
    out["Content-Type"] = String(opt.mediaType);
  }
  return out;
}

function serializeBody(opt: any): { bodyText?: string; form?: Record<string, any> } {
  const body = opt?.body;
  if (body == null) return {};
  const mt = String(opt?.mediaType || "");
  if (mt.includes("application/json")) return { bodyText: JSON.stringify(body) };
  if (mt.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([k,v]) => { if (v!=null) params.append(k, String(v)); });
    return { bodyText: params.toString() };
  }
  if (mt.includes("multipart/form-data") && typeof body === "object") {
    return { form: body as Record<string, any> };
  }
  return { bodyText: String(body) };
}

class BridgeHttpRequest {
  constructor(private OpenAPI: any) {}

  request(options: any) {
    const base = String(this.OpenAPI.BASE ?? "");
    const enc  = typeof this.OpenAPI.ENCODE_PATH === "function" ? this.OpenAPI.ENCODE_PATH : (s: string) => s;
    const path = enc(String(options.path || options.url || ""));
    const url  = base.replace(/\\/$/, "") + "/" + path.replace(/^\\//, "") + buildQuery(options.query);

    const p = (async () => {
      const headers = await buildHeaders(this.OpenAPI, options);
      const body    = serializeBody(options);

      const r = await FETCH_BRIDGE.apply(undefined, [url, {
        method: options.method || "GET",
        headers,
        ...body,
        timeout: this.OpenAPI.TIMEOUT ?? 5000
      }], { arguments: { copy: true }, result: { promise: true, copy: true } });

      const ok = !!r.ok, status = r.status;
      const text = r.bodyText ?? "";
      const ct = (r.headers && (r.headers["content-type"] || r.headers["Content-Type"])) || "";
      let data: any = text;
      if (typeof ct === "string" && ct.toLowerCase().includes("application/json")) {
        try { data = JSON.parse(text); } catch {}
      }
      if (!ok) {
        const err: any = new Error(\`Request failed with status \${status}\`);
        err.status = status;
        err.body = data;
        err.response = { status, headers: r.headers };
        throw err;
      }
      return data;
    })();

    const CP = (this.OpenAPI as any).CancelablePromise;
    if (typeof CP === "function") {
      return new CP<any>((resolve: any, reject: any, _onCancel: any) => { p.then(resolve, reject); });
    }
    return p;
  }
}

// Attach bridge to all namespaces
for (const ns of Object.keys(sdk)) {
  try {
    const mod: any = (sdk as any)[ns];
    if (mod?.OpenAPI) mod.OpenAPI.HTTP = new BridgeHttpRequest(mod.OpenAPI);
  } catch {}
}

/* ---------- Logging + execution (same as before) ---------- */

type LogEntry = { level: "log" | "error" | "warn"; args: any[] };
const logs: LogEntry[] = [];
const safeConsole = {
  log:  (...args: any[]) => logs.push({ level: "log",  args }),
  error:(...args: any[]) => logs.push({ level: "error",args }),
  warn: (...args: any[]) => logs.push({ level: "warn", args }),
};

function isThenable(v: any): v is Promise<any> { return !!v && typeof v.then === "function"; }
function toPlainError(e: any) { return { name: e?.name ?? "Error", message: String(e?.message ?? e), stack: typeof e?.stack==="string"?e.stack:undefined, status: (e as any)?.status, body: (e as any)?.body }; }
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

  const _ret = await (async () => { ${userCode} })();
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
