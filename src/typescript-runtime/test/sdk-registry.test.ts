import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let TMP_ROOT: string; // defined at top-level so the hoisted mock can see it

vi.mock("../src/config.js", async () => {
    const actual = await vi.importActual<typeof import("../src/config.js")>(
        "../src/config.js"
    );
    // use a getter so the current TMP_ROOT value is read at access time
    return {
        ...actual,
        get EXTERNAL_SDKS_ROOT() { return TMP_ROOT; },
    };
});


function writeFile(p: string, content = '') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

describe('sdk-registry discovery and cache', () => {
  let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sdks-'));
  });

  it('discovers SDKs by presence of index.ts/index.js', async () => {
    const pet = path.join(TMP_ROOT, 'petstore');
    const foo = path.join(TMP_ROOT, 'foo');
    writeFile(path.join(pet, 'index.ts'), 'export {}');
    writeFile(path.join(foo, 'index.js'), 'export {}');

    const { discoverExternalSDKs } = await import('../src/sdk-registry');
    const map = discoverExternalSDKs();
    expect(Object.keys(map).sort()).toEqual(['foo', 'petstore']);
    expect(map.petstore).toContain('petstore/index.ts');
    expect(map.foo).toContain('foo/index.js');
  });

  it('getExternalSDKsCached caches and invalidates', async () => {
    const reg = await import('../src/sdk-registry');
    // ensure a clean cache for this test run
    reg.invalidateExternalSDKCache();

    // Empty
    let map = reg.getExternalSDKsCached();
    expect(Object.keys(map)).toHaveLength(0);

    // Add one
    const pet = path.join(TMP_ROOT, 'petstore');
    writeFile(path.join(pet, 'index.ts'), 'export {}');

    // Still cached empty
    map = reg.getExternalSDKsCached();
    expect(Object.keys(map)).toHaveLength(0);

    // Invalidate and see the new one
    reg.invalidateExternalSDKCache();
    map = reg.getExternalSDKsCached();
    expect(Object.keys(map)).toEqual(['petstore']);
  });
});
