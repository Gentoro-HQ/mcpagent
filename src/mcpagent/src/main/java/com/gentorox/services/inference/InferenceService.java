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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * InferenceService provides a unified interface for sending inference requests
 * to various AI model providers via LangChain4j.
 *
 * Responsibilities:
 * - Build the proper ChatLanguageModel based on ProviderProperties
 * - Maintain a running message transcript across tool-calling turns
 * - Execute NativeTool implementations requested by the model
 * - Aggregate token usage and return a simplified InferenceResponse
 *
 * Logging:
 * All public operations are logged with a per-request correlationId stored in MDC
 * so logs can be filtered and visualized easily.
 */
public class InferenceService {
  private static final Logger LOGGER = LoggerFactory.getLogger(InferenceService.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final ChatLanguageModel chatModel;
  private final NativeToolsRegistry toolRegistry;

  /**
   * Construct a new InferenceService.
   * Used internally to run tests or standalone setups.
   * @param providerProperties configuration that selects the default provider and its settings
   */
  public InferenceService(ProviderProperties providerProperties) {
    this(providerProperties, null);
  }

  /**
   * Construct a new InferenceService.
   *
   * @param providerProperties configuration that selects the default provider and its settings
   * @param toolRegistry registry of built-in/native tools available to the model
   */
  public InferenceService(ProviderProperties providerProperties, NativeToolsRegistry toolRegistry) {
    this.chatModel = createChatModel(providerProperties);
    this.toolRegistry = toolRegistry;
  }

  /**
   * Convenience method that sends a prompt without any ad-hoc tools.
   */
  public InferenceResponse sendRequest(String prompt) {
    return sendRequest(prompt, Collections.emptyList());
  }

  /**
   * Sends an inference request to the currently configured model with optional ad-hoc tools.
   *
   * @param prompt The input prompt to send to the model
   * @param adHocTools additional tools to expose for this specific request (merged with registry tools)
   * @return InferenceResponse containing the model's response and token usage
   */
  public InferenceResponse sendRequest(String prompt, List<NativeTool> adHocTools) {
    String correlationId = UUID.randomUUID().toString();
    MDC.put("correlationId", correlationId);
    Instant start = Instant.now();
    try {
      // 1) Running transcript
      List<ChatMessage> messages = new ArrayList<>();
      messages.add(UserMessage.from(prompt));

      // 2) Tool specs for the model
      Map<String, NativeTool> mapOfTools = new HashMap<>();
      if (toolRegistry != null) {
        toolRegistry.currentTools().forEach(t -> mapOfTools.put(t.spec().name(), t));
      }

      if (adHocTools != null) {
        adHocTools.forEach(t -> mapOfTools.put(t.spec().name(), t));
      }

      List<ToolSpecification> modelTools =
          convertToLangChain4jTools(mapOfTools.values().stream().map(NativeTool::spec).toList());

      LOGGER.info("Inference request started correlationId={} promptChars={} tools={}",
          correlationId,
          prompt != null ? prompt.length() : 0,
          mapOfTools.keySet());

      // 3) Loop until no tool requests
      StringBuilder finalText = new StringBuilder();
      TokenUsage totalUsage = null;

      // Safety guard
      int maxTurns = 8;

      for (int turn = 0; turn < maxTurns; turn++) {
        LOGGER.debug("Turn {} starting (toolsEnabled={})", turn + 1, !modelTools.isEmpty());
        Response<AiMessage> response = modelTools.isEmpty()
            ? chatModel.generate(messages)
            : chatModel.generate(messages, modelTools);

        AiMessage ai = response.content();
        messages.add(ai);

        // Accumulate text (some providers return both text and tool calls)
        if (ai.text() != null && !ai.text().isBlank()) {
          if (finalText.length() > 0) finalText.append("\n");
          finalText.append(ai.text());
          LOGGER.debug("Turn {} received text chunk (chars={})", turn + 1, ai.text().length());
        }

        // Accumulate token usage
        if (response.tokenUsage() != null) {
          totalUsage = mergeUsage(totalUsage, response.tokenUsage());
          LOGGER.debug("Turn {} token usage: {} (accumulated)", turn + 1, response.tokenUsage());
        }

        List<ToolExecutionRequest> requests = ai.toolExecutionRequests();
        if (requests == null || requests.isEmpty()) {
          LOGGER.info("No tool requests detected; finishing after {} turns", turn + 1);
          break;
        }

        LOGGER.info("Turn {} tool requests: {}", turn + 1,
            requests.stream().map(ToolExecutionRequest::name).collect(Collectors.toList()));

        // 4) Execute each requested tool and append result messages
        for (ToolExecutionRequest req : requests) {
          String result;
          try {
            Instant toolStart = Instant.now();
            result = executeTool(req, mapOfTools);
            Duration took = Duration.between(toolStart, Instant.now());
            LOGGER.info("Tool executed name={} tookMs={} resultChars={}", req.name(), took.toMillis(),
                result != null ? result.length() : 0);
          } catch (Exception ex) {
            LOGGER.warn("Tool execution failed name={} error={}", req.name(), ex.toString());
            // Send the error back to the model so it can recover or choose another tool
            result = "ERROR: " + ex.getMessage();
          }
          messages.add(ToolExecutionResultMessage.from(req, result));
        }
      }

      InferenceResponse out = new InferenceResponse(
          finalText.toString(),
          /* toolCall= */ Optional.empty(),
          totalUsage != null ? totalUsage.toString() : null
      );

      Duration totalTook = Duration.between(start, Instant.now());
      LOGGER.info("Inference request finished correlationId={} tookMs={} finalChars={} providerTraceId={}",
          correlationId, totalTook.toMillis(), out.content() != null ? out.content().length() : 0, out.providerTraceId());
      return out;

    } catch (Exception e) {
      LOGGER.error("Inference request failed correlationId={} error=", correlationId, e);
      throw new RuntimeException("Failed to send inference request", e);
    } finally {
      MDC.remove("correlationId");
    }
  }

  /**
   * Execute a tool by name with JSON arguments from the model.
   * Adapt this to your own ToolSpec shape.
   */
  private String executeTool(ToolExecutionRequest req, Map<String, NativeTool> mapOfTools) {
    String toolName = req.name();
    String argsJson = req.arguments(); // LangChain4j gives raw JSON string
    if (!mapOfTools.containsKey(toolName)) {
      throw new IllegalArgumentException("Unknown tool: " + toolName);
    }
    LOGGER.debug("Executing tool name={} argsJson={}", toolName, argsJson);
    String result = mapOfTools.get(toolName).execute(asMap(argsJson));
    LOGGER.debug("Executed tool name={} resultChars={}", toolName, result != null ? result.length() : 0);
    return result;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> asMap(String argsJson) {
    if (argsJson == null || argsJson.isBlank()) {
      return Collections.emptyMap();
    }
    try {
      return MAPPER.readValue(argsJson, new TypeReference<Map<String, Object>>() {});
    } catch (Exception e) {
      LOGGER.debug("Failed to parse tool arguments JSON: {}", argsJson, e);
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
   * Logs which provider/model is being instantiated (without exposing secrets).
   */
  private ChatLanguageModel createChatModel(ProviderProperties providerProperties) {
    String provider = providerProperties.getDefaultProvider();
    ProviderProperties.ProviderSettings settings = providerProperties.getProviders().get(provider);

    if (settings == null) {
      throw new IllegalArgumentException("Provider configuration not found for: " + provider);
    }

    LOGGER.info("Creating ChatLanguageModel provider={} modelName={} baseUrlPresent={}",
        provider, settings.getModelName(), settings.getBaseUrl() != null && !settings.getBaseUrl().isEmpty());

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
