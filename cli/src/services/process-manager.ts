/**
 * Process manager for running MCP Agent services
 */
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import kill from 'tree-kill';
import { paths } from '../config/paths.js';
import { ServiceStatus } from '../types.js';

export interface ProcessConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  port?: number;
  healthCheckUrl?: string;
  healthCheckInterval?: number;
  dependsOn?: string[];
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ChildProcess>();
  private configs = new Map<string, ProcessConfig>();
  private startTimes = new Map<string, Date>();

  constructor() {
    super();
  }

  /**
   * Register a process configuration
   */
  register(config: ProcessConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Start a process
   */
  async start(name: string): Promise<void> {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`Process ${name} not registered`);
    }

    // Check if already running
    if (this.isRunning(name)) {
      throw new Error(`Process ${name} is already running`);
    }

    // Check dependencies
    if (config.dependsOn) {
      for (const dep of config.dependsOn) {
        if (!this.isRunning(dep)) {
          throw new Error(`Dependency ${dep} is not running`);
        }
      }
    }

    // Ensure directories exist
    await paths.ensureDirectories();

    // Prepare environment
    const env = {
      ...process.env,
      ...config.env,
    };

    // Start process
    const proc = spawn(config.command, config.args, {
      env,
      cwd: config.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Setup logging
    const logPath = paths.getLogPath(name);
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);

    // Handle process events
    proc.on('error', (error) => {
      // Don't emit error for optional services
      if (config.name !== 'otel') {
        this.emit('error', { name, error });
      }
      // Clean up for any service
      this.processes.delete(name);
      this.startTimes.delete(name);
      const pidPath = paths.getPidFilePath(name);
      fs.remove(pidPath).catch(() => {});
    });

    proc.on('exit', (code, signal) => {
      this.processes.delete(name);
      this.startTimes.delete(name);
      this.emit('exit', { name, code, signal });
      logStream.end();
    });

    // Store process info
    this.processes.set(name, proc);
    this.startTimes.set(name, new Date());

    // Save PID
    if (proc.pid) {
      const pidPath = paths.getPidFilePath(name);
      await fs.writeFile(pidPath, proc.pid.toString(), 'utf-8');
    }

    this.emit('start', { name, pid: proc.pid });

    // Wait for health check if configured
    if (config.healthCheckUrl) {
      await this.waitForHealthy(config);
    }
  }

  /**
   * Stop a process
   */
  async stop(name: string, force = false): Promise<void> {
    const proc = this.processes.get(name);
    if (!proc || !proc.pid) {
      // Try to clean up PID file anyway
      const pidPath = paths.getPidFilePath(name);
      await fs.remove(pidPath);
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout stopping process ${name}`));
      }, 10000);

      kill(proc.pid!, force ? 'SIGKILL' : 'SIGTERM', (err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          this.processes.delete(name);
          this.startTimes.delete(name);
          
          // Clean up PID file
          const pidPath = paths.getPidFilePath(name);
          fs.remove(pidPath).then(() => resolve()).catch(() => resolve());
        }
      });
    });
  }

  /**
   * Check if a process is running
   */
  isRunning(name: string): boolean {
    const proc = this.processes.get(name);
    return proc !== undefined && proc.pid !== undefined && !proc.killed;
  }

  /**
   * Get process status
   */
  async getStatus(name: string): Promise<ServiceStatus> {
    const config = this.configs.get(name);
    const proc = this.processes.get(name);
    const running = this.isRunning(name);
    const startTime = this.startTimes.get(name);

    let uptime: string | undefined;
    if (running && startTime) {
      const seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      uptime = `${hours}h ${minutes}m ${secs}s`;
    }

    let healthy: boolean | undefined;
    if (running && config?.healthCheckUrl) {
      healthy = await this.checkHealth(config);
    }

    return {
      name,
      running,
      pid: proc?.pid,
      port: config?.port,
      uptime,
      healthy,
    };
  }

  /**
   * Get all process statuses
   */
  async getAllStatus(): Promise<ServiceStatus[]> {
    const statuses: ServiceStatus[] = [];
    for (const name of this.configs.keys()) {
      statuses.push(await this.getStatus(name));
    }
    return statuses;
  }

  /**
   * Stop all processes
   */
  async stopAll(): Promise<void> {
    const names = Array.from(this.processes.keys());
    for (const name of names) {
      try {
        await this.stop(name);
      } catch (error) {
        console.error(`Failed to stop ${name}:`, error);
      }
    }
  }

  /**
   * Check health of a service
   */
  private async checkHealth(config: ProcessConfig): Promise<boolean> {
    if (!config.healthCheckUrl) {
      return true;
    }

    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(config.healthCheckUrl, {
        timeout: 3000,
        validateStatus: () => true, // Accept any status code
        maxRedirects: 0,
      });
      // For MCP endpoints, any response (even empty) means it's alive
      return response.status >= 200 && response.status < 500;
    } catch (error: any) {
      // Connection refused or timeout means not healthy
      return false;
    }
  }

  /**
   * Wait for service to become healthy
   */
  private async waitForHealthy(
    config: ProcessConfig,
    maxAttempts = 60,
    interval = 2000
  ): Promise<void> {
    if (!config.healthCheckUrl) {
      return;
    }

    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkHealth(config)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Service ${config.name} failed to become healthy`);
  }

  /**
   * Get log output for a service
   */
  async getLogs(name: string, lines = 50): Promise<string> {
    const logPath = paths.getLogPath(name);
    
    if (!(await fs.pathExists(logPath))) {
      return 'No logs available';
    }

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      return lastLines.join('\n');
    } catch (error) {
      return `Error reading logs: ${error}`;
    }
  }

  /**
   * Clear logs for a service
   */
  async clearLogs(name: string): Promise<void> {
    const logPath = paths.getLogPath(name);
    if (await fs.pathExists(logPath)) {
      await fs.remove(logPath);
    }
  }

  /**
   * Archive logs
   */
  async archiveLogs(): Promise<void> {
    const archivePath = paths.getLogArchivePath();
    await fs.ensureDir(archivePath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    for (const name of this.configs.keys()) {
      const logPath = paths.getLogPath(name);
      if (await fs.pathExists(logPath)) {
        const archiveName = `${name}-${timestamp}.log`;
        await fs.move(logPath, `${archivePath}/${archiveName}`);
      }
    }
  }
}

export const processManager = new ProcessManager();

