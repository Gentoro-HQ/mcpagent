/**
 * MCP Agent service manager
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';
import { processManager } from './process-manager.js';
import { configManager } from '../config/manager.js';
import { paths } from '../config/paths.js';
import { AgentStatus } from '../types.js';
import fs from 'fs-extra';

export interface StartOptions {
  port?: number;
  handbookDir?: string;
  mockMode?: boolean;
  provider?: string;
  apiKey?: string;
  disableServices?: string[];
}

export class AgentService {
  private initialized = false;

  /**
   * Find the project root directory
   */
  private findProjectRoot(): string {
    // Check if MCPAGENT_ROOT environment variable is set
    if (process.env.MCPAGENT_ROOT) {
      return process.env.MCPAGENT_ROOT;
    }

    // Try to find project root by looking for known markers
    const cwd = process.cwd();
    const possibleRoots = [
      cwd, // Current directory (when running from repo root)
      join(cwd, '..'), // Parent directory (if running from cli/)
      join(homedir(), '.onemcp-src'), // Install script location
    ];

    // Add installed path derived from this module location (works for install.sh)
    try {
      const thisFile = fileURLToPath(import.meta.url); // .../cli/dist/services/agent-service.js
      const servicesDir = dirname(thisFile); // .../cli/dist/services
      const distDir = dirname(servicesDir);  // .../cli/dist
      const cliDir = dirname(distDir);       // .../cli
      const repoRoot = dirname(cliDir);      // ... (project root)
      possibleRoots.push(repoRoot);
    } catch {
      // ignore if import.meta.url is unavailable
    }

    // Also check MCPAGENT_SRC if it's set (for development)
    if (process.env.MCPAGENT_SRC) {
      possibleRoots.unshift(process.env.MCPAGENT_SRC);
    }

    for (const root of possibleRoots) {
      const tsRuntimePath = join(root, 'src/typescript-runtime/dist/server.js');
      const mcpAgentPath = join(root, 'src/mcpagent/target/mcpagent-0.1.0-SNAPSHOT.jar');
      
      if (fs.existsSync(tsRuntimePath) && fs.existsSync(mcpAgentPath)) {
        return root;
      }
    }

    throw new Error(
      'Could not find MCP Agent installation. Please ensure you are running from the project directory or set MCPAGENT_ROOT environment variable.'
    );
  }

  /**
   * Initialize service definitions
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Get configuration
    const config = await configManager.getGlobalConfig();
    const port = config?.defaultPort || 8080;

    // Find project root
    const projectRoot = this.findProjectRoot();

    // Register OpenTelemetry Collector
    processManager.register({
      name: 'otel',
      command: 'otelcol',
      args: ['--config', '/tmp/mcpagent-otel-config.yaml'],
      env: {
        OTEL_SERVICE_NAME: 'mcpagent',
      },
      port: 4317,
      healthCheckUrl: undefined, // OTEL doesn't have a simple health endpoint
    });

    // Register TypeScript Runtime
    const tsRuntimeServer = join(projectRoot, 'src/typescript-runtime/dist/server.js');
    const tsRuntimeDir = join(projectRoot, 'src/typescript-runtime');
    
    processManager.register({
      name: 'ts-runtime',
      command: 'node',
      args: [tsRuntimeServer],
      env: {
        PORT: '7070',
        NODE_ENV: 'production',
      },
      cwd: tsRuntimeDir,
      port: 7070,
      healthCheckUrl: 'http://localhost:7070/health',
      dependsOn: [],
    });

    // Register MCP Agent (Java application)
    const mcpAgentJar = join(projectRoot, 'src/mcpagent/target/mcpagent-0.1.0-SNAPSHOT.jar');
    
    processManager.register({
      name: 'app',
      command: 'java',
      args: ['-jar', mcpAgentJar],
      env: {
        SERVER_PORT: port.toString(),
        FOUNDATION_DIR: config?.handbookDir || paths.handbooksDir,
        OPENAI_API_KEY: config?.provider === 'openai' ? config.apiKey : '',
        GEMINI_API_KEY: config?.provider === 'gemini' ? config.apiKey : '',
        ANTHROPIC_API_KEY: config?.provider === 'anthropic' ? config.apiKey : '',
        INFERENCE_DEFAULT_PROVIDER: config?.provider || 'openai',
        TS_RUNTIME_URL: 'http://localhost:7070',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
      },
      port,
      healthCheckUrl: `http://localhost:${port}/mcp`,
      dependsOn: ['ts-runtime'],
    });

    // Register Mock Server (ACME Analytics)
    const mockServerJar = join(projectRoot, 'src/acme-analytics-server/server/target/acme-analytics-server-1.0.0.jar');
    
    processManager.register({
      name: 'mock',
      command: 'java',
      args: ['-jar', mockServerJar, '8082'],
      port: 8082,
      healthCheckUrl: 'http://localhost:8082/health',
    });

    this.initialized = true;
  }

  /**
   * Start the MCP Agent with all required services
   */
  async start(options: StartOptions = {}): Promise<void> {
    await this.initialize();

    const config = await configManager.getGlobalConfig();
    if (!config && !options.mockMode) {
      throw new Error('No configuration found. Please run setup first or use --mock flag.');
    }

    // Validate environment before starting
    const validation = await this.validateEnvironment();
    if (!validation.valid) {
      const missingList = validation.missing.join(', ');
      throw new Error(
        `Missing required dependencies: ${missingList}\n` +
        'Please install the required dependencies:\n' +
        '  - Java 21+: https://adoptium.net/\n' +
        '  - Node.js 20+: https://nodejs.org/\n' +
        '  - Maven: https://maven.apache.org/install.html\n' +
        'Then run "onemcp doctor" to verify your installation.'
      );
    }

    // Update environment for processes if options provided
    if (options.port || options.handbookDir || options.provider || options.apiKey) {
      await this.updateProcessEnvironments(options);
    }

    const disabledServices = options.disableServices || [];

    // Start services in order
    if (!disabledServices.includes('otel')) {
      console.log(chalk.dim('  • Starting OpenTelemetry Collector for observability...'));
      try {
        await processManager.start('otel');
        // Wait a bit for the process to either start or fail
        await new Promise(resolve => setTimeout(resolve, 500));
        // Check if the service is actually running
        if (await processManager.isRunning('otel')) {
          console.log(chalk.dim('    ✓ OTEL Collector ready'));
        } else {
          console.log(chalk.dim('    ⚠ OTEL Collector not available (optional) - continuing without'));
        }
      } catch (error: any) {
        console.log(chalk.dim('    ⚠ OTEL Collector not available (optional) - continuing without'));
      }
    }

    console.log(chalk.dim('  • Starting TypeScript Runtime for tool execution...'));
    if (!disabledServices.includes('ts-runtime')) {
      await processManager.start('ts-runtime');
      console.log(chalk.dim('    ✓ TypeScript Runtime ready'));
    }

    console.log(chalk.dim('  • Starting MCP Agent core service...'));
    if (!disabledServices.includes('app')) {
      await processManager.start('app');
      console.log(chalk.dim('    ✓ MCP Agent ready'));
    }

    if (options.mockMode) {
      console.log(chalk.dim('  • Starting ACME Analytics mock server for testing...'));
      if (!disabledServices.includes('mock')) {
        await processManager.start('mock');
        console.log(chalk.dim('    ✓ Mock server ready'));
      }
    }

    console.log(chalk.dim('  • All services started successfully!'));
  }

  /**
   * Stop all MCP Agent services
   */
  async stop(): Promise<void> {
    await processManager.stopAll();
  }

  /**
   * Get status of all services
   */
  async getStatus(): Promise<AgentStatus> {
    await this.initialize();

    const services = await processManager.getAllStatus();
    const config = await configManager.getGlobalConfig();
    const appRunning = services.find((s) => s.name === 'app')?.running || false;

    const port = config?.defaultPort || 8080;

    return {
      running: appRunning,
      services,
      mcpUrl: appRunning ? `http://localhost:${port}/mcp` : undefined,
      handbookDir: config?.handbookDir,
    };
  }

  /**
   * Restart a specific service or all services
   */
  async restart(serviceName?: string): Promise<void> {
    await this.initialize();

    if (serviceName) {
      console.log(`Restarting ${serviceName}...`);
      await processManager.stop(serviceName);
      await processManager.start(serviceName);
    } else {
      console.log('Restarting all services...');
      await this.stop();
      await this.start();
    }
  }

  /**
   * Get logs for a service
   */
  async getLogs(serviceName: string, lines = 50): Promise<string> {
    return processManager.getLogs(serviceName, lines);
  }

  /**
   * Update process environments based on options
   */
  private async updateProcessEnvironments(options: StartOptions): Promise<void> {
    // This would update the registered process configs with new environment variables
    // For now, we'll need to re-register with updated configs
    if (options.port) {
      const appConfig = processManager['configs'].get('app');
      if (appConfig) {
        appConfig.env = {
          ...appConfig.env,
          SERVER_PORT: options.port.toString(),
        };
        appConfig.port = options.port;
        appConfig.healthCheckUrl = `http://localhost:${options.port}/actuator/health`;
      }
    }

    if (options.handbookDir) {
      const appConfig = processManager['configs'].get('app');
      if (appConfig) {
        appConfig.env = {
          ...appConfig.env,
          FOUNDATION_DIR: options.handbookDir,
        };
      }
    }

    if (options.provider && options.apiKey) {
      const appConfig = processManager['configs'].get('app');
      if (appConfig) {
        const keyEnvVar =
          options.provider === 'openai'
            ? 'OPENAI_API_KEY'
            : options.provider === 'gemini'
            ? 'GEMINI_API_KEY'
            : 'ANTHROPIC_API_KEY';

        appConfig.env = {
          ...appConfig.env,
          [keyEnvVar]: options.apiKey,
          INFERENCE_DEFAULT_PROVIDER: options.provider,
        };
      }
    }
  }

  /**
   * Validate that required binaries are available
   */
  async validateEnvironment(): Promise<{ valid: boolean; missing: string[] }> {
    const required = ['java', 'node', 'mvn'];
    const missing: string[] = [];

    for (const binary of required) {
      try {
        const { execa } = await import('execa');
        await execa(binary, ['--version'], { timeout: 5000 });
      } catch {
        missing.push(binary);
      }
    }

    // Check for optional otelcol
    try {
      const { execa } = await import('execa');
      await execa('otelcol', ['--version'], { timeout: 5000 });
    } catch {
      console.warn('OpenTelemetry Collector not found (optional)');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Build the project if needed
   */
  async buildProject(): Promise<void> {
    const { execa } = await import('execa');
    const projectRoot = this.findProjectRoot();
    
    console.log('Building MCP Agent...');
    
    // Build Java application
    console.log('Building Java application...');
    await execa('mvn', ['clean', 'package', '-DskipTests'], {
      cwd: join(projectRoot, 'src/mcpagent'),
      stdio: 'inherit',
    });

    // Build TypeScript runtime
    console.log('Building TypeScript runtime...');
    await execa('npm', ['run', 'build'], {
      cwd: join(projectRoot, 'src/typescript-runtime'),
      stdio: 'inherit',
    });

    // Build Mock server
    console.log('Building Mock server...');
    await execa('mvn', ['clean', 'package', '-DskipTests'], {
      cwd: join(projectRoot, 'src/acme-analytics-server/server'),
      stdio: 'inherit',
    });

    console.log('Build completed successfully!');
  }

  /**
   * Create default OTEL config if it doesn't exist
   */
  async ensureOtelConfig(): Promise<void> {
    const otelConfigPath = '/tmp/mcpagent-otel-config.yaml';
    
    if (await fs.pathExists(otelConfigPath)) {
      return;
    }

    const defaultConfig = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  file:
    path: ${paths.logDir}/otel-collector.json
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file, logging]
    metrics:
      receivers: [otlp]
      exporters: [file, logging]
    logs:
      receivers: [otlp]
      exporters: [file, logging]
`;

    await fs.writeFile(otelConfigPath, defaultConfig, 'utf-8');
  }

  /**
   * Get current version/commit hash
   */
  async getCurrentVersion(): Promise<string | null> {
    try {
      const projectRoot = this.findProjectRoot();
      const { execa } = await import('execa');
      const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Update repository to latest version
   */
  async updateRepository(): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const { execa } = await import('execa');

    // Fetch latest changes
    await execa('git', ['fetch', 'origin'], { cwd: projectRoot });

    // Reset to remote main branch
    await execa('git', ['reset', '--hard', 'origin/main'], { cwd: projectRoot });
  }

  /**
   * Rebuild all components
   */
  async rebuildAll(): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const { execa } = await import('execa');

    // Build Java app
    await execa('mvn', ['clean', 'package', 'spring-boot:repackage', '-DskipTests', '-q'], {
      cwd: join(projectRoot, 'src/mcpagent')
    });

    // Build TypeScript runtime
    await execa('npm', ['run', 'build'], {
      cwd: join(projectRoot, 'src/typescript-runtime')
    });

    // Build mock server (optional)
    try {
      await execa('mvn', ['clean', 'package', '-DskipTests', '-q'], {
        cwd: join(projectRoot, 'src/acme-analytics-server/server')
      });
    } catch {
      // Mock server build is optional, ignore errors
    }

    // Build CLI
    await execa('npm', ['run', 'build'], {
      cwd: join(projectRoot, 'cli')
    });
  }

  /**
   * Update CLI symlink
   */
  async updateCliSymlink(): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const cliDistPath = join(projectRoot, 'cli/dist/index.js');
    const symlinkPath = join(homedir(), '.local/bin/onemcp');

    // Ensure directory exists
    await fs.ensureDir(dirname(symlinkPath));

    // Remove existing symlink if it exists
    try {
      await fs.unlink(symlinkPath);
    } catch {
      // Ignore if symlink doesn't exist
    }

    // Create new symlink
    await fs.symlink(cliDistPath, symlinkPath);
    await fs.chmod(cliDistPath, 0o755);
  }
}

export const agentService = new AgentService();

