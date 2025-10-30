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

  /**
   * Start interactive chat session
   */
  async start(): Promise<void> {
    // Check if agent is running
    const status = await agentService.getStatus();
    if (!status.running) {
      console.log(chalk.red('❌ MCP Agent is not running.'));
      console.log(chalk.yellow('Start the agent first with: mcpagent start'));
      return;
    }

    this.mcpUrl = status.mcpUrl || 'http://localhost:8080/mcp';

    // Get provider info
    const config = await configManager.getGlobalConfig();
    if (!config) {
      console.log(chalk.red('❌ No configuration found.'));
      return;
    }

    console.log();
    console.log(chalk.bold.cyan('╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║   Gentoro MCP Agent - Chat Mode     ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝'));
    console.log();
    console.log(chalk.dim(`Provider: ${config.provider}`));
    console.log(chalk.dim(`MCP URL: ${this.mcpUrl}`));
    console.log(chalk.dim(`Type 'exit' to quit, 'clear' to clear history`));
    console.log(chalk.dim('━'.repeat(60)));
    console.log();

    // Main chat loop
    await this.chatLoop(config.provider);
  }

  /**
   * Main chat interaction loop
   */
  private async chatLoop(provider: ModelProvider): Promise<void> {
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
   * Send message to MCP Agent via model provider
   */
  private async sendMessage(provider: ModelProvider, userMessage: string): Promise<string> {
    // First, get available tools from MCP
    const tools = await this.getAvailableTools();

    // Then send to the appropriate provider
    switch (provider) {
      case 'openai':
        return this.sendToOpenAI(userMessage, tools);
      case 'gemini':
        return this.sendToGemini(userMessage, tools);
      case 'anthropic':
        return this.sendToAnthropic(userMessage, tools);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get available MCP tools
   */
  private async getAvailableTools(): Promise<any[]> {
    try {
      const response = await axios.post(
        this.mcpUrl,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.result?.tools || [];
    } catch (error) {
      console.warn('Could not fetch MCP tools:', error);
      return [];
    }
  }

  /**
   * Send message to OpenAI with MCP tools
   */
  private async sendToOpenAI(userMessage: string, tools: any[]): Promise<string> {
    const config = await configManager.getGlobalConfig();
    if (!config?.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Convert MCP tools to OpenAI function format
    const functions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    }));

    // Prepare messages
    const messages = this.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call OpenAI API
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.modelName || 'gpt-4',
        messages,
        functions: functions.length > 0 ? functions : undefined,
        function_call: functions.length > 0 ? 'auto' : undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const choice = response.data.choices[0];

    // Handle function calls
    if (choice.message.function_call) {
      const functionResult = await this.callMCPTool(
        choice.message.function_call.name,
        JSON.parse(choice.message.function_call.arguments)
      );

      // Add function call and result to messages
      this.messages.push({
        role: 'assistant',
        content: '',
      });

      // Make another call with function result
      const followUpResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.modelName || 'gpt-4',
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: '',
              function_call: choice.message.function_call,
            },
            {
              role: 'function',
              name: choice.message.function_call.name,
              content: JSON.stringify(functionResult),
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return followUpResponse.data.choices[0].message.content;
    }

    return choice.message.content;
  }

  /**
   * Send message to Google Gemini
   */
  private async sendToGemini(userMessage: string, tools: any[]): Promise<string> {
    // Simplified implementation - in production, you'd use the Gemini SDK
    throw new Error('Gemini chat mode not yet implemented. Use OpenAI for now.');
  }

  /**
   * Send message to Anthropic Claude
   */
  private async sendToAnthropic(userMessage: string, tools: any[]): Promise<string> {
    // Simplified implementation - in production, you'd use the Anthropic SDK
    throw new Error('Anthropic chat mode not yet implemented. Use OpenAI for now.');
  }

  /**
   * Call an MCP tool
   */
  private async callMCPTool(toolName: string, args: any): Promise<any> {
    const response = await axios.post(
      this.mcpUrl,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.result;
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

