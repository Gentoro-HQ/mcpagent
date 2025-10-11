import { describe, it, expect } from 'vitest';
import {createEntrySourceMulti} from '../src/template';

describe('makeEntrySourceMulti', () => {
  it('generates imports and sdk object for provided namespaces', () => {
    const src = createEntrySourceMulti({ petstore: 'file:///x/pet/index.ts', acme: 'file:///x/acme/index.ts' }, 'return 42;');
    expect(src).toContain('import * as petstore from "file:///x/pet/index.ts";');
    expect(src).toContain('import * as acme from "file:///x/acme/index.ts";');
    expect(src).toContain('const sdk = { petstore, acme };');
    expect(src).toContain('(globalThis as any).__SNIPPET_MAIN = main');
  });

  it('embeds the user code in an async IIFE and returns value/logs', () => {
    const src = createEntrySourceMulti({}, 'console.log("hi"); return 7;');
    expect(src).toMatch(/const _ret = await \(async \(\) => \{ /);
    expect(src).toContain('console.log("hi")');
    expect(src).toContain('return 7;');
    expect(src).toContain('return { value, logs: plainLogs };');
  });
});
