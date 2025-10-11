import { describe, it, expect, beforeEach } from 'vitest';
import { createHttpBridge } from '../src/http-bridge';

describe('http bridge', () => {
  beforeEach(() => {
    // install a simple request stub that mimics axios response shape
    (globalThis as any).__HTTP_BRIDGE_REQUEST_STUB__ = async (cfg: any) => {
      if (String(cfg.url).includes('/fail')) {
        return { status: 500, headers: { 'X-ERR': 'y' }, data: { msg: 'nope' } };
      }
      return { status: 201, headers: { 'Content-Type': 'application/json', 'X-Ok': 'y' }, data: cfg.data ?? '' };
    };
  });

  it('sends JSON body and normalizes headers on success', async () => {
    const bridge = createHttpBridge({ timeout: 1000 });
    const res = await bridge('https://api.test/ok', {
      method: 'post',
      headers: { 'X-Foo': 'Bar' },
      bodyText: JSON.stringify({ a: 1 }),
    } as any);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['x-ok']).toBe('y');
    expect(JSON.parse(res.bodyText)).toEqual({ a: 1 });
  });

  it('handles errors and returns response data as text', async () => {
    const bridge = createHttpBridge();
    const res = await bridge('https://api.test/fail', { method: 'get' } as any);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.headers['x-err']).toBe('y');
    expect(JSON.parse(res.bodyText)).toEqual({ msg: 'nope' });
  });
});
