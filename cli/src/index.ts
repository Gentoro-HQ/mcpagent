#!/usr/bin/env node

/**
 * One MCP CLI - Main entry point
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import logSymbols from 'log-symbols';
import { setupWizard, SetupWizard } from './wizard/setup.js';
import { configManager } from './config/manager.js';
import { agentService } from './services/agent-service.js';
import { processManager } from './services/process-manager.js';
import { chatMode } from './chat/chat-mode.js';
import { handbookManager } from './handbook/manager.js';
import { paths } from './config/paths.js';
import inquirer from 'inquirer';
import fs from 'fs-extra';

const program = new Command();

program
  .name('onemcp')
  .description('CLI for Gentoro One MCP - Connect APIs to AI models')
  .version('0.1.0');

/**
 * Main command - default behavior
 */
program
  .action(async () => {
    // Check if setup is needed
    if (await SetupWizard.isSetupNeeded()) {
      console.log(chalk.yellow('No configuration found. Running setup wizard...'));
      console.log();
      await setupWizard.run();
    } else {
      // Show status
      await showStatus();
    }
  });


/**
 * Stop command
 */
program
  .command('stop')
  .description('Stop the One MCP')
  .action(async () => {
    const spinner = ora('Stopping One MCP...').start();

    try {
      await agentService.stop();
      spinner.succeed('One MCP stopped successfully');
    } catch (error: any) {
      spinner.fail('Failed to stop One MCP');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * Status command
 */
program
  .command('status')
  .description('Show One MCP status')
  .action(async () => {
    await showStatus();
  });

/**
 * Chat command
 */
program
  .command('chat')
  .description('Open interactive chat mode')
  .action(async () => {
    try {
      // Check if setup is needed
      if (await SetupWizard.isSetupNeeded()) {
        console.log(chalk.yellow('No configuration found. Running setup wizard...'));
        console.log();
        await setupWizard.run();
      }

      // Check if agent is running
      const agentStatus = await agentService.getStatus();
      if (!agentStatus.running) {
        console.log(chalk.dim('Starting One MCP services...'));
        console.log();

        // Ensure OTEL config
        await agentService.ensureOtelConfig();

        // Determine if we should start in mock mode
        const config = await configManager.getGlobalConfig();
        const mockMode = !config?.handbookDir || config.handbookDir.includes('acme-analytics');

        const startOptions = {
          mockMode,
        };

        // Start services with logging
        console.log(chalk.dim('🔄 Starting services...'));

        try {
          await agentService.start(startOptions);
          console.log(chalk.dim('✅ Services started successfully'));
          console.log();
        } catch (error: any) {
          console.error(chalk.red('❌ Failed to start services:'), error.message);
          console.log();
          console.log(chalk.yellow('Try running "onemcp doctor" to check your environment'));
          process.exit(1);
        }
      } else {
        // Agent is running, but check if we need to start mock server
        const config = await configManager.getGlobalConfig();
        const shouldHaveMock = !config?.handbookDir || config.handbookDir.includes('acme-analytics');
        const mockService = agentStatus.services.find(s => s.name === 'mock');

        if (shouldHaveMock && mockService && !mockService.running) {
          console.log(chalk.dim('Starting mock server for testing...'));
          try {
            await processManager.start('mock');
            console.log(chalk.dim('✅ Mock server started successfully'));
            console.log();
          } catch (error: any) {
            console.log(chalk.dim('⚠ Mock server not available (optional) - continuing without'));
            console.log();
          }
        }
      }

      // Start chat mode
      await chatMode.start();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Logs command
 */
program
  .command('logs')
  .description('Show logs')
  .argument('[service]', 'Service name (app, ts-runtime, otel, mock)')
  .option('-n, --lines <count>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action(async (service, options) => {
    try {
      const lines = parseInt(options.lines);

      if (service) {
        const logs = await agentService.getLogs(service, lines);
        console.log(logs);
      } else {
        // Show all logs
        const services = ['app', 'ts-runtime', 'otel', 'mock'];
        for (const svc of services) {
          console.log(chalk.bold.cyan(`\n=== ${svc} ===\n`));
          const logs = await agentService.getLogs(svc, lines);
          console.log(logs);
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Service commands
 */
const serviceCmd = program
  .command('service')
  .description('Manage service configurations');

serviceCmd
  .command('auth <service-name>')
  .description('Configure service authentication')
  .action(async (serviceName) => {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Service base URL:',
          validate: (input: string) => {
            if (!input) return 'Base URL is required';
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          },
        },
        {
          type: 'input',
          name: 'header',
          message: 'Header name:',
          default: 'Authorization',
        },
        {
          type: 'input',
          name: 'pattern',
          message: 'Pattern:',
          default: 'Bearer {token}',
        },
        {
          type: 'password',
          name: 'token',
          message: 'Access token:',
        },
      ]);

      await configManager.saveServiceConfig(serviceName, {
        service: serviceName,
        ...answers,
      });

      console.log(chalk.green(`✅  Service ${serviceName} configured successfully`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

serviceCmd
  .command('renew <service-name>')
  .description('Renew service token')
  .action(async (serviceName) => {
    try {
      const config = await configManager.loadServiceConfig(serviceName);
      if (!config) {
        console.log(chalk.red(`Service ${serviceName} not found`));
        return;
      }

      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: `Enter new token for ${serviceName}:`,
        },
      ]);

      config.token = token;
      config.expiresAt = undefined;

      await configManager.saveServiceConfig(serviceName, config);
      console.log(chalk.green(`✅  Token renewed for ${serviceName}`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

serviceCmd
  .command('list')
  .description('List configured services')
  .action(async () => {
    try {
      const services = await configManager.listServices();

      if (services.length === 0) {
        console.log(chalk.yellow('No services configured'));
        return;
      }

      console.log(chalk.bold.cyan('📋 Configured Services:'));
      console.log();

      for (const service of services) {
        const config = await configManager.loadServiceConfig(service);
        console.log(chalk.cyan(`  ${service}`));
        if (config) {
          console.log(chalk.dim(`    Base URL: ${config.baseUrl || 'N/A'}`));
          console.log(chalk.dim(`    Header: ${config.header}`));
          console.log(chalk.dim(`    Pattern: ${config.pattern}`));
        }
        console.log();
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Handbook commands
 */
const handbookCmd = program
  .command('handbook')
  .description('Manage handbook directories');

handbookCmd
  .command('init <name>')
  .description('Initialize a new handbook')
  .option('-d, --dir <directory>', 'Target directory')
  .action(async (name, options) => {
    try {
      const dir = await handbookManager.init(name, options.dir);
      console.log();
      console.log(chalk.bold('Next steps:'));
      console.log(chalk.cyan(`  1. Add OpenAPI specs to ${dir}/apis/`));
      console.log(chalk.cyan(`  2. Add documentation to ${dir}/docs/`));
      console.log(chalk.cyan(`  3. Update ${dir}/Agent.md`));
      console.log(chalk.cyan(`  4. Set as default: onemcp config set handbookDir ${dir}`));
      console.log(chalk.cyan(`  5. Start chatting: onemcp chat`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

handbookCmd
  .command('validate [directory]')
  .description('Validate handbook structure')
  .action(async (directory) => {
    try {
      const dir = directory || (await configManager.getGlobalConfig())?.handbookDir;
      if (!dir) {
        console.log(chalk.red('No handbook directory specified'));
        return;
      }

      const spinner = ora('Validating handbook...').start();
      const result = await handbookManager.validate(dir);

      if (result.valid) {
        spinner.succeed('Handbook is valid');
      } else {
        spinner.fail('Handbook validation failed');
      }

      if (result.errors.length > 0) {
        console.log();
        console.log(chalk.red.bold('Errors:'));
        result.errors.forEach((err) => console.log(chalk.red(`  ${logSymbols.error} ${err}`)));
      }

      if (result.warnings.length > 0) {
        console.log();
        console.log(chalk.yellow.bold('Warnings:'));
        result.warnings.forEach((warn) =>
          console.log(chalk.yellow(`  ${logSymbols.warning} ${warn}`))
        );
      }

      if (result.valid && result.warnings.length === 0) {
        console.log();
        console.log(chalk.green('✅  Handbook is ready to use!'));
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

handbookCmd
  .command('list')
  .description('List all handbooks')
  .action(async () => {
    try {
      const handbooks = await handbookManager.list();

      if (handbooks.length === 0) {
        console.log(chalk.yellow('No handbooks found'));
        console.log(chalk.dim('Create one with: onemcp handbook init <name>'));
        return;
      }

      console.log(chalk.bold.cyan('📚 Available Handbooks:'));
      console.log();

      for (const handbook of handbooks) {
        const status = handbook.valid ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${chalk.cyan(handbook.name)}`);
        console.log(chalk.dim(`    ${handbook.path}`));
        console.log();
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Provider commands
 */
const providerCmd = program
  .command('provider')
  .description('Manage model provider settings');

providerCmd
  .command('set')
  .description('Set model provider')
  .action(async () => {
    try {
      const { provider, apiKey } = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select provider:',
          choices: [
            { name: 'OpenAI', value: 'openai' },
            { name: 'Google Gemini', value: 'gemini' },
            { name: 'Anthropic Claude', value: 'anthropic' },
          ],
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter API key:',
        },
      ]);

      await configManager.updateGlobalConfig({ provider, apiKey });
      console.log(chalk.green(`✅  Provider set to ${provider}`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

providerCmd
  .command('switch')
  .description('Switch between configured providers')
  .action(async () => {
    try {
      const config = await configManager.getGlobalConfig();
      if (!config) {
        console.log(chalk.red('No configuration found'));
        return;
      }

      const { provider } = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select provider:',
          choices: [
            { name: 'OpenAI', value: 'openai' },
            { name: 'Google Gemini', value: 'gemini' },
            { name: 'Anthropic Claude', value: 'anthropic' },
          ],
          default: config.provider,
        },
      ]);

      await configManager.updateGlobalConfig({ provider });
      console.log(chalk.green(`✅  Switched to ${provider}`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Update command
 */
program
  .command('update')
  .description('Update One MCP to the latest version')
  .action(async () => {
    const spinner = ora('Checking for updates...').start();

    try {
      // Check if we have a local installation
      if (!paths.configRoot || !fs.existsSync(paths.configRoot)) {
        spinner.fail('No One MCP installation found');
        console.log(chalk.yellow('Please install One MCP first:'));
        console.log(chalk.cyan('curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/onemcp/main/cli/install.sh | bash'));
        return;
      }

      // Check current version/commit
      const currentCommit = await agentService.getCurrentVersion();

      spinner.text = 'Fetching latest updates...';

      // Update the repository
      await agentService.updateRepository();

      // Rebuild components
      spinner.text = 'Rebuilding components...';
      await agentService.rebuildAll();

      // Update CLI symlink
      spinner.text = 'Updating CLI...';
      await agentService.updateCliSymlink();

      const newCommit = await agentService.getCurrentVersion();

      if (currentCommit === newCommit) {
        spinner.succeed('Already up to date!');
        console.log(chalk.dim(`Current version: ${currentCommit?.substring(0, 8) || 'unknown'}`));
      } else {
        spinner.succeed('One MCP updated successfully!');
        console.log(chalk.dim(`Updated: ${currentCommit?.substring(0, 8) || 'unknown'} → ${newCommit?.substring(0, 8) || 'unknown'}`));
      }

      console.log();
      console.log(chalk.green('✅  Update complete!'));

    } catch (error: any) {
      spinner.fail('Update failed');
      console.error(chalk.red('Error:'), error.message);
      console.log();
      console.log(chalk.yellow('Manual update:'));
      console.log(chalk.cyan('curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash'));
      process.exit(1);
    }
  });

/**
 * Doctor command
 */
program
  .command('doctor')
  .description('Check system requirements and configuration')
  .action(async () => {
    console.log(chalk.bold.cyan('🔍 One MCP Doctor\n'));

    const checks = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
    checks.push({
      name: 'Node.js version',
      pass: nodeMajor >= 20,
      message: nodeMajor >= 20 ? `${nodeVersion} ✓` : `${nodeVersion} (need >= 20)`,
    });

    // Check Java
    try {
      const { execa } = await import('execa');
      const { stdout } = await execa('java', ['--version']);
      checks.push({ name: 'Java', pass: true, message: stdout.split('\n')[0] });
    } catch {
      checks.push({ name: 'Java', pass: false, message: 'Not found' });
    }

    // Check Maven
    try {
      const { execa } = await import('execa');
      await execa('mvn', ['--version']);
      checks.push({ name: 'Maven', pass: true, message: 'Installed ✓' });
    } catch {
      checks.push({ name: 'Maven', pass: false, message: 'Not found' });
    }

    // Check configuration
    const hasConfig = await configManager.hasConfiguration();
    checks.push({
      name: 'Configuration',
      pass: hasConfig,
      message: hasConfig ? 'Found ✓' : 'Not configured',
    });

    // Check directories
    const dirsExist = await fs.pathExists(paths.configRoot);
    checks.push({
      name: 'CLI directories',
      pass: dirsExist,
      message: dirsExist ? 'Initialized ✓' : 'Not initialized',
    });

    // Print results
    for (const check of checks) {
      const symbol = check.pass ? logSymbols.success : logSymbols.error;
      const color = check.pass ? chalk.green : chalk.red;
      console.log(`${symbol} ${color(check.name)}: ${check.message}`);
    }

    console.log();

    const allPassed = checks.every((c) => c.pass);
    if (allPassed) {
      console.log(chalk.green.bold('✅  All checks passed!'));
    } else {
      console.log(chalk.red.bold('❌  Some checks failed'));
      console.log();
      console.log(chalk.yellow('Please install missing dependencies:'));
      if (!checks.find((c) => c.name === 'Java')?.pass) {
        console.log(chalk.dim('  - Java 21: https://adoptium.net/'));
      }
      if (!checks.find((c) => c.name === 'Maven')?.pass) {
        console.log(chalk.dim('  - Maven: https://maven.apache.org/install.html'));
      }
      if (!hasConfig) {
        console.log(chalk.dim('  - Run: onemcp (to start setup wizard)'));
      }
    }
  });

/**
 * Version command (already handled by .version())
 */

/**
 * Helper function to show status
 */
async function showStatus(): Promise<void> {
  try {
    const status = await agentService.getStatus();

    console.log();
    console.log(chalk.bold.cyan('📊 One MCP Status\n'));

    if (status.running) {
      console.log(chalk.green('✅  Agent is running'));
      if (status.mcpUrl) {
        console.log(chalk.dim(`   MCP URL: ${status.mcpUrl}`));
      }
    } else {
      console.log(chalk.yellow('⚠️  Agent is not running'));
    }

    console.log();
    console.log(chalk.bold.cyan('Services:'));
    console.log();

    for (const service of status.services) {
      const statusIcon = service.running ? chalk.green('●') : chalk.red('○');
      const healthIcon = service.healthy === undefined ? '' : service.healthy ? '✓' : '✗';

      console.log(`  ${statusIcon} ${chalk.cyan(service.name.padEnd(15))} ${healthIcon}`);

      if (service.running) {
        if (service.port) console.log(chalk.dim(`     Port: ${service.port}`));
        if (service.pid) console.log(chalk.dim(`     PID: ${service.pid}`));
        if (service.uptime) console.log(chalk.dim(`     Uptime: ${service.uptime}`));
      }
    }

    console.log();

    if (status.handbookDir) {
      console.log(chalk.bold.cyan('Configuration:'));
      console.log(chalk.dim(`  Handbook: ${status.handbookDir}`));
      console.log();
    }
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
  }
}

// Parse and execute
program.parse();

