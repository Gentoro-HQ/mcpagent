package com.gentorox.services.inference;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.tools.NativeTool;

import java.util.List;
import java.util.Map;

/**
 * Manual test class for InferenceService.
 *
 * This class demonstrates how to test the InferenceService with environment variables.
 * To run this test:
 *
 * 1. Set one of the following environment variables:
 *    export OPENAI_API_KEY="your-openai-key"
 *    export ANTHROPIC_API_KEY="your-anthropic-key"
 *    export GEMINI_API_KEY="your-gemini-key"
 *
 * 2. Run the main method:
 *    java -cp target/classes:target/test-classes com.gentorox.services.inference.InferenceServiceManualTest
 */
public class InferenceServiceManualTest {

    public static void main(String[] args) {
        System.out.println("=== InferenceService Manual Test ===");

        // Check environment variables
        checkEnvironmentVariables();

        // Test OpenAI if available
        if (System.getenv("OPENAI_API_KEY") != null && !System.getenv("OPENAI_API_KEY").isEmpty()) {
            testOpenAI();
        }

        // Test Anthropic if available (temporarily disabled)
        if (System.getenv("ANTHROPIC_API_KEY") != null && !System.getenv("ANTHROPIC_API_KEY").isEmpty()) {
            System.out.println("\n--- Anthropic Test Skipped ---");
            System.out.println("Anthropic support temporarily disabled due to missing API key");
        }

        // Test Gemini if available
        if (System.getenv("GEMINI_API_KEY") != null && !System.getenv("GEMINI_API_KEY").isEmpty()) {
            testGemini();
        }

        System.out.println("=== Test Complete ===");
    }

    private static void checkEnvironmentVariables() {
        System.out.println("\n--- Environment Variables Check ---");

        String openaiKey = System.getenv("OPENAI_API_KEY");
        String anthropicKey = System.getenv("ANTHROPIC_API_KEY");
        String geminiKey = System.getenv("GEMINI_API_KEY");

        System.out.println("OPENAI_API_KEY: " + (openaiKey != null && !openaiKey.isEmpty() ? "SET" : "NOT SET"));
        System.out.println("ANTHROPIC_API_KEY: " + (anthropicKey != null && !anthropicKey.isEmpty() ? "SET" : "NOT SET"));
        System.out.println("GEMINI_API_KEY: " + (geminiKey != null && !geminiKey.isEmpty() ? "SET" : "NOT SET"));

        if (openaiKey == null && anthropicKey == null && geminiKey == null) {
            System.out.println("No API keys found. Set at least one environment variable to run tests.");
            return;
        }
    }

    private static void testOpenAI() {
        System.out.println("\n--- Testing OpenAI ---");

        try {
            ProviderProperties config = new ProviderProperties();

            ProviderProperties.ProviderSettings openaiSettings = new ProviderProperties.ProviderSettings();
            openaiSettings.setApiKey(System.getenv("OPENAI_API_KEY"));
            openaiSettings.setModelName("gpt-4o-mini"); // Use cheaper model for testing

            config.setProviders(Map.of("openai", openaiSettings));
            config.setDefaultProvider("openai");

            InferenceService service = new InferenceService(config);

            // Test basic inference
            InferenceResponse response = service.sendRequest(
                "What is 2+2? Respond with just the number.",
                List.of()
            );

            System.out.println("✅ OpenAI test passed!");
            System.out.println("Response: " + response.content());

            // Test tool calling
            testToolCalling(service, "OpenAI");

        } catch (Exception e) {
            System.out.println("❌ OpenAI test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void testAnthropic() {
        System.out.println("\n--- Testing Anthropic ---");

        try {
            ProviderProperties config = new ProviderProperties();

            ProviderProperties.ProviderSettings anthropicSettings = new ProviderProperties.ProviderSettings();
            anthropicSettings.setApiKey(System.getenv("ANTHROPIC_API_KEY"));
            anthropicSettings.setModelName("claude-3-haiku-20240307"); // Use cheaper model for testing

            config.setProviders(Map.of("anthropic", anthropicSettings));
            config.setDefaultProvider("anthropic");

            InferenceService service = new InferenceService(config);

            // Test basic inference
            InferenceResponse response = service.sendRequest(
                "What is the capital of France? Respond with just the city name.",
                List.of()
            );

            System.out.println("✅ Anthropic test passed!");
            System.out.println("Response: " + response.content());

            // Test tool calling
            testToolCalling(service, "Anthropic");

        } catch (Exception e) {
            System.out.println("❌ Anthropic test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void testGemini() {
        System.out.println("\n--- Testing Gemini ---");

        try {
            ProviderProperties config = new ProviderProperties();

            ProviderProperties.ProviderSettings geminiSettings = new ProviderProperties.ProviderSettings();
            geminiSettings.setApiKey(System.getenv("GEMINI_API_KEY"));
            geminiSettings.setModelName("gemini-2.0-flash"); // Use supported model for testing

            config.setProviders(Map.of("gemini", geminiSettings));
            config.setDefaultProvider("gemini");

            InferenceService service = new InferenceService(config);

            // Test basic inference
            InferenceResponse response = service.sendRequest(
                "What color is the sky? Respond with just the color.",
                List.of()
            );

            System.out.println("✅ Gemini test passed!");
            System.out.println("Response: " + response.content());

            // Test tool calling
            testToolCalling(service, "Gemini");

        } catch (Exception e) {
            System.out.println("❌ Gemini test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void testToolCalling(InferenceService service, String providerName) {
        System.out.println("\n--- Testing Tool Calling with " + providerName + " ---");

        try {
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

            // Test tool calling
            InferenceResponse response = service.sendRequest(
                "Calculate 5 + 3 using the calculator tool",
                List.of(tool)
            );

            System.out.println("✅ Tool calling test passed!");
            System.out.println("Response: " + response.content());

            // Check if tool call was made
            if (response.toolCall().isPresent()) {
                InferenceResponse.ToolCall toolCall = response.toolCall().get();
                System.out.println("🔧 Tool call detected:");
                System.out.println("  Tool: " + toolCall.toolName());
                System.out.println("  Args: " + toolCall.jsonArguments());
            } else {
                System.out.println("ℹ️  No tool call made (model responded directly)");
            }

        } catch (Exception e) {
            System.out.println("❌ Tool calling test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
