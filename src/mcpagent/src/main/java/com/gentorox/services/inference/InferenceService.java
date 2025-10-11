package com.gentorox.services.inference;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceResponse;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.model.openai.OpenAiChatModel;
// Temporarily disabled due to missing API key
// import dev.langchain4j.model.anthropic.AnthropicChatModel;
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * InferenceService that provides a unified interface for sending inference requests
 * to various AI models using LangChain4j.
 */
@Service
public class InferenceService {
  
  private final ChatLanguageModel chatModel;
  
  public InferenceService(ProviderConfig providerConfig) {
    this.chatModel = createChatModel(providerConfig);
  }
  
  /**
   * Sends an inference request to the currently configured model.
   * 
   * @param prompt The input string/prompt to send to the model
   * @param tools List of available tools for the model to use
   * @return InferenceResponse containing the model's response
   */
  public InferenceResponse sendRequest(String prompt, List<ToolSpec> tools) {
    return sendRequest(prompt, tools, Map.of());
  }
  
  /**
   * Sends an inference request to the currently configured model with options.
   * 
   * @param prompt The input string/prompt to send to the model
   * @param tools List of available tools for the model to use
   * @param options Additional options for the inference request
   * @return InferenceResponse containing the model's response
   */
  public InferenceResponse sendRequest(String prompt, List<ToolSpec> tools, Map<String, Object> options) {
    try {
      // Create messages list
      List<ChatMessage> messages = new ArrayList<>();
      messages.add(UserMessage.from(prompt));
      
      // Convert ToolSpec to LangChain4j ToolSpecification
      List<ToolSpecification> langchain4jTools = convertToLangChain4jTools(tools);
      
      // Send request to the model with native tool support
      Response<AiMessage> response;
      if (!langchain4jTools.isEmpty()) {
        response = chatModel.generate(messages, langchain4jTools);
      } else {
        response = chatModel.generate(messages);
      }
      
      // Extract response content
      AiMessage aiMessage = response.content();
      String content = aiMessage.text();
      
      // Extract tool calls if present
      Optional<InferenceResponse.ToolCall> toolCall = Optional.empty();
      List<ToolExecutionRequest> toolRequests = aiMessage.toolExecutionRequests();
      if (toolRequests != null && !toolRequests.isEmpty()) {
        ToolExecutionRequest toolRequest = toolRequests.get(0);
        toolCall = Optional.of(new InferenceResponse.ToolCall(
            toolRequest.name(),
            toolRequest.arguments()
        ));
      }
      
      return new InferenceResponse(content, toolCall, response.tokenUsage().toString());
      
    } catch (Exception e) {
      throw new RuntimeException("Failed to send inference request", e);
    }
  }
  
  /**
   * Creates a ChatLanguageModel based on the configured provider.
   */
  private ChatLanguageModel createChatModel(ProviderConfig providerConfig) {
    String provider = providerConfig.getDefaultProvider();
    ProviderConfig.ProviderSettings settings = providerConfig.getProviders().get(provider);
    
    if (settings == null) {
      throw new IllegalArgumentException("Provider configuration not found for: " + provider);
    }
    
    return switch (provider.toLowerCase()) {
      case "openai" -> {
        if (settings.getApiKey() == null || settings.getApiKey().isEmpty()) {
          throw new IllegalArgumentException("OpenAI API key is required");
        }
        var builder = OpenAiChatModel.builder()
            .apiKey(settings.getApiKey())
            .modelName(settings.getModelName());
        
        if (settings.getBaseUrl() != null && !settings.getBaseUrl().isEmpty()) {
          builder.baseUrl(settings.getBaseUrl());
        }
        
        yield builder.build();
      }
      case "anthropic" -> {
        // Temporarily disabled due to missing API key
        throw new IllegalArgumentException("Anthropic support is temporarily disabled due to missing API key");
        /*
        if (settings.getApiKey() == null || settings.getApiKey().isEmpty()) {
          throw new IllegalArgumentException("Anthropic API key is required");
        }
        var builder = AnthropicChatModel.builder()
            .apiKey(settings.getApiKey())
            .modelName(settings.getModelName());
        
        if (settings.getBaseUrl() != null && !settings.getBaseUrl().isEmpty()) {
          builder.baseUrl(settings.getBaseUrl());
        }
        
        yield builder.build();
        */
      }
      case "gemini" -> {
        if (settings.getApiKey() == null || settings.getApiKey().isEmpty()) {
          throw new IllegalArgumentException("Gemini API key is required");
        }
        var builder = GoogleAiGeminiChatModel.builder()
            .apiKey(settings.getApiKey())
            .modelName(settings.getModelName());
        
        yield builder.build();
      }
      default -> throw new IllegalArgumentException("Unsupported model provider: " + provider);
    };
  }
  
  /**
   * Converts ToolSpec objects to LangChain4j ToolSpecification objects.
   */
  private List<ToolSpecification> convertToLangChain4jTools(List<ToolSpec> tools) {
    return tools.stream()
        .map(tool -> ToolSpecification.builder()
            .name(tool.name())
            .description(tool.description())
            .build())
        .toList();
  }
  
}
