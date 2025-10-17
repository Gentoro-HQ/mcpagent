import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { exec as _exec } from "node:child_process";
const exec = promisify(_exec);
export async function runOpenApiGenerator(args: string[], cwd?: string) {
    // Uses the local node_modules binary
    const bin = process.platform === "win32"
        ? "npx.cmd"
        : "npx";

    const fullArgs = ["@openapitools/openapi-generator-cli", "generate", ...args];
    const { stdout, stderr } = await execFileAsync(bin, fullArgs, { cwd });
    return { stdout, stderr };
}

export async function runShell(script: string, cwd?: string) {
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
    try {
        const { stdout, stderr } = await exec(script, {
            cwd,
            shell,                 // ensure a shell exists
            env: process.env,      // inherit PATH so npm/npx are found
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024, // avoid small default buffer
        });
        return { stdout, stderr };
    } catch (err: any) {
        // surface stderr for easier debugging
        return { stdout: err?.stdout ?? "", stderr: err?.stderr ?? String(err) };
    }
}
