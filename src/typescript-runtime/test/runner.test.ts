import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock esbuild to return a bundle that defines __SNIPPET_MAIN invoking our code
vi.mock('esbuild', () => ({
  build: vi.fn(async (_cfg: any) => {
    // Provide a minimal bundle that sets __SNIPPET_MAIN which returns value/logs directly
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

import { runSnippetTS } from '../src/runner';

describe('runSnippetTS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns ok with JSON-string value and logs when main succeeds', async () => {
    const res = await runSnippetTS('return 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      // runner.ts now JSON.stringify() the value
      expect(res.value).toBe('123');
      expect(Array.isArray(res.logs)).toBe(true);
    }
  });
});
