# TypeScript Snippet Runtime (ESM) with OpenAPI SDK Integration

This package provides a small Fastify service that can:
- Accept an OpenAPI spec upload, generate a TypeScript SDK, and register it under a unique namespace.
- Execute TypeScript snippets in a sandboxed isolate where the SDKs are available under the `sdk` object.

It’s designed for rapid prototyping and safe execution of small snippets that call external APIs via generated clients.

---

## Features

- Dynamic snippet execution via `POST /run` with memory/time limits.
- OpenAPI codegen via `POST /sdk/upload` using openapi-typescript-codegen.
- Automatic discovery and namespacing of generated SDKs.
- Sandboxed runtime with an axios-style HTTP bridge managed on the host side.
- Fully ESM module setup ("type": "module"); Node.js >= 20 required.

---

## Development

Requirements: Node.js 20+, pnpm (or npm/yarn), macOS/Linux.

Scripts (package.json):
- `pnpm dev` – start the Fastify server with tsx (no build step).
- `pnpm test` – run unit and integration tests with Vitest.
- `pnpm test:watch` – watch mode for tests.
- `pnpm test:coverage` – coverage report.
- `pnpm typecheck` – TypeScript compile check.

Running locally:

```bash
pnpm install
pnpm dev
```

By default the service listens on PORT=3000 and uses EXTERNAL_SDKS_ROOT=/tmp/external-sdks. You can override:

```bash
PORT=3001 EXTERNAL_SDKS_ROOT=./.sdks pnpm dev
```

---

## Endpoints

### POST /sdk/upload
Multipart form-data:
- spec: required file field (.yaml or .json)
- outDir: optional folder name; will be sanitized and made unique

Example:

```bash
curl -s -X POST "http://localhost:3000/sdk/upload" \
  -H "content-type: multipart/form-data" \
  -F "spec=@./petstore.yaml" \
  -F "outDir=petstore"
```

Successful response contains the namespace, absolute location, and entry file path.

### POST /run
JSON body:
- snippet: required string with TypeScript/JavaScript code

Example:

```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{
    "snippet": "sdk.petstore.OpenAPI.BASE = \"https://api.example.com/pets\"; const pets = await sdk.petstore.PetsService.listPets({ limit: 2 }); const result = pets.length;"
  }'
```

The response returns { ok, value?, error?, logs } where logs capture console.log/error/warn.

---

## Configuration

Environment variables:

| Variable             | Default               | Description                         |
| -------------------- | --------------------- | ----------------------------------- |
| PORT                 | 3000                  | HTTP server port                    |
| EXTERNAL_SDKS_ROOT   | /tmp/external-sdks    | Directory for generated SDKs        |
| SNIPPET_MEM_MB       | 128                   | Memory limit per snippet (MB)       |
| SNIPPET_TIMEOUT_MS   | 60000                 | Max execution time per snippet (ms) |

Rationale: a /tmp default avoids accumulating state across container runs. Override EXTERNAL_SDKS_ROOT in production to a mounted volume if you want persistence.

---

## Architecture Overview

- server.ts – Fastify app that exposes /sdk/upload and /run. Cleans EXTERNAL_SDKS_ROOT on startup.
- names.ts – Sanitizes preferred SDK name and generates a unique folder name.
- sdk-registry.ts – Discovers SDKs under EXTERNAL_SDKS_ROOT (index.ts/js) with a tiny TTL cache.
- template.ts – Builds the entry source that imports SDKs and wires an axios-like HTTP bridge.
- http-bridge.ts – Host-side HTTP bridge (axios-backed) used by the isolate to perform HTTP calls.
- runner.ts – Bundles entry with esbuild and executes inside isolated-vm with memory/time limits.
- esbuild-alias.ts – Maps axios and form-data to our shims when bundling user code.
- startup.ts – Defensive cleanup of EXTERNAL_SDKS_ROOT contents.
- config.ts – Centralized env config and defaults.

Key flows:
1) /sdk/upload saves the spec, runs codegen, ensures index.ts exists, and invalidates discovery cache.
2) /run discovers SDKs (cached), generates entry code, bundles with esbuild, runs inside isolated-vm, returns value and logs.

---

## Testing

We use Vitest. Tests live in test/ outside the src/ tree and run quickly.

- Unit tests: template, http-bridge, names, sdk-registry, runner.
- Integration test: boots the service, uploads a small spec, starts a mock API, executes a snippet using the generated SDK.

Run:

```bash
pnpm test
```

Tips:
- The isolated-vm and esbuild dependencies are mocked in unit tests for speed and determinism.
- The http-bridge exposes a `__HTTP_BRIDGE_REQUEST_STUB__` hook for tests to intercept requests without network (a legacy alias `__AXIOS_REQUEST_STUB__` is still accepted).

---

## Contributing Guidelines (for this package)

- Coding style: TypeScript, ESM, Prettier + ESLint (see repo root).
- Use file-level TSDoc to document module purpose; prefer small, single-responsibility modules.
- Keep tests fast and focused; integration tests should remain minimal and hermetic.
- Prefer explicit imports with .js extensions for local ESM files inside src/.
- When changing public behavior, update this README and relevant tests.

To run only this package's tests:

```bash
cd src/typescript-runtime
pnpm test
```

---

## Security Notes

- Snippets run in an isolate with Node internals like fs, net, child_process, etc., excluded from the bundle.
- Network access happens only through the host-side bridge; consider adding allowlists/ratelimiting for production.
- Add authentication/authorization around the endpoints for multi-tenant deployments.

---

## License

MIT
