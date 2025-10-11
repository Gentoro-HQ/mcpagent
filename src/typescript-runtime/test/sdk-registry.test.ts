import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function writeFile(p: string, content = '') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

describe('sdk-registry discovery and cache', () => {
  let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdks-'));
    process.env.EXTERNAL_SDKS_ROOT = tmp;
  });

  it('discovers SDKs by presence of index.ts/index.js', async () => {
    const pet = path.join(tmp, 'petstore');
    const foo = path.join(tmp, 'foo');
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
    const pet = path.join(tmp, 'petstore');
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
