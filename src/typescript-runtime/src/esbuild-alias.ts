import type { Plugin } from "esbuild";

/**
 * Create a tiny esbuild plugin that aliases exact module specifiers to new paths.
 *
 * Example:
 *   createAliasPlugin({ axios: path.resolve("src/shims/axios.ts") })
 * will rewrite `import axios from "axios"` to the provided shim path during bundling.
 *
 * Notes
 * - Matches are exact: only bare `from` values are replaced (no partials).
 * - Uses a safely escaped RegExp to avoid accidental special-char behavior.
 */
export type AliasMap = Record<string, string>;

function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createAliasPlugin(map: AliasMap): Plugin {
  return {
    name: "alias",
    setup(build) {
      for (const [from, to] of Object.entries(map)) {
        const filter = new RegExp(`^${escapeRegexLiteral(from)}$`);
        build.onResolve({ filter }, () => ({ path: to }));
      }
    },
  };
}

/**
 * @deprecated Use createAliasPlugin instead.
 * Backward-compatible alias retained temporarily for callers not yet migrated.
 */
export const alias = createAliasPlugin;
