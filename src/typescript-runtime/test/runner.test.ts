import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock esbuild to return a bundle that defines __SNIPPET_MAIN invoking our code
vi.mock('esbuild', () => ({
  build: vi.fn(async (cfg: any) => {
    const userSource = cfg.stdin.contents as string;
    // our template code includes the entire program; we just pass through
    // Here, we provide a minimal bundle that sets __SNIPPET_MAIN which returns value/logs directly
    const bundled = `
      (function(){
        const logs = [];
        function main(){ return Promise.resolve({ value: 123, logs }); }
        globalThis.__SNIPPET_MAIN = main;
      })();
    `;
    return { outputFiles: [{ text: bundled }] } as any;
  }),
}));

// Lightweight isolated-vm mock that stores global properties and returns them
vi.mock('isolated-vm', () => {
  class GlobalStore {
    private store = new Map<string, any>();
    async set(key: string, val: any) { this.store.set(key, val); }
    async get(key: string, opts?: any) {
      const v = this.store.get(key);
      if (opts?.reference) {
        return { apply: async () => ({ value: 123, logs: [] }) };
      }
      return v;
    }
    derefInto() { return this; }
  }
  class Context { global = new GlobalStore(); }
  class Isolate {
    constructor(_opts?: any) {}
    async createContext() { return new Context(); }
    dispose() {}
    async compileScript(_code: string) { return { run: async () => {} }; }
  }
  class Reference {
    private fn: any;
    constructor(fn: any) { this.fn = fn; }
    async apply(_recv?: any, args?: any[], _opts?: any) {
      return await this.fn(...(args ?? []));
    }
  }
  // Default export should have Isolate and Reference for `new ivm.Isolate(...)` and `new ivm.Reference(...)`
  return { default: { Isolate, Reference }, Isolate, Reference } as any;
});

import { runSnippetTS } from '../src/runner';

describe('runSnippetTS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns ok with value and logs when main succeeds', async () => {
    const res = await runSnippetTS('return 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(123);
      expect(Array.isArray(res.logs)).toBe(true);
    }
  });
});
