package com.gentorox.services.agent;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.services.inference.InferenceService;
import com.gentorox.services.knowledgebase.KnowledgeBaseEntry;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.tools.NativeTool;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AgentService.
 *
 * Rationale:
 * - Validate configuration lifecycle (initialize → getConfig) including pre-initialization guard.
 * - Verify YAML parsing/merging behavior, including options-merge semantics by name.
 * - Ensure system prompt placeholder resolution for native tools by class name, tool name, and FQCN fallback.
 * - Confirm AutoGen guardrails path calls InferenceService with a composed prompt and KB-derived services list.
 * - Validate resilience when KnowledgeBase errors occur (gracefully continue with empty services list).
 * - Validate convenience accessors systemPrompt() and guardrails().
 */
public class AgentServiceTest {

  InferenceService inference;
  KnowledgeBaseService kb;
  NativeTool toolA;
  NativeTool toolB;

  // Concrete test tools to ensure class simple names are available for placeholder resolution
  static class CalculatorTool implements NativeTool {
    @Override public ToolSpec spec() { return new ToolSpec("Calculator", "Do math", List.of()); }
    @Override public String execute(java.util.Map<String, Object> args) { return ""; }
  }
  static class WeatherTool implements NativeTool {
    @Override public ToolSpec spec() { return new ToolSpec("Weather", "Report weather", List.of()); }
    @Override public String execute(java.util.Map<String, Object> args) { return ""; }
  }

  @BeforeEach
  void setUp() {
    inference = mock(InferenceService.class);
    kb = mock(KnowledgeBaseService.class);
    toolA = new CalculatorTool();
    toolB = new WeatherTool();
  }

  @Test
  @DisplayName("getConfig() before initialize() throws a clear IllegalStateException")
  void getConfigBeforeInitThrows() {
    AgentService svc = new AgentService(inference, kb, List.of());
    IllegalStateException ex = assertThrows(IllegalStateException.class, svc::getConfig);
    assertTrue(ex.getMessage().contains("AgentService not initialized"));
  }

  @Test
  @DisplayName("initialize() loads defaults without overrides, no autogen when autoGen=false")
  void initializeDefaultsNoAutogen(@TempDir Path tmp) throws IOException {
    // Create a minimal foundation with no overrides file
    Files.createDirectories(tmp);

    AgentService svc = new AgentService(inference, kb, List.of(toolA, toolB));

    // KB returns a couple of openapi entries; they should not be used unless autogen=true
    when(kb.list("kb://openapi")).thenReturn(List.of(
        new KnowledgeBaseEntry("kb://openapi/petstore.yaml", null, ""),
        new KnowledgeBaseEntry("kb://openapi/billing.yaml", "payments", "")
    ));

    svc.initialize(tmp);

    AgentService.AgentConfig cfg = svc.getConfig();
    // We don't know internal defaults; assert non-crash and convenience accessors are consistent
    assertEquals(cfg.systemPrompt(), svc.systemPrompt());
    assertEquals(Optional.ofNullable(cfg.guardrails()).map(AgentService.AgentConfig.Guardrails::content).orElse(""), svc.guardrails());

    // No autogen should have been triggered; InferenceService not called
    verify(inference, never()).sendRequest(anyString(), anyList());
  }

  @Test
  @DisplayName("Placeholder resolution uses class simple name, tool name, and FQCN fallback")
  void placeholderResolution(@TempDir Path tmp) throws IOException {
    // Create foundation override to set a prompt with placeholders
    String yaml = """
        agent:
          systemPrompt: |
            Use {{ tool.CalculatorTool.name }}: {{ tool.CalculatorTool.description }}
            Also by name: {{ tool.Weather.name }}
            FQCN: {{ tool.com.example.tools.CalculatorTool.name }}
          guardrails:
            autoGen: false
        """;
    Path overrides = tmp.resolve("agent.yaml");
    Files.writeString(overrides, yaml);

    AgentService svc = new AgentService(inference, kb, List.of(toolA, toolB));
    when(kb.list("kb://openapi")).thenReturn(List.of());

    svc.initialize(tmp);

    String sp = svc.systemPrompt();
    assertTrue(sp.contains("Use Calculator: Do math"));
    assertTrue(sp.contains("Also by name: Weather"));
    assertTrue(sp.contains("FQCN: Calculator"));
  }

  @Test
  @DisplayName("Merge precedence: overrides beat base; options merged by name with override replacement")
  void mergeOptionsPrecedence(@TempDir Path tmp) throws IOException {
    // Base config resides on classpath; we can't alter it, so we simulate by asserting merge behavior with overrides-only options
    String yaml = """
        agent:
          systemPrompt: base is overridden
          inference:
            provider: openai
            model: gpt-4o
            options:
              - name: temperature
                value: 0.2
              - name: max_tokens
                value: 1000
          guardrails:
            autoGen: false
            content: Do not leak secrets
        """;
    Path overrides = tmp.resolve("agent.yaml");
    Files.writeString(overrides, yaml);

    AgentService svc = new AgentService(inference, kb, List.of());
    when(kb.list("kb://openapi")).thenReturn(List.of());
    svc.initialize(tmp);

    AgentService.AgentConfig cfg = svc.getConfig();
    assertEquals("base is overridden", cfg.systemPrompt());
    assertNotNull(cfg.inference());
    assertEquals("openai", cfg.inference().provider());
    assertEquals("gpt-4o", cfg.inference().model());

    // options should preserve order of insertion by name merge; since only overrides provided here, we just verify both present
    assertNotNull(cfg.inference().options());
    assertEquals(2, cfg.inference().options().size());
    assertEquals("temperature", cfg.inference().options().get(0).name());
    assertEquals(0.2, cfg.inference().options().get(0).value());
    assertEquals("max_tokens", cfg.inference().options().get(1).name());
    assertEquals(1000, cfg.inference().options().get(1).value());
  }

  @Test
  @DisplayName("AutoGen true composes prompt with KB services and sets guardrails from inference response")
  void autogenGuardrails(@TempDir Path tmp) throws IOException {
    String yaml = """
        agent:
          systemPrompt: Base SP
          guardrails:
            autoGen: true
            content: Additional guard lines
        """;
    Path overrides = tmp.resolve("agent.yaml");
    Files.writeString(overrides, yaml);

    AgentService svc = new AgentService(inference, kb, List.of());

    when(kb.list("kb://openapi")).thenReturn(List.of(
        new KnowledgeBaseEntry("kb://openapi/payments.yaml", "", ""),
        new KnowledgeBaseEntry("kb://openapi/catalog.yaml", "", "")
    ));

    when(inference.sendRequest(anyString(), anyList())).thenAnswer(inv -> {
      String prompt = inv.getArgument(0, String.class);
      // The composed prompt should include base SP, additional content mention, and service names
      assertTrue(prompt.contains("Base SP"));
      assertTrue(prompt.contains("Additional guardrails instructions"));
      assertTrue(prompt.contains("payments.yaml"));
      assertTrue(prompt.contains("catalog.yaml"));
      return new InferenceResponse("FINAL GUARDRAILS", Optional.empty(), "");
    });

    svc.initialize(tmp);

    String finalGuardrails = svc.guardrails();
    assertEquals("FINAL GUARDRAILS", finalGuardrails);
  }

  @Test
  @DisplayName("KB listing exception during autogen path is handled gracefully and still calls inference with empty services list")
  void autogenHandlesKbFailure(@TempDir Path tmp) throws IOException {
    String yaml = """
        agent:
          systemPrompt: Base SP
          guardrails:
            autoGen: true
        """;
    Path overrides = tmp.resolve("agent.yaml");
    Files.writeString(overrides, yaml);

    AgentService svc = new AgentService(inference, kb, List.of());

    when(kb.list("kb://openapi")).thenThrow(new RuntimeException("boom"));

    when(inference.sendRequest(anyString(), anyList())).thenAnswer(inv -> {
      String prompt = inv.getArgument(0, String.class);
      // Should not contain any services list items
      assertFalse(prompt.contains("- kb://openapi"));
      return new InferenceResponse("G", Optional.empty(), "");
    });

    svc.initialize(tmp);
    assertEquals("G", svc.guardrails());
  }
}
