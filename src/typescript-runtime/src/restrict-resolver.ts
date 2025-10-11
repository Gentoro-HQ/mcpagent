import path from "node:path";
import type { Plugin } from "esbuild";

/**
 * Esbuild resolver guard that restricts relative/absolute imports to a set of allowed roots.
 *
 * Why: When bundling untrusted snippet code, we only want to allow imports that resolve
 * under specific directories (e.g., generated SDKs). This plugin blocks path traversal
 * outside those roots. Bare imports (e.g., "lodash") are allowed by default.
 */
export type RestrictResolverOptions = {
  /** Absolute or relative root directories that imports must reside in. */
  roots: string[];
  /**
   * Whether to allow bare specifiers (packages in node_modules). Defaults to true.
   * Set false to block bare imports as well (they will emit an error).
   */
  allowBare?: boolean;
};

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  // inside if relative path does not traverse up and is not an absolute drive
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function normalizeRoots(cwd: string, roots: string[]): string[] {
  return roots.map((r) => path.resolve(cwd, r));
}

export function createRestrictResolver(optionsOrRoots: RestrictResolverOptions | string[]): Plugin {
  const opts: RestrictResolverOptions = Array.isArray(optionsOrRoots)
    ? { roots: optionsOrRoots, allowBare: true }
    : { allowBare: true, ...optionsOrRoots };

  return {
    name: "restrict-resolver",
    setup(build) {
      const rootsAbs = normalizeRoots(process.cwd(), opts.roots);

      build.onResolve({ filter: /.*/ }, (args) => {
        const spec = args.path;

        // Handle bare specifiers
        const isBare = !spec.startsWith(".") && !path.isAbsolute(spec);
        if (isBare) {
          if (opts.allowBare !== false) return; // let esbuild resolve normally
          return {
            errors: [{ text: `Bare import is not allowed by policy: ${spec}` }],
          };
        }

        const resolved = path.resolve(args.resolveDir, spec);
        const allowed = rootsAbs.some((r) => isWithin(r, resolved));
        if (!allowed) {
          return {
            errors: [
              {
                text: `Import blocked outside allowed roots: ${spec}`,
                location: { file: args.importer, line: 0, column: 0 },
              },
            ],
          } as any;
        }
        return { path: resolved };
      });
    },
  };
}

/**
 * @deprecated Use createRestrictResolver instead.
 */
export const restrictResolver = createRestrictResolver;
