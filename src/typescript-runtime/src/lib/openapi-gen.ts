import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export async function runOpenApiGenerator(args: string[], cwd?: string) {
    // Uses the local node_modules binary
    const bin = process.platform === "win32"
        ? "npx.cmd"
        : "npx";

    const fullArgs = ["@openapitools/openapi-generator-cli", "generate", ...args];
    const { stdout, stderr } = await execFileAsync(bin, fullArgs, { cwd });
    return { stdout, stderr };
}
