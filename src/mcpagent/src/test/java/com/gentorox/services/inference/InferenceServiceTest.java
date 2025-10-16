package com.gentorox.services.inference;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.tools.NativeTool;
import com.gentorox.tools.NativeToolsRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Test cases for InferenceService.
 *
 * Note: These tests require API keys to be set in environment variables:
 * - OPENAI_API_KEY
 * - ANTHROPIC_API_KEY
 * - GEMINI_API_KEY
 */
@SpringBootTest
@TestPropertySource(properties = {
    "providers.providers.openai.apiKey=${OPENAI_API_KEY:}",
    "providers.providers.anthropic.apiKey=${ANTHROPIC_API_KEY:}",
    "providers.providers.gemini.apiKey=${GEMINI_API_KEY:}",
    "providers.default-provider=openai"
})
class InferenceServiceTest {
  @Value("${providers.providers.openai.apiKey}")
  private String openaiApiKey;

  @Value("${providers.providers.anthropic.apiKey}")
  private String anthropicApiKey;

  @Value("${providers.providers.gemini.apiKey}")
  private String geminiApiKey;

  @Value("${providers.default-provider}")
  private String defaultProvider;

  private InferenceService inferenceService;
  private ProviderProperties providerProperties;
  private NativeToolsRegistry toolsRegistry;

  @BeforeEach
  void setUp() {
    providerProperties = new ProviderProperties();
    toolsRegistry = new NativeToolsRegistry(List.of());

    ProviderProperties.ProviderSettings openaiSettings = new ProviderProperties.ProviderSettings();
    openaiSettings.setApiKey(openaiApiKey);
    openaiSettings.setModelName("gpt-4o-mini");

    ProviderProperties.ProviderSettings anthropicSettings = new ProviderProperties.ProviderSettings();
    anthropicSettings.setApiKey(anthropicApiKey);
    anthropicSettings.setModelName("claude-3-haiku-20240307");

    ProviderProperties.ProviderSettings geminiSettings = new ProviderProperties.ProviderSettings();
    geminiSettings.setApiKey(geminiApiKey);
    geminiSettings.setModelName("gemini-2.0-flash");

    providerProperties.setProviders(Map.of(
        "openai", openaiSettings,
        "anthropic", anthropicSettings,
        "gemini", geminiSettings
    ));

    providerProperties.setDefaultProvider(defaultProvider);
    inferenceService = new InferenceService(providerProperties, toolsRegistry);
  }


    @Test
    void testOpenAIInference() {
      assumeTrue(openaiApiKey != null && !openaiApiKey.isBlank(),
          "Skipping test because OpenAI API key is not set");

        // Test basic inference
        InferenceResponse response = inferenceService.sendRequest(
            "What is 2+2? Respond with just the number.",
            List.of()
        );

        assertNotNull(response);
        assertNotNull(response.content());
        assertTrue(response.content().contains("4"));
        assertFalse(response.toolCall().isPresent());
    }

    @Test
    void testOpenAIWithTools() {
      assumeTrue(openaiApiKey != null && !openaiApiKey.isBlank(),
          "Skipping test because OpenAI API key is not set");
        // Create a simple tool spec
        ToolSpec toolSpec = new ToolSpec(
            "calculator",
            "Performs basic arithmetic operations",
            List.of(
                new ToolSpec.Parameter("operation", "string", true, "The operation to perform", null),
                new ToolSpec.Parameter("a", "number", true, "First number", null),
                new ToolSpec.Parameter("b", "number", true, "Second number", null)
            )
        );

      NativeTool tool = new NativeTool() {
        @Override public ToolSpec spec() { return toolSpec; }
        @Override public String execute(java.util.Map<String, Object> args) {
          String operation = (String) args.get("operation");
          double a = (double) args.get("a");
          double b = (double) args.get("b");

          switch (operation) {
            case "add":
              return String.valueOf(a + b);
            case "subtract":
              return String.valueOf(a - b);
            case "multiply":
              return String.valueOf(a * b);
            case "divide":
              return String.valueOf(a / b);
            default:
              return null;
          }
        }
      };



        InferenceResponse response = inferenceService.sendRequest(
            "Calculate 5 + 3 using the calculator tool",
            List.of(tool)
        );

        assertNotNull(response);
        assertNotNull(response.content());

        // Check if tool call was made
        if (response.toolCall().isPresent()) {
            InferenceResponse.ToolCall toolCall = response.toolCall().get();
            assertEquals("calculator", toolCall.toolName());
            assertNotNull(toolCall.jsonArguments());
            assertTrue(toolCall.jsonArguments().contains("5") && toolCall.jsonArguments().contains("3"));
        }
    }

    @Test
    void testAnthropicInference() {
      assumeTrue(anthropicApiKey != null && !anthropicApiKey.isBlank(),
          "Skipping test because Anthropic API key is not set");
        // Switch to Anthropic provider
        providerProperties.setDefaultProvider("anthropic");
        InferenceService anthropicService = new InferenceService(providerProperties, toolsRegistry);

        InferenceResponse response = anthropicService.sendRequest(
            "What is the capital of France? Respond with just the city name.",
            List.of()
        );

        assertNotNull(response);
        assertNotNull(response.content());
        assertTrue(response.content().toLowerCase().contains("paris"));
        assertFalse(response.toolCall().isPresent());
    }

    @Test
    void testGeminiInference() {
      assumeTrue(geminiApiKey != null && !geminiApiKey.isBlank(),
          "Skipping test because Gemini API key is not set");
        // Switch to Gemini provider
        providerProperties.setDefaultProvider("gemini");
        InferenceService geminiService = new InferenceService(providerProperties, toolsRegistry);

        InferenceResponse response = geminiService.sendRequest(
            "What color is the sky? Respond with just the color.",
            List.of()
        );

        assertNotNull(response);
        assertNotNull(response.content());
        assertTrue(response.content().toLowerCase().contains("blue"));
        assertFalse(response.toolCall().isPresent());
    }

    @Test
    void testInferenceWithOptions() {
      assumeTrue(openaiApiKey != null && !openaiApiKey.isBlank(),
          "Skipping test because OpenAI API key is not set");

        Map<String, Object> options = Map.of(
            "temperature", 0.1,
            "max_tokens", 50
        );

        InferenceResponse response = inferenceService.sendRequest("Count from 1 to 5");

        assertNotNull(response);
        assertNotNull(response.content());
        // Should be a short response due to max_tokens limit
        assertTrue(response.content().length() <= 100);
    }

    @Test
    void testMissingApiKey() {
        // Test with missing API key
        ProviderProperties.ProviderSettings invalidSettings = new ProviderProperties.ProviderSettings();
        invalidSettings.setApiKey("");
        invalidSettings.setModelName("gpt-4");

        ProviderProperties invalidConfig = new ProviderProperties();
        invalidConfig.setProviders(Map.of("openai", invalidSettings));
        invalidConfig.setDefaultProvider("openai");

        assertThrows(IllegalArgumentException.class, () -> {
            new InferenceService(invalidConfig, toolsRegistry);
        });
    }

    @Test
    void testUnknownProvider() {
        // Test with unknown provider
        ProviderProperties.ProviderSettings settings = new ProviderProperties.ProviderSettings();
        settings.setApiKey("test-key");
        settings.setModelName("test-model");

        ProviderProperties invalidConfig = new ProviderProperties();
        invalidConfig.setProviders(Map.of("unknown", settings));
        invalidConfig.setDefaultProvider("unknown");

        assertThrows(IllegalArgumentException.class, () -> {
            new InferenceService(invalidConfig, toolsRegistry);
        });
    }
}
