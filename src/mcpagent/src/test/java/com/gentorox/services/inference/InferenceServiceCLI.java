package com.gentorox.services.inference;

import com.gentorox.core.model.InferenceResponse;
import com.gentorox.core.api.ToolSpec;
import com.gentorox.tools.NativeTool;

import java.util.*;

/**
 * Command-line interface for manually testing the InferenceService
 *
 * Usage:
 * 1. Set environment variables: OPENAI_API_KEY, GEMINI_API_KEY, etc.
 * 2. Run: mvn exec:java -Dexec.mainClass="com.gentorox.services.inference.InferenceServiceCLI" -Dexec.classpathScope=test
 * 3. Follow the interactive prompts
 */
public class InferenceServiceCLI {

    private static final Scanner scanner = new Scanner(System.in);

    public static void main(String[] args) {
        System.out.println("=== InferenceService CLI ===");
        System.out.println("Interactive testing interface for InferenceService");
        System.out.println();

        // Check environment variables
        checkEnvironmentVariables();

        // Main menu loop
        while (true) {
            System.out.println("\n--- Main Menu ---");
            System.out.println("1. Test OpenAI");
            System.out.println("2. Test Gemini");
            System.out.println("3. Test Tool Calling");
            System.out.println("4. Custom Test");
            System.out.println("5. Exit");
            System.out.print("Choose an option (1-5): ");

            String choice = scanner.nextLine().trim();

            switch (choice) {
                case "1":
                    testOpenAI();
                    break;
                case "2":
                    testGemini();
                    break;
                case "3":
                    testToolCalling();
                    break;
                case "4":
                    customTest();
                    break;
                case "5":
                    System.out.println("Goodbye!");
                    return;
                default:
                    System.out.println("Invalid option. Please choose 1-5.");
            }
        }
    }

    private static void checkEnvironmentVariables() {
        System.out.println("--- Environment Variables Check ---");

        String openaiKey = System.getenv("OPENAI_API_KEY");
        String geminiKey = System.getenv("GEMINI_API_KEY");
        String anthropicKey = System.getenv("ANTHROPIC_API_KEY");

        System.out.println("OPENAI_API_KEY: " + (openaiKey != null && !openaiKey.isEmpty() ? "SET" : "NOT SET"));
        System.out.println("GEMINI_API_KEY: " + (geminiKey != null && !geminiKey.isEmpty() ? "SET" : "NOT SET"));
        System.out.println("ANTHROPIC_API_KEY: " + (anthropicKey != null && !anthropicKey.isEmpty() ? "SET" : "NOT SET"));

        if (openaiKey == null || openaiKey.isEmpty()) {
            System.out.println("⚠️  Warning: OpenAI API key not set. OpenAI tests will fail.");
        }
        if (geminiKey == null || geminiKey.isEmpty()) {
            System.out.println("⚠️  Warning: Gemini API key not set. Gemini tests will fail.");
        }
    }

    private static void testOpenAI() {
        System.out.println("\n--- Testing OpenAI ---");

        if (System.getenv("OPENAI_API_KEY") == null || System.getenv("OPENAI_API_KEY").isEmpty()) {
            System.out.println("❌ OpenAI API key not set. Skipping test.");
            return;
        }

        try {
            ProviderConfig config = new ProviderConfig();
            ProviderConfig.ProviderSettings openaiSettings = new ProviderConfig.ProviderSettings();
            openaiSettings.setApiKey(System.getenv("OPENAI_API_KEY"));
            openaiSettings.setModelName("gpt-4o-mini");

            config.setProviders(Map.of("openai", openaiSettings));
            config.setDefaultProvider("openai");

            InferenceService service = new InferenceService(config);

            System.out.print("Enter your prompt: ");
            String prompt = scanner.nextLine();

            InferenceResponse response = service.sendRequest(prompt, List.of());

            System.out.println("✅ OpenAI test successful!");
            System.out.println("Response: " + response.content());
            System.out.println("Token usage: " + response.providerTraceId());

        } catch (Exception e) {
            System.out.println("❌ OpenAI test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void testGemini() {
        System.out.println("\n--- Testing Gemini ---");

        if (System.getenv("GEMINI_API_KEY") == null || System.getenv("GEMINI_API_KEY").isEmpty()) {
            System.out.println("❌ Gemini API key not set. Skipping test.");
            return;
        }

        try {
            ProviderConfig config = new ProviderConfig();
            ProviderConfig.ProviderSettings geminiSettings = new ProviderConfig.ProviderSettings();
            geminiSettings.setApiKey(System.getenv("GEMINI_API_KEY"));
            geminiSettings.setModelName("gemini-2.0-flash");

            config.setProviders(Map.of("gemini", geminiSettings));
            config.setDefaultProvider("gemini");

            InferenceService service = new InferenceService(config);

            System.out.print("Enter your prompt: ");
            String prompt = scanner.nextLine();

            InferenceResponse response = service.sendRequest(prompt, List.of());

            System.out.println("✅ Gemini test successful!");
            System.out.println("Response: " + response.content());
            System.out.println("Token usage: " + response.providerTraceId());

        } catch (Exception e) {
            System.out.println("❌ Gemini test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void testToolCalling() {
        System.out.println("\n--- Testing Tool Calling ---");

        // Choose provider
        System.out.println("Choose provider:");
        System.out.println("1. OpenAI");
        System.out.println("2. Gemini");
        System.out.print("Enter choice (1-2): ");

        String providerChoice = scanner.nextLine().trim();
        String provider = providerChoice.equals("2") ? "gemini" : "openai";

        if (provider.equals("openai") && (System.getenv("OPENAI_API_KEY") == null || System.getenv("OPENAI_API_KEY").isEmpty())) {
            System.out.println("❌ OpenAI API key not set. Cannot test OpenAI tool calling.");
            return;
        }

        if (provider.equals("gemini") && (System.getenv("GEMINI_API_KEY") == null || System.getenv("GEMINI_API_KEY").isEmpty())) {
            System.out.println("❌ Gemini API key not set. Cannot test Gemini tool calling.");
            return;
        }

        try {
            ProviderConfig config = new ProviderConfig();
            ProviderConfig.ProviderSettings settings = new ProviderConfig.ProviderSettings();

            if (provider.equals("openai")) {
                settings.setApiKey(System.getenv("OPENAI_API_KEY"));
                settings.setModelName("gpt-4o-mini");
            } else {
                settings.setApiKey(System.getenv("GEMINI_API_KEY"));
                settings.setModelName("gemini-2.0-flash");
            }

            config.setProviders(Map.of(provider, settings));
            config.setDefaultProvider(provider);

            InferenceService service = new InferenceService(config);

            // Define a calculator tool
            ToolSpec calculatorToolSpec = new ToolSpec(
                "calculator",
                "A tool to perform arithmetic operations",
                List.of(
                    new ToolSpec.Parameter("a", "number", true, "First number", null),
                    new ToolSpec.Parameter("b", "number", true, "Second number", null),
                    new ToolSpec.Parameter("operation", "string", true, "Operation (add, subtract, multiply, divide)", null)
                )
            );

          NativeTool calculatorTool = new NativeTool() {
            @Override public ToolSpec spec() { return calculatorToolSpec; }
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

            System.out.print("Enter a math problem (e.g., 'Calculate 5 + 3'): ");
            String prompt = scanner.nextLine();

            InferenceResponse response = service.sendRequest(prompt, null, List.of(calculatorTool));

            System.out.println("✅ Tool calling test successful!");
            System.out.println("Response: " + response.content());

            if (response.toolCall().isPresent()) {
                InferenceResponse.ToolCall toolCall = response.toolCall().get();
                System.out.println("🔧 Tool call detected:");
                System.out.println("  Tool: " + toolCall.toolName());
                System.out.println("  Args: " + toolCall.jsonArguments());
            } else {
                System.out.println("ℹ️  No tool call made (model responded directly)");
            }

            System.out.println("Token usage: " + response.providerTraceId());

        } catch (Exception e) {
            System.out.println("❌ Tool calling test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void customTest() {
        System.out.println("\n--- Custom Test ---");

        // Choose provider
        System.out.println("Choose provider:");
        System.out.println("1. OpenAI");
        System.out.println("2. Gemini");
        System.out.print("Enter choice (1-2): ");

        String providerChoice = scanner.nextLine().trim();
        String provider = providerChoice.equals("2") ? "gemini" : "openai";

        if (provider.equals("openai") && (System.getenv("OPENAI_API_KEY") == null || System.getenv("OPENAI_API_KEY").isEmpty())) {
            System.out.println("❌ OpenAI API key not set. Cannot test OpenAI.");
            return;
        }

        if (provider.equals("gemini") && (System.getenv("GEMINI_API_KEY") == null || System.getenv("GEMINI_API_KEY").isEmpty())) {
            System.out.println("❌ Gemini API key not set. Cannot test Gemini.");
            return;
        }

        try {
            ProviderConfig config = new ProviderConfig();
            ProviderConfig.ProviderSettings settings = new ProviderConfig.ProviderSettings();

            if (provider.equals("openai")) {
                settings.setApiKey(System.getenv("OPENAI_API_KEY"));
                settings.setModelName("gpt-4o-mini");
            } else {
                settings.setApiKey(System.getenv("GEMINI_API_KEY"));
                settings.setModelName("gemini-2.0-flash");
            }

            config.setProviders(Map.of(provider, settings));
            config.setDefaultProvider(provider);

            InferenceService service = new InferenceService(config);

            System.out.print("Enter your prompt: ");
            String prompt = scanner.nextLine();

            // Ask about tools
            System.out.print("Do you want to include tools? (y/n): ");
            String includeTools = scanner.nextLine().trim().toLowerCase();

            List<NativeTool> tools = List.of();
            if (includeTools.equals("y") || includeTools.equals("yes")) {
                // Define a simple tool
                final ToolSpec customTool = new ToolSpec(
                    "custom_tool",
                    "A custom tool for testing",
                    List.of(
                        new ToolSpec.Parameter("input", "string", true, "Input parameter", null)
                    )
                );
                tools = List.of(new NativeTool() {
                  @Override public ToolSpec spec() { return customTool; }
                  @Override public String execute(java.util.Map<String, Object> args) {
                    return "Hello, " + args.get("input");
                  }
                });
            }

            InferenceResponse response = service.sendRequest(prompt, tools);

            System.out.println("✅ Custom test successful!");
            System.out.println("Response: " + response.content());

            if (response.toolCall().isPresent()) {
                InferenceResponse.ToolCall toolCall = response.toolCall().get();
                System.out.println("🔧 Tool call detected:");
                System.out.println("  Tool: " + toolCall.toolName());
                System.out.println("  Args: " + toolCall.jsonArguments());
            }

            System.out.println("Token usage: " + response.providerTraceId());

        } catch (Exception e) {
            System.out.println("❌ Custom test failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
