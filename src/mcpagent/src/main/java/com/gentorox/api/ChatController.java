package com.gentorox.api;

import com.gentorox.core.model.InferenceRequest;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.services.agent.Orchestrator;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping(path = "/api", produces = MediaType.APPLICATION_JSON_VALUE)
public class ChatController {
  private final Orchestrator orchestrator;

  public ChatController(Orchestrator orchestrator) {
    this.orchestrator = orchestrator;
  }

  public record ChatRequest(String prompt, Map<String, Object> options) {}
  public record ChatResponse(String content, String traceId) {}

  @PostMapping(path = "/chat", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ChatResponse chat(@RequestBody ChatRequest request) {
    if (request == null || request.prompt() == null || request.prompt().isBlank()) {
      throw new IllegalArgumentException("prompt is required");
    }
    Map<String, Object> opts = request.options() == null ? Map.of() : request.options();
    InferenceResponse resp = orchestrator.run(List.of(new InferenceRequest.Message("user", request.prompt())), opts);
    return new ChatResponse(resp.content(), resp.providerTraceId());
  }
}


