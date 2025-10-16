# TypeScript Snippet Runtime (ESM) with OpenAPI SDK Integration

This package provides a small Fastify service that can:
- Accept an OpenAPI spec upload, generate a TypeScript SDK, and register it under a unique namespace.
- Generate Markdown documentation for any generated SDK using OpenAPI Generator’s built-in `markdown` generator.
- Execute TypeScript snippets in a sandboxed isolate where the SDKs are available under the `sdk` object.

It’s designed for rapid prototyping and safe execution of small snippets that call external APIs via generated clients.

---

## Features

- Dynamic snippet execution via `POST /run` with memory/time limits.
- Real-time SDK generation via `POST /sdk/upload` using **OpenAPI Generator (typescript-axios)**.
- Real-time documentation generation via `GET /sdk/docs/:namespace` using **OpenAPI Generator (markdown)**.
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

By default the service listens on PORT=7070 and uses EXTERNAL_SDKS_ROOT=/tmp/external-sdks. You can override:

```bash
PORT=3001 EXTERNAL_SDKS_ROOT=./.sdks pnpm dev
```

---

## Endpoints

### POST /sdk/upload

Generates a TypeScript SDK from an uploaded OpenAPI specification.

**Multipart form-data:**
- `spec`: required file field (.yaml or .json)
- `outDir`: optional folder name; sanitized and made unique

**Example:**

```bash
curl -s -X POST "http://localhost:7070/sdk/upload"   -H "content-type: multipart/form-data"   -F "spec=@./petstore.yaml"   -F "outDir=petstore"
```

**Successful response:**

```json
{
  "ok": true,
  "sdk": {
    "namespace": "petstore",
    "location": "/tmp/external-sdks/petstore",
    "entry": "file:///tmp/external-sdks/petstore/index.ts"
  },
  "message": "SDK generated via OpenAPI Generator (typescript-axios)."
}
```

The generated SDK is available under `sdk.<namespace>` in snippets.

---

### GET /sdk/docs/:namespace

Generates Markdown documentation for a previously generated SDK and returns it as a JSON collection.

**Query parameters:**
- `cleanup` (optional, boolean): when `true`, forces regeneration by deleting existing docs.

**Example:**

```bash
curl -s "http://localhost:7070/sdk/docs/petstore?cleanup=true"
```

**Successful response:**

```json
{
  "ok": true,
  "namespace": "petstore",
  "count": 42,
  "files": [
    { "path": "PetsApi.md", "markdown": "# PetsApi\n\n## listPets\n..." },
    { "path": "UsersApi.md", "markdown": "# UsersApi\n..." }
  ],
  "diskLocation": "/tmp/external-sdks/petstore/docs.openapi-generator.markdown",
  "message": "Documentation generated via OpenAPI Generator (markdown)."
}
```

Each entry in `files[]` corresponds to a Markdown document that describes a service, model, or endpoint.  
These are suitable for rendering in UI viewers, feeding to LLMs, or syncing to external documentation systems.

---

### POST /run

Executes arbitrary TypeScript/JavaScript code in an isolated VM context.

**JSON body:**
- `snippet`: required string with TypeScript/JavaScript code

**Example:**

```bash
curl -X POST http://localhost:7070/run   -H "Content-Type: application/json"   -d '{
    "snippet": "sdk.petstore.OpenAPI.BASE = \"https://api.example.com/pets\"; const pets = await sdk.petstore.PetsApi.listPets({ limit: 2 }); console.log(pets);"
  }'
```

**Response:**

```json
{
  "ok": true,
  "value": null,
  "logs": ["[PetsApi] listPets() -> 2 results"]
}
```

The response returns `{ ok, value?, error?, logs }` where logs capture console output from the isolated execution.

---

## Configuration

Environment configuration is managed with dotenv and supports layered files:

- .env: checked-in, commented template listing all supported variables.
- .env.local: developer-specific overrides (gitignored). Values here override .env.

At startup we load .env first and then .env.local (with override). You can still set shell environment variables and they will be respected. Tests that mutate process.env continue to work since dotenv only seeds process.env.

Environment variables:

| Variable             | Default               | Description                         |
| -------------------- | --------------------- | ----------------------------------- |
| PORT                 | 7070                  | HTTP server port                    |
| EXTERNAL_SDKS_ROOT   | /tmp/external-sdks    | Directory for generated SDKs        |
| SNIPPET_MEM_MB       | 128                   | Memory limit per snippet (MB)       |
| SNIPPET_TIMEOUT_MS   | 60000                 | Max execution time per snippet (ms) |

Rationale: a /tmp default avoids accumulating state across container runs.  
Override EXTERNAL_SDKS_ROOT in production to a mounted volume if you want persistence.

---

## Architecture Overview

- **server.ts** – Fastify app exposing `/sdk/upload`, `/sdk/docs/:namespace`, and `/run`.
- **names.ts** – Sanitizes preferred SDK names and ensures unique folder creation.
- **sdk-registry.ts** – Discovers SDKs under EXTERNAL_SDKS_ROOT with a TTL cache.
- **template.ts** – Builds entry source importing SDKs and wiring axios bridge.
- **http-bridge.ts** – Host-side HTTP bridge (axios-backed) used by the isolate.
- **runner.ts** – Bundles and executes code in isolated-vm with strict limits.
- **esbuild-alias.ts** – Maps axios and form-data to shims when bundling user code.
- **startup.ts** – Cleans EXTERNAL_SDKS_ROOT on startup.
- **config.ts** – Centralized environment config and defaults.

**Key flows:**
1. `/sdk/upload` saves the spec, runs OpenAPI Generator (`typescript-axios`), ensures an index export, and invalidates the cache.
2. `/sdk/docs/:namespace` runs OpenAPI Generator’s `markdown` generator to produce SDK documentation and returns all `.md` files in JSON form.
3. `/run` discovers SDKs, generates entry code, bundles with esbuild, executes in an isolate, and returns results.

---

## Testing

We use Vitest. Tests live in `test/` outside the `src/` tree.

- **Unit tests:** template, http-bridge, names, sdk-registry, runner.
- **Integration tests:** verify spec upload, SDK generation, documentation generation, and snippet execution.

Run:

```bash
pnpm test
```

---

## Contributing Guidelines (for this package)

- Coding style: TypeScript, ESM, Prettier + ESLint (see repo root).
- Use file-level TSDoc to document module purpose; prefer small, single-responsibility modules.
- Keep tests fast and focused; integration tests should remain minimal and hermetic.
- Prefer explicit imports with `.js` extensions for local ESM files inside `src/`.
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
