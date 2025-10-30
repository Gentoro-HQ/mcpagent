/**
 * MCP Agent service manager
 */
import { join } from 'path';
import { homedir } from 'os';
import { processManager, ProcessConfig } from './process-manager.js';
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
   * Initialize service definitions
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Get configuration
    const config = await configManager.getGlobalConfig();
    const port = config?.defaultPort || 8080;

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
    // Try to find the TypeScript runtime in the project structure
    const projectRoot = process.cwd().includes('/cli') 
      ? join(process.cwd(), '..')
      : process.cwd();
    
    processManager.register({
      name: 'ts-runtime',
      command: 'node',
      args: [join(projectRoot, 'src/typescript-runtime/dist/server.js')],
      env: {
        PORT: '7070',
        NODE_ENV: 'production',
      },
      cwd: join(projectRoot, 'src/typescript-runtime'),
      port: 7070,
      healthCheckUrl: 'http://localhost:7070/health',
      dependsOn: [],
    });

    // Register MCP Agent (Java application)
    processManager.register({
      name: 'app',
      command: 'java',
      args: [
        '-jar',
        join(projectRoot, 'src/mcpagent/target/mcpagent-0.1.0-SNAPSHOT.jar'),
      ],
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
    processManager.register({
      name: 'mock',
      command: 'java',
      args: [
        '-jar',
        join(projectRoot, 'src/acme-analytics-server/server/target/acme-analytics-server-1.0.0.jar'),
        '8082',
      ],
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

    // Update environment for processes if options provided
    if (options.port || options.handbookDir || options.provider || options.apiKey) {
      await this.updateProcessEnvironments(options);
    }

    const disabledServices = options.disableServices || [];

    // Start services in order
    if (!disabledServices.includes('otel')) {
      console.log('Starting OpenTelemetry Collector...');
      try {
        await processManager.start('otel');
        console.log('  ✓ OTEL Collector started');
      } catch (error: any) {
        console.log('  ⚠ OTEL Collector not available (optional) - skipping');
      }
    }

    console.log('Starting TypeScript Runtime...');
    if (!disabledServices.includes('ts-runtime')) {
      await processManager.start('ts-runtime');
    }

    console.log('Starting MCP Agent...');
    if (!disabledServices.includes('app')) {
      await processManager.start('app');
    }

    if (options.mockMode) {
      console.log('Starting Mock Server (ACME Analytics)...');
      if (!disabledServices.includes('mock')) {
        await processManager.start('mock');
      }
    }

    console.log('All services started successfully!');
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
    
    console.log('Building MCP Agent...');
    
    // Build Java application
    console.log('Building Java application...');
    await execa('mvn', ['clean', 'package', '-DskipTests'], {
      cwd: join(process.cwd(), '../src/mcpagent'),
      stdio: 'inherit',
    });

    // Build TypeScript runtime
    console.log('Building TypeScript runtime...');
    await execa('npm', ['run', 'build'], {
      cwd: join(process.cwd(), '../src/typescript-runtime'),
      stdio: 'inherit',
    });

    // Build Mock server
    console.log('Building Mock server...');
    await execa('mvn', ['clean', 'package', '-DskipTests'], {
      cwd: join(process.cwd(), '../src/acme-analytics-server/server'),
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
}

export const agentService = new AgentService();

