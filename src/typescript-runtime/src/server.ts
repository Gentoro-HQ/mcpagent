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
import {runOpenApiGenerator, runShell} from "./lib/openapi-gen.js";
import { runSnippetTS } from "./runner.js";
import { EXTERNAL_SDKS_ROOT } from "./config.js";
import { invalidateExternalSDKCache } from "./sdk-registry.js";
import { createUniqueSdkFolder } from "./names.js";
import { getNumber } from "./env.js";
import {cleanExternalSDKsRoot} from "./startup.js";

function readAllMarkdownFiles(dir: string, baseDir: string) {
    const out: Array<{ path: string; markdown: string }> = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...readAllMarkdownFiles(full, baseDir));
        else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
            out.push({
                path: path.relative(baseDir, full).replaceAll(path.sep, "/"),
                markdown: fs.readFileSync(full, "utf8")
            });
        }
    }
    return out;
}

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

    if (result.ok) {
        return { ok: true, value: result.value, logs: result.logs };
    } else {
        return reply
            .code(400)
            .send({ ok: false, error: result.error, logs: result.logs });
    }
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

    const cleanup = body?.cleanup?.value === "true";
    if( cleanup ) {
        cleanExternalSDKsRoot();
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

      // 4) Generate the client into absPath (Axios plugin replaces httpClient: "axios")
      // --- OpenAPI Generator: generate typescript-axios client ---
      // Docs for generator + options: https://openapi-generator.tech/docs/generators/typescript-axios/
      try {
          const args = [
              "-i", tmpSpecPath,
              "-g", "typescript-axios",
              "-o", absPath,
              // a few useful flags; add/remove as you prefer
              "--additional-properties",
              [
                  "supportsES6=true",
                  "apiPackage=apis",
                  "modelPackage=models",
                  "useTags=true",
                  "useOperationId=true",
                  "useSingleRequestParameter=true"
              ].join(",")
          ];
          const { stdout, stderr } = await runOpenApiGenerator(args);
          req.log.info({ stdout, stderr }, "openapi-generator: typescript-axios");
      } catch (e: any) {
          req.log.error(e, "openapi-generator failed (typescript-axios)");
          return reply.code(400).send({ ok: false, error: `Codegen failed: ${String(e?.message ?? e)}` });
      }

      await fs.promises.writeFile(path.join(absPath, "typedoc.json"), JSON.stringify({
          entryPoints: ["./index.ts"],
          out: "typedoc",
          excludeExternals: true,
          excludePrivate: true,
          excludeProtected: true
      }, null, 2));

      await fs.promises.writeFile(path.join(absPath, "tsconfig.docs.json"), JSON.stringify({
          compilerOptions: {
              moduleResolution: "node",
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              skipLibCheck: true,
              types: ["node"],
              lib: ["ES2020", "DOM"]
          },
          include: ["./**/*.ts", "types/**/*.d.ts"]
      }, null, 2));

      const shellContent = `
        set -Eeuo pipefail
        trap 'code=$?; echo "::ERROR:: step failed (exit $code) at line $LINENO"; exit $code' ERR
        set -x

        cd ${absPath}
        echo "entered ${absPath}"

        npm i axios@latest
        npm i @types/node typedoc typedoc-plugin-markdown typescript @types/axios
        echo "executed npm install"


        npx typedoc --plugin typedoc-plugin-markdown --tsconfig tsconfig.docs.json --entryPoints ./index.ts --out ./typedoc
        echo "executed npm typedoc"

        echo "listing content"
        ls -al typedoc
      `;
      const { stdout, stderr } = await runShell(shellContent);
      req.log.info({ stdout, stderr }, "doctype: typescript-axios");

      // Optional: fallback index.ts for easy imports (OAG’s output uses Api+Model files)
      const indexPath = path.join(absPath, "index.ts");
      if (!fs.existsSync(indexPath)) {
          const indexContent = `
// Auto-generated fallback index.ts (OpenAPI Generator)
// Re-export everything so consumers can do: import * as sdk from "<namespace>"
export * from "./api";
export * from "./configuration";
`.trimStart();
          fs.writeFileSync(indexPath, indexContent, "utf8");
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

    app.get("/sdk/docs/:namespace", async (req, reply) => {
        const namespace = (req.params as any)?.namespace;
        if (!namespace) return reply.code(400).send({ ok: false, error: "Missing :namespace" });

        const absPath = path.resolve(EXTERNAL_SDKS_ROOT, namespace);
        if (!fs.existsSync(absPath)) {
            return reply.code(404).send({ ok: false, error: `Unknown namespace: ${namespace}` });
        }

        const docsDir = path.join(absPath, "typedoc");
        const files = readAllMarkdownFiles(docsDir, docsDir);
        return reply.send({ ok: true, namespace, count: files.length, files, diskLocation: docsDir });

    });

  // Add health check endpoint
  app.get("/health", async (request, reply) => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
}

// -----------------------------
// Start server (main)
// -----------------------------
const port = getNumber("PORT", 7070)!;
const app = await createServer();
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
