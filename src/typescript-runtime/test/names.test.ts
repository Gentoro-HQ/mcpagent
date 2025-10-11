import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We'll import the module after setting the env var inside each test to ensure EXTERNAL_SDKS_ROOT is computed against our temp dir.

describe('names utilities', () => {
  let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-sdks-'));
  });

  it('sanitizeBaseName allows alphanum and underscore only', async () => {
    const mod = await import('../src/names');
    expect(mod.sanitizeBaseName('Good_Name_123')).toBe('Good_Name_123');
    expect(mod.sanitizeBaseName('has-dash')).toBe('');
    // current implementation trims; spaces are not allowed around but trimmed content is valid
    expect(mod.sanitizeBaseName(' spaced ')).toBe('spaced');
    expect(mod.sanitizeBaseName(undefined)).toBe('');
  });

  it('uniqueSdkFolderName generates non-colliding folders based on preferred name', async () => {
    process.env.EXTERNAL_SDKS_ROOT = tmp;
    const { uniqueSdkFolderName } = await import('../src/names');
    const a = uniqueSdkFolderName('MySDK');
    // Simulate folder being taken to force next unique name
    fs.mkdirSync(a.absPath, { recursive: true });
    const b = uniqueSdkFolderName('MySDK');
    expect(a.namespace).toMatch(/^mysdk(.*)?/);
    expect(b.namespace).not.toBe(a.namespace);
    expect(a.absPath.startsWith(tmp)).toBe(true);
    expect(b.absPath.startsWith(tmp)).toBe(true);
  });
});
