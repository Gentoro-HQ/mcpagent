/**
 * Fastify server exposing two endpoints:
 * - POST /sdk/upload: Upload an OpenAPI spec and generate a TypeScript SDK under EXTERNAL_SDKS_ROOT.
 * - POST /run: Execute a TypeScript snippet inside an isolated-vm with access to discovered SDKs via `sdk.<namespace>`.
 *
 * Startup performs a cleanup of the external SDKs root to ensure a clean state. The server is intentionally slim;
 * most logic lives in runner.ts (execution) and template.ts (generated entry code). See README for full flow.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import multipart from "@fastify/multipart";
import * as fs from "node:fs";
import path from "node:path";
import { generate } from "openapi-typescript-codegen";
import { runSnippetTS } from "./runner.js";
import { EXTERNAL_SDKS_ROOT } from "./config.js";
import { invalidateExternalSDKCache } from "./sdk-registry.js";
import { cleanExternalSDKsRoot } from "./startup.js";
import { createUniqueSdkFolder } from "./names.js";

// Cleanup the external SDKs root on startup
cleanExternalSDKsRoot();

// -----------------------------
// Fastify server
// -----------------------------

/** Build and configure the Fastify application (register plugins and routes). */
export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Multipart plugin (file uploads)
  await app.register(multipart, {
    attachFieldsToBody: true, // get both fields and files on req.body
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // -----------------------------
  // /run endpoint
  // -----------------------------
  const RunBodySchema = z.object({
    snippet: z.string().min(1).max(10_000),
  });

  // Very light keyword blocklist; real safety = the isolate + bundling strategy
  const SNIPPET_BLOCKLIST = [
    /process\./,
    /require\s*\(/,
    /\bimport\s*\(/,
    /\bfs\b/,
    /\bchild_process\b/,
    /\bworker_threads\b/,
    /\bvm\b/,
    /\binspector\b/,
    /\bnet\b/,
    /\btls\b/,
  ];

  app.post("/run", async (req, reply) => {
    const parse = RunBodySchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ ok: false, error: parse.error.message });
    }
    const { snippet } = parse.data;

    if (SNIPPET_BLOCKLIST.some((re) => re.test(snippet))) {
      return reply
        .code(400)
        .send({ ok: false, error: "Snippet contains disallowed APIs" });
    }

    const result = await runSnippetTS(snippet);

    if (result.ok) return { ok: true, value: result.value, logs: result.logs };
    return reply
      .code(400)
      .send({ ok: false, error: result.error, logs: result.logs });
  });

  // -----------------------------
  // /sdk/upload endpoint
  // Accepts: multipart/form-data with:
  //   - file field:  "spec" (required)  -> YAML/JSON OpenAPI
  //   - text field:  "outDir" (optional)-> relative to project root, e.g. "src/generated/petstore"
  // Output: generates TS client and returns namespace + location
  // -----------------------------
  app.post("/sdk/upload", async (req, reply) => {
    // @ts-ignore types from fastify-multipart
    const body = req.body as any;

    // 1) Pull the uploaded file stream
    const specFile = body?.spec;
    if (!specFile || typeof specFile !== "object" || !specFile?.file) {
      return reply
        .code(400)
        .send({ ok: false, error: "Missing 'spec' file field" });
    }

    const requested =
      typeof body?.outDir?.value === "string"
        ? body.outDir.value
        : typeof body?.outDir === "string"
          ? body.outDir
          : undefined;

    // Resolve a unique, collision-free folder under the external root
    const { namespace, absPath } = createUniqueSdkFolder(requested);

    // Ensure the external root exists; mkdir the namespace folder
    fs.mkdirSync(EXTERNAL_SDKS_ROOT, { recursive: true });
    fs.mkdirSync(absPath, { recursive: true });

    const buf = await body?.spec.toBuffer(); // consumes stream
    const yamlString = buf.toString("utf8");

    // 3) Save the uploaded spec to a temp file
    const tmpSpecPath = path.resolve(absPath, "openapi.upload.yaml");
    fs.writeFileSync(tmpSpecPath, yamlString, "utf8");

    // 4) Generate the client into absOutDir
    try {
      await generate({
        input: tmpSpecPath,
        output: absPath,
        httpClient: "axios",
      });
    } catch (e: any) {
      req.log.error(e, "openapi-typescript-codegen failed");
      return reply
        .code(400)
        .send({ ok: false, error: `Codegen failed: ${String(e.message || e)}` });
    }

    // 4b) Ensure index.ts exists (fallback re-exports)
    const indexPath = path.join(absPath, "index.ts");
    if (!fs.existsSync(indexPath)) {
      const indexContent = `
// Auto-generated fallback index.ts
// Re-export common generated modules so the snippet runner can "import * as sdk from ..."
export * from "./apis";
export * from "./models";
export * from "./client";
`.trimStart();
      fs.writeFileSync(indexPath, indexContent, "utf8");
      req.log.info("index.ts was missing, created a fallback one with exports.");
    }

    req.log.info(
      { outDir: absPath, entry: indexPath },
      "SDK generated and registered",
    );

    // Invalidate discovery cache so the next /run sees this SDK
    invalidateExternalSDKCache();

    return reply.send({
      ok: true,
      sdk: {
        namespace: namespace,
        location: absPath,
        entry: `file://${indexPath}`,
      },
      message:
        "SDK generated and will be auto-loaded on /run under sdk.<namespace>",
    });
  });

  return app;
}

// -----------------------------
// Start server (main)
// -----------------------------
const port = Number(process.env.PORT ?? 3000);
const app = await createServer();
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
