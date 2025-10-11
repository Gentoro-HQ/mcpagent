package com.gentorox.controllers;

import com.gentorox.core.model.InferenceResponse;
import com.gentorox.orchestrator.Orchestrator;
// MCP dependencies are temporarily disabled due to dependency issues
// import io.modelcontextprotocol.core.Tool;
// import io.modelcontextprotocol.core.ToolHandler;
// import io.modelcontextprotocol.core.types.StructuredValue;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

// Temporarily disabled due to MCP dependency issues
// @Component
public class GentoroMcpTool /* implements ToolHandler */ {
  private final Orchestrator orchestrator;
  public GentoroMcpTool(Orchestrator orchestrator) { this.orchestrator = orchestrator; }

  // Temporarily disabled due to MCP dependency issues
  /*
  @Override
  public Tool tool() {
    return Tool.builder().name("gentoro.run")
        .description("Run an instruction using the Gentoro Agent. {provider, model, messages, options}")
        .inputSchema(Map.of(
            "type","object",
            "required", List.of("provider","model","messages"),
            "properties", Map.of(
                "provider", Map.of("type","string","description","AI model provider (e.g., openai, anthropic, gemini)"),
                "model", Map.of("type","string"),
                "messages", Map.of("type","array"),
                "options", Map.of("type","object")
            )
        )).build();
  }

  @Override
  public StructuredValue handle(StructuredValue input) {
    var map = input.asMap();
    String provider = (String) map.get("provider");
    String model = (String) map.get("model");
    @SuppressWarnings("unchecked")
    List<Map<String,Object>> raw = (List<Map<String,Object>>) map.get("messages");
    var messages = raw.stream().map(m -> new com.gentorox.core.model.InferenceRequest.Message(
        (String) m.get("role"), m.get("content"))).toList();
    @SuppressWarnings("unchecked")
    Map<String,Object> opts = (Map<String,Object>) map.getOrDefault("options", Map.of());
    InferenceResponse resp = orchestrator.run(provider, model, messages, opts);
    return StructuredValue.fromMap(Map.of(
        "content", resp.content(),
        "toolCall", resp.toolCall().map(tc -> Map.of("name", tc.toolName(), "args", tc.jsonArguments())).orElse(null),
        "traceId", resp.providerTraceId()
    ));
  }
  */
}
