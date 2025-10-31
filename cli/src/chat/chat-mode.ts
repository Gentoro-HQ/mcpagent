/**
 * Interactive chat mode for MCP Agent
 */
import inquirer from 'inquirer';
import chalk from 'chalk';
import axios from 'axios';
import { configManager } from '../config/manager.js';
import { agentService } from '../services/agent-service.js';
import { ChatMessage, ModelProvider } from '../types.js';

export class ChatMode {
  private messages: ChatMessage[] = [];
  private mcpUrl: string = '';
  private agentStatus: any = null;

  /**
   * Start interactive chat session
   */
  async start(): Promise<void> {
    // Check if agent is running
    this.agentStatus = await agentService.getStatus();
    if (!this.agentStatus.running) {
      console.log(chalk.red('❌ MCP Agent is not running.'));
      console.log(chalk.yellow('Start the agent first with: mcpagent start'));
      return;
    }

    this.mcpUrl = this.agentStatus.mcpUrl || 'http://localhost:8080/mcp';

    // Get provider info
    const config = await configManager.getGlobalConfig();
    if (!config) {
      console.log(chalk.red('❌ No configuration found.'));
      return;
    }

    console.log();
    console.log(chalk.bold.cyan('╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║    Gentoro MCP Agent - Chat Mode     ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝'));
    console.log();
    console.log(chalk.dim(`Provider: ${config.provider}`));
    console.log(chalk.dim(`MCP URL: ${this.mcpUrl}`));
    console.log(chalk.dim(`Type 'exit' to quit, 'clear' to clear history`));
    console.log(chalk.dim('━'.repeat(60)));
    console.log();

    // Show example queries if mock server is running OR if user has mock mode configured
    const hasMockServer = this.agentStatus.services.some((service: any) => service.name === 'mock' && service.running);
    const hasMockConfigured = await this.isMockModeConfigured();

    if (hasMockServer || hasMockConfigured) {
      this.showMockExamples();
    }

    // Main chat loop
    await this.chatLoop(config.provider);
  }

  /**
   * Main chat interaction loop
   */
  private async chatLoop(provider: ModelProvider): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          validate: (input: string) => {
            if (!input || input.trim() === '') {
              return 'Please enter a message';
            }
            return true;
          },
        },
      ]);

      const userMessage = message.trim();

      // Handle special commands
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        break;
      }

      if (userMessage.toLowerCase() === 'clear') {
        this.messages = [];
        console.log(chalk.yellow('🧹 Chat history cleared.'));
        console.log();
        continue;
      }

      if (userMessage.toLowerCase() === 'help') {
        this.showHelp();
        continue;
      }

      // Add user message to history
      this.messages.push({
        role: 'user',
        content: userMessage,
      });

      // Send to MCP Agent and get response
      try {
        console.log(chalk.dim('\n⏳ Thinking...\n'));
        const response = await this.sendMessage(provider, userMessage);
        
        // Add assistant response to history
        this.messages.push({
          role: 'assistant',
          content: response,
        });

        // Display response
        console.log(chalk.green('Agent:'));
        console.log(response);
        console.log();
      } catch (error: any) {
        console.log(chalk.red('\n❌ Error:'), error.message);
        console.log();
      }
    }
  }

  /**
   * Send message to MCP Agent via the chat API
   */
  private async sendMessage(provider: ModelProvider, userMessage: string): Promise<string> {
    try {
      // Use the simple REST API endpoint instead of MCP
      const chatUrl = this.mcpUrl.replace('/mcp', '/api/chat');
      
      const response = await axios.post(
        chatUrl,
        {
          message: userMessage,
          options: {},
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return response.data.content || 'No response from agent';
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Agent error: ${error.response.status} - ${error.response.statusText}`);
      }
      throw new Error(`Failed to communicate with agent: ${error.message}`);
    }
  }

  /**
   * Check if mock mode is configured (no real services configured)
   */
  private async isMockModeConfigured(): Promise<boolean> {
    try {
      const services = await configManager.listServices();
      // If no services are configured, user likely wants mock mode
      return services.length === 0;
    } catch {
      return true; // Default to showing examples if we can't check
    }
  }

  /**
   * Show example queries for mock server
   */
  private showMockExamples(): void {
    const isRunning = this.agentStatus.services.some((service: any) => service.name === 'mock' && service.running);

    console.log(chalk.bold.yellow(`${isRunning ? '💡' : '💭'} ${isRunning ? 'Mock Server Active' : 'Mock Mode Available'} - Try These Example Queries:`));
    console.log();
    console.log(chalk.cyan('  > Show me electronics sales in California last quarter.'));
    console.log(chalk.cyan('  > List top customers by revenue.'));
    console.log(chalk.cyan('  > Compare revenue trends by region.'));
    console.log(chalk.cyan('  > What are the top-selling products this month?'));
    console.log(chalk.cyan('  > Show me sales data for New York vs Texas.'));
    console.log();

    if (!isRunning) {
      console.log(chalk.dim('💡 Tip: Start with "mcpagent start --mock" for live mock data'));
      console.log();
    }

    console.log(chalk.dim('Type "help" anytime for more commands.'));
    console.log(chalk.dim('━'.repeat(60)));
    console.log();
  }

  /**
   * Show help message
   */
  private showHelp(): void {
    console.log();
    console.log(chalk.bold('Chat Mode Commands:'));
    console.log();
    console.log(chalk.cyan('  help  ') + ' - Show this help message');
    console.log(chalk.cyan('  clear ') + ' - Clear chat history');
    console.log(chalk.cyan('  exit  ') + ' - Exit chat mode');
    console.log();
    console.log(chalk.bold('Example Queries:'));
    console.log();
    console.log(chalk.dim('  > Show me electronics sales in California last quarter.'));
    console.log(chalk.dim('  > List top customers by revenue.'));
    console.log(chalk.dim('  > Compare revenue trends by region.'));
    console.log();
  }
}

export const chatMode = new ChatMode();

