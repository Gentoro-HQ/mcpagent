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


describe('names utilities', () => {
    let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ext-sdks-"));
  });

  it('sanitizeBaseName allows alphanum and underscore only', async () => {
    const mod = await import('../src/names');
    expect(mod.sanitizeNamespace('Good_Name_123')).toBe('Good_Name_123');
    expect(mod.sanitizeNamespace('has-dash')).toBe('');
    // current implementation trims; spaces are not allowed around but trimmed content is valid
    expect(mod.sanitizeNamespace(' spaced ')).toBe('spaced');
    expect(mod.sanitizeNamespace(undefined)).toBe('');
  });

  it('uniqueSdkFolderName generates non-colliding folders based on preferred name', async () => {
    const { createUniqueSdkFolder } = await import('../src/names');
    const a = createUniqueSdkFolder('MySDK');
    // Simulate folder being taken to force next unique name
    fs.mkdirSync(a.absPath, { recursive: true });
    const b = createUniqueSdkFolder('MySDK');
    expect(b.namespace).not.toBe(a.namespace);
    expect(a.absPath.startsWith(TMP_ROOT)).toBe(true);
    expect(b.absPath.startsWith(TMP_ROOT)).toBe(true);
  });
});
