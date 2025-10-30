import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChatMode } from '../chat-mode.js';
import axios from 'axios';

// Mock axios at module level
jest.mock('axios');

// Mock other dependencies
jest.mock('inquirer');
jest.mock('../../config/manager.js');
jest.mock('../../services/agent-service.js');

describe('ChatMode', () => {
  let chatMode: ChatMode;

  beforeEach(() => {
    jest.clearAllMocks();
    chatMode = new ChatMode();
  });

  describe('sendMessage', () => {
    it('should send message to chat API endpoint', async () => {
      // Set mcpUrl before calling sendMessage
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      const mockResponse = {
        data: {
          content: 'Test response from agent',
          traceId: 'trace-123',
          error: null,
        },
      };

      jest.spyOn(axios, 'post').mockResolvedValue(mockResponse as any);

      // Access private method via any cast for testing
      const result = await (chatMode as any).sendMessage('openai', 'Hello');

      expect(result).toBe('Test response from agent');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        {
          message: 'Hello',
          options: {},
        },
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle API errors', async () => {
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
        },
      };

      jest.spyOn(axios, 'post').mockRejectedValue(mockError);

      await expect(
        (chatMode as any).sendMessage('openai', 'Hello')
      ).rejects.toThrow('Agent error: 500 - Internal Server Error');
    });

    it('should handle error in response data', async () => {
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      const mockResponse = {
        data: {
          content: null,
          traceId: null,
          error: 'Something went wrong',
        },
      };

      jest.spyOn(axios, 'post').mockResolvedValue(mockResponse as any);

      await expect(
        (chatMode as any).sendMessage('openai', 'Hello')
      ).rejects.toThrow('Something went wrong');
    });

    it('should return default message if no content', async () => {
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      const mockResponse = {
        data: {
          content: null,
          traceId: 'trace-123',
          error: null,
        },
      };

      jest.spyOn(axios, 'post').mockResolvedValue(mockResponse as any);

      const result = await (chatMode as any).sendMessage('openai', 'Hello');

      expect(result).toBe('No response from agent');
    });

    it('should handle network errors', async () => {
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      const networkError = new Error('Network error');
      jest.spyOn(axios, 'post').mockRejectedValue(networkError);

      await expect(
        (chatMode as any).sendMessage('openai', 'Hello')
      ).rejects.toThrow('Failed to communicate with agent: Network error');
    });
  });

  describe('message history', () => {
    it('should initialize with empty message history', () => {
      expect((chatMode as any).messages).toEqual([]);
    });

    it('should maintain message history', () => {
      const messages = (chatMode as any).messages;
      
      // Simulate adding messages
      messages.push({ role: 'user', content: 'Hello' });
      messages.push({ role: 'assistant', content: 'Hi there!' });

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });
  });

  describe('URL handling', () => {
    it('should correctly transform MCP URL to chat API URL', () => {
      (chatMode as any).mcpUrl = 'http://localhost:8080/mcp';
      
      // The sendMessage method should replace /mcp with /api/chat
      jest.spyOn(axios, 'post').mockResolvedValue({
        data: { content: 'test', traceId: 'test', error: null },
      } as any);

      (chatMode as any).sendMessage('openai', 'test');

      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:8080/api/chat',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});

