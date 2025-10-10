package com.gentorox.controllers;

import com.gentorox.core.model.InferenceResponse;
import com.gentorox.orchestrator.Orchestrator;
import io.modelcontextprotocol.spec.McpSchema;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class GentoroMcpTool {
  private final Orchestrator orchestrator;
  public GentoroMcpTool(Orchestrator orchestrator) { this.orchestrator = orchestrator; }

  public McpSchema.Tool tool() {
    return McpSchema.Tool.builder()
        .name("gentoro.run")
        .description("Run an instruction using the Gentoro Agent. {provider, model, messages, options}")
        .inputSchema(new McpSchema.JsonSchema(
            "object",
            Map.of(
                "provider", Map.of("type", "string", "description", "one of: openai|gemini|anthropic"),
                "model", Map.of("type", "string"),
                "messages", Map.of("type", "array"),
                "options", Map.of("type", "object")
            ),
            List.of("provider","model","messages"),
            null, // additionalProperties
            null, // defs
            null  // definitions
        ))
        .build();
  }

  public Map<String, Object> handle(Map<String, Object> input) {
    String provider = (String) input.get("provider");
    String model = (String) input.get("model");
    @SuppressWarnings("unchecked")
    List<Map<String,Object>> raw = (List<Map<String,Object>>) input.get("messages");
    var messages = raw.stream().map(m -> new com.gentorox.core.model.InferenceRequest.Message(
        (String) m.get("role"), m.get("content"))).toList();
    @SuppressWarnings("unchecked")
    Map<String,Object> opts = (Map<String,Object>) input.getOrDefault("options", Map.of());
    InferenceResponse resp = orchestrator.run(provider, model, messages, opts);
    return Map.of(
        "content", resp.content(),
        "toolCall", resp.toolCall().map(tc -> Map.of("name", tc.toolName(), "args", tc.jsonArguments())).orElse(null),
        "traceId", resp.providerTraceId()
    );
  }
}
