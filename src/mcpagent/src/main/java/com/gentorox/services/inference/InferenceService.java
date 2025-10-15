package com.gentorox.services.inference;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.tools.NativeTool;
import com.gentorox.tools.NativeToolsRegistry;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.anthropic.AnthropicChatModel;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;
import dev.langchain4j.model.output.TokenUsage;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.lang.annotation.Native;
import java.util.*;

/**
 * InferenceService that provides a unified interface for sending inference requests
 * to various AI models using LangChain4j.
 */
@Service
public class InferenceService {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final ChatLanguageModel chatModel;

  public InferenceService(ProviderConfig providerConfig) {
    this.chatModel = createChatModel(providerConfig);
  }

  public InferenceResponse sendRequest(String prompt) {
    return sendRequest(prompt, null, Collections.emptyList());
  }

  /**
   * Sends an inference request to the currently configured model.
   *
   * @param prompt The input string/prompt to send to the model
   * @return InferenceResponse containing the model's response
   */
  public InferenceResponse sendRequest(String prompt, NativeToolsRegistry toolRegistry) {
    return sendRequest(prompt, toolRegistry, Collections.emptyList());
  }

  public InferenceResponse sendRequest(String prompt, List<NativeTool> adhocTools) {
    return sendRequest(prompt, null, Collections.emptyList());
  }

  /**
   * Sends an inference request to the currently configured model with options.
   *
   * @param prompt The input string/prompt to send to the model
   * @return InferenceResponse containing the model's response
   */
  public InferenceResponse sendRequest(String prompt, NativeToolsRegistry toolRegistry, List<NativeTool> adhocTools) {
    try {
      // 1) Running transcript
      List<ChatMessage> messages = new ArrayList<>();
      messages.add(UserMessage.from(prompt));

      // 2) Tool specs for the model
      List<NativeTool> tools = new ArrayList<>();
      List<ToolSpec> toolSpecs = new ArrayList<>();
      if( Objects.nonNull( toolRegistry) ) {
        tools.addAll(toolRegistry.currentTools());
      }
      if( adhocTools != null ) {
        tools.addAll(adhocTools);
      }
      tools.stream().map(NativeTool::spec).forEach(toolSpecs::add);
      List<ToolSpecification> modelTools = convertToLangChain4jTools(toolSpecs);

      // 3) Loop until no tool requests
      StringBuilder finalText = new StringBuilder();
      TokenUsage totalUsage = null;

      // Safety guard
      int maxTurns = 8;

      for (int turn = 0; turn < maxTurns; turn++) {
        Response<AiMessage> response = modelTools.isEmpty()
            ? chatModel.generate(messages)
            : chatModel.generate(messages, modelTools);


        AiMessage ai = response.content();
        messages.add(ai);

        // Accumulate text (some providers return both text and tool calls)
        if (ai.text() != null && !ai.text().isBlank()) {
          if (finalText.length() > 0) finalText.append("\n");
          finalText.append(ai.text());
        }

        // Accumulate token usage
        if (response.tokenUsage() != null) {
          totalUsage = mergeUsage(totalUsage, response.tokenUsage());
        }

        List<ToolExecutionRequest> requests = ai.toolExecutionRequests();
        if (requests == null || requests.isEmpty()) {
          // No more tool calls — we're done
          break;
        }

        // 4) Execute each requested tool and append result messages
        for (ToolExecutionRequest req : requests) {
          String result;
          try {
            result = executeTool(req, tools);
          } catch (Exception ex) {
            // Send the error back to the model so it can recover or choose another tool
            result = "ERROR: " + ex.getMessage();
          }
          messages.add(ToolExecutionResultMessage.from(req, result));
        }
      }

      return new InferenceResponse(
          finalText.toString(),
          /* toolCall= */ Optional.empty(),
          totalUsage != null ? totalUsage.toString() : null
      );

    } catch (Exception e) {
      throw new RuntimeException("Failed to send inference request", e);
    }
  }

  /**
   * Execute a tool by name with JSON arguments from the model.
   * Adapt this to your own ToolSpec shape.
   */
  private String executeTool(ToolExecutionRequest req, List<NativeTool> tools) {
    String toolName = req.name();
    String argsJson = req.arguments(); // LangChain4j gives raw JSON string
    NativeTool tool = tools.stream()
        .filter(t -> t.spec().name().equals(toolName))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown tool: " + toolName));
    return tool.execute(asMap(argsJson));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> asMap(String argsJson) {
    if (argsJson == null || argsJson.isBlank()) {
      return Collections.emptyMap();
    }
    try {
      return MAPPER.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
    } catch (Exception e) {
      throw new RuntimeException("Failed to parse tool arguments JSON: " + argsJson, e);
    }
  }

  private TokenUsage mergeUsage(TokenUsage a, TokenUsage b) {
    if (a == null) return b;
    if (b == null) return a;
    return new TokenUsage(
        safeSum(a.inputTokenCount(), b.inputTokenCount()),
        safeSum(a.outputTokenCount(), b.outputTokenCount()),
        safeSum(a.totalTokenCount(), b.totalTokenCount())
    );
  }

  private Integer safeSum(Integer x, Integer y) {
    if (x == null) return y;
    if (y == null) return x;
    return x + y;
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
