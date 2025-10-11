// A shape-compatible axios shim for isolated-vm.
// It routes requests to the host via global __AXIOS_BRIDGE__ (set in template).
// No Node core modules are used here.

export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";
export type AxiosRequestConfig = {
  url?: string;
  baseURL?: string;
  method?: Method | string;
  headers?: Record<string, any>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
};
export type AxiosResponse<T = any> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  config?: AxiosRequestConfig;
};
export class AxiosError extends Error {
  config?: AxiosRequestConfig;
  code?: string;
  response?: AxiosResponse;
  isAxiosError = true;
  constructor(
    message?: string,
    code?: string,
    config?: AxiosRequestConfig,
    response?: AxiosResponse,
  ) {
    super(message);
    this.name = "AxiosError";
    this.code = code;
    this.config = config;
    this.response = response;
  }
}
export const CancelToken = {
  source: () => ({
    token: { __axios_cancel_token_stub: true },
    cancel: (_reason?: any) => {
      /* no-op */
    },
  }),
};

function buildQuery(q?: Record<string, any>): string {
  if (!q) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}
function normHeaders(h?: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {}))
    out[String(k)] = Array.isArray(v) ? v.join(", ") : String(v);
  return out;
}
function serializeBody(data: any, headers: Record<string, string>) {
  if (data == null) return { bodyText: undefined, headers };
  const ctKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === "content-type",
  );
  const ct = ctKey ? String(headers[ctKey]) : "";
  if (ct.includes("application/json"))
    return { bodyText: JSON.stringify(data), headers };
  if (typeof data === "string") return { bodyText: data, headers };
  if (!ctKey) headers["Content-Type"] = "application/json";
  return { bodyText: JSON.stringify(data), headers };
}

function buildURL(cfg: AxiosRequestConfig, defaults: AxiosRequestConfig) {
  const baseURL = cfg.baseURL ?? defaults.baseURL ?? "";
  const path = String(cfg.url || "");
  return (
    (baseURL ? baseURL.replace(/\/$/, "") + "/" : "") +
    path.replace(/^\//, "") +
    buildQuery(cfg.params)
  );
}

async function doRequest(
  cfg: AxiosRequestConfig,
  defaults: AxiosRequestConfig,
): Promise<AxiosResponse> {
  const url = buildURL(cfg, defaults);
  const method = String(cfg.method ?? defaults.method ?? "GET").toUpperCase();
  const headers = {
    ...normHeaders(defaults.headers),
    ...normHeaders(cfg.headers),
  };
  const { bodyText, headers: hdrs } = serializeBody(cfg.data, headers);
  const timeout = cfg.timeout ?? defaults.timeout ?? 5000;

  const r = await (globalThis as any).__AXIOS_BRIDGE__(url, {
    method,
    headers: hdrs,
    bodyText,
    timeout,
  });

  const statusText = String(r.status);
  const ct = r?.headers?.["content-type"] || r?.headers?.["Content-Type"] || "";
  let data: any = r.bodyText;
  if (typeof ct === "string" && ct.toLowerCase().includes("application/json")) {
    try {
      data = JSON.parse(r.bodyText ?? "");
    } catch {}
  }
  const res: AxiosResponse = {
    data,
    status: r.status,
    statusText,
    headers: r.headers || {},
    config: cfg,
  };
  if (!r.ok)
    throw new AxiosError(
      `Request failed with status code ${r.status}`,
      String(r.status),
      cfg,
      res,
    );
  return res;
}

function makeInstance(defaults: AxiosRequestConfig = {}) {
  const inst: any = (config?: AxiosRequestConfig) => inst.request(config || {});
  inst.defaults = { ...defaults };
  inst.interceptors = {
    request: { use: () => {} },
    response: { use: () => {} },
  };

  inst.request = (config: AxiosRequestConfig) =>
    doRequest(config, inst.defaults);

  for (const m of [
    "get",
    "delete",
    "head",
    "options",
    "post",
    "put",
    "patch",
  ] as const) {
    (inst as any)[m] = (
      url: string,
      dataOrCfg?: any,
      maybeCfg?: AxiosRequestConfig,
    ) => {
      const cfg: AxiosRequestConfig =
        m === "get" || m === "delete" || m === "head" || m === "options"
          ? { ...(dataOrCfg || {}), url, method: m.toUpperCase() }
          : {
              ...(maybeCfg || {}),
              url,
              method: m.toUpperCase(),
              data: dataOrCfg,
            };
      return inst.request(cfg);
    };
  }
  return inst;
}

// Default export mirrors real axios API
function axios(config?: AxiosRequestConfig) {
  return makeInstance().request(config || {});
}
(axios as any).request = (cfg: AxiosRequestConfig) =>
  makeInstance().request(cfg);
(axios as any).get = (url: string, cfg?: AxiosRequestConfig) =>
  makeInstance().get(url, cfg);
(axios as any).delete = (url: string, cfg?: AxiosRequestConfig) =>
  makeInstance().delete(url, cfg);
(axios as any).head = (url: string, cfg?: AxiosRequestConfig) =>
  makeInstance().head(url, cfg);
(axios as any).options = (url: string, cfg?: AxiosRequestConfig) =>
  makeInstance().options(url, cfg);
(axios as any).post = (url: string, data?: any, cfg?: AxiosRequestConfig) =>
  makeInstance().post(url, data, cfg);
(axios as any).put = (url: string, data?: any, cfg?: AxiosRequestConfig) =>
  makeInstance().put(url, data, cfg);
(axios as any).patch = (url: string, data?: any, cfg?: AxiosRequestConfig) =>
  makeInstance().patch(url, data, cfg);
(axios as any).create = (cfg?: AxiosRequestConfig) => makeInstance(cfg);
(axios as any).CancelToken = CancelToken;
(axios as any).AxiosError = AxiosError;
(axios as any).isAxiosError = (e: any) => !!e?.isAxiosError;

export default axios as any;
