import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import axios from 'axios';
import FormData from 'form-data';
import http from 'node:http';

// Give plenty of time for codegen + bundling
const TEST_TIMEOUT = 60_000;

function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

function waitForOutput(child: any, matcher: RegExp, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for server output')), timeoutMs);
    const onData = (buf: Buffer) => {
      const s = buf.toString();
      console.log('output', s);
      if (matcher.test(s)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
  });
}

function startSnippetService(port: number, extsdkRoot: string) {
  const tsxBin = path.resolve(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const serverTs = path.resolve(__dirname, '..', 'src', 'server.ts');
  // Use a clean working directory so dotenv in env.ts does not pick up project-level .env/.env.local
  // We reuse the external SDKs temp root for convenience.
  const child = spawn(tsxBin, [serverTs], {
    cwd: extsdkRoot,
    env: {
      ...process.env,
      // Explicitly set the intended test values; ensure no conflicting vars leak in
      PORT: String(port),
      EXTERNAL_SDKS_ROOT: extsdkRoot,
      // tighter limits to keep test snappy
      SNIPPET_TIMEOUT_MS: '15000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

function startMockApi(port: number) {
  const server = http.createServer((req, res) => {
    if (!req.url) { res.statusCode = 404; return res.end('no url'); }
    const u = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'GET' && u.pathname === '/pets') {
      const items = Array.from({ length: 2 }, (_, i) => ({ id: i + 1, name: `pet-${i+1}` }));
      const body = JSON.stringify(items);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(body);
      return;
    }
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not found' }));
  });
  return new Promise<{ server: http.Server, close: () => Promise<void> }>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        close: () => new Promise<void>((resClose) => server.close(() => resClose())),
      });
    });
    server.on('error', reject);
  });
}

describe('integration: upload spec and run snippet end-to-end', () => {
  const servicePort = 34567; // fixed test port
  const apiPort = 34568; // mock API port
  let child: ReturnType<typeof spawn> | null = null;
  let tmpRoot = '';
  let apiClose: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    tmpRoot = makeTempDir('ext-sdks-');

    // Start mock API first
    const api = await startMockApi(apiPort);
    apiClose = api.close;

    // Start the snippet service
    child = startSnippetService(servicePort, tmpRoot);

    // wait until server logs it's listening
    await waitForOutput(child, /listening on :34567/);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM');
      // give it a moment to exit
      await delay(200);
    }
    if (apiClose) {
      await apiClose();
    }
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    }
  }, TEST_TIMEOUT);

  it('uploads spec and runs a snippet using generated SDK', async () => {
    // Step 1: upload a tiny OpenAPI spec with a /pets endpoint
    const openapi = `openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
      tags:
        - Pets
      parameters:
        - in: query
          name: limit
          required: false
          schema:
            type: integer
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
      required: [id, name]
      `;

    const form = new FormData();
    form.append('spec', Buffer.from(openapi, 'utf8'), { filename: 'openapi.yaml', contentType: 'application/yaml' });
    form.append('outDir', 'petstore');

    const uploadResp = await axios.post(`http://127.0.0.1:${servicePort}/sdk/upload`, form, {
      headers: form.getHeaders(),
      maxBodyLength: 10 * 1024 * 1024,
      validateStatus: () => true,
    });

    expect(uploadResp.status).toBe(200);
    expect(uploadResp.data?.ok).toBe(true);
    expect(uploadResp.data?.sdk?.namespace).toBeTypeOf('string');

    // Step 2: run snippet that uses the generated SDK
    const snippet = `
      console.log('starting');
      const configuration = new sdk.petstore.Configuration({
        basePath: "http://127.0.0.1:${apiPort}"
      });
      const pets = new sdk.petstore.PetsApi(configuration);
      const { data } = await pets.listPets(10);
      console.log('pets', data);
      const result = ['pets', data.length];
      result;
    `;

    const runResp = await axios.post(`http://127.0.0.1:${servicePort}/run`, { snippet }, { validateStatus: () => true });

    expect(runResp.status).toBe(200);
    expect(runResp.data?.ok).toBe(true);
    // result is undefined because the snippet does not return; we assert via logs
    expect(Array.isArray(runResp.data?.logs)).toBe(true);
    const logs = runResp.data?.logs as Array<{ level: string; args: any[] }>;
    const petsLog = logs.find(l => l.level === 'log' && l.args && l.args[0] === '"pets"');
    // second arg should indicate two items. Depending on runtime, logs may stringify objects.
    const second = JSON.parse(petsLog!.args[1]);
    if (Array.isArray(second)) {
      expect(second.length).toBe(2);
    } else if (typeof second === 'string') {
      // e.g., "[object Object],[object Object]"
      const parts = second.split(',');
      expect(parts.length).toBe(2);
    } else {
      throw new Error(`Unexpected log arg type: ${typeof second}`);
    }
  }, TEST_TIMEOUT);
});
