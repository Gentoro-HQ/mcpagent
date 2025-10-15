package com.gentorox.services.agent;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceRequest;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.services.inference.InferenceService;
import com.gentorox.services.knowledgebase.KnowledgeBaseEntry;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.services.telemetry.LogContext;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import com.gentorox.tools.NativeTool;
import com.gentorox.tools.NativeToolsRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Default Orchestrator implementation.
 *
 * Responsibilities:
 * 1) Accept intent messages from clients via MCP
 * 2) Build a personalized system prompt augmented with KB inventory and service list
 * 3) Retrieve available native tools
 * 4) Validate request against guardrails
 * 5) Call the InferenceService and return the response
 * 6) Emit telemetry spans and meters for each stage
 */
@Service
public class OrchestratorImpl implements Orchestrator {
  private static final Logger LOG = LoggerFactory.getLogger(OrchestratorImpl.class);

  private final AgentService agentService;
  private final KnowledgeBaseService kbService;
  private final InferenceService inferenceService;
  private final TelemetryService telemetry;
  private final NativeToolsRegistry nativeToolsRegistry;

  public OrchestratorImpl(AgentService agentService,
                          KnowledgeBaseService kbService,
                          InferenceService inferenceService,
                          TelemetryService telemetry,
                          NativeToolsRegistry nativeToolsRegistry) {
    this.agentService = Objects.requireNonNull(agentService, "agentService");
    this.kbService = Objects.requireNonNull(kbService, "kbService");
    this.inferenceService = Objects.requireNonNull(inferenceService, "inferenceService");
    this.telemetry = Objects.requireNonNull(telemetry, "telemetry");
    this.nativeToolsRegistry = nativeToolsRegistry;
  }

  @Override
  public InferenceResponse run(List<InferenceRequest.Message> messages, Map<String, Object> options) {
    var session = TelemetrySession.create();
    try (var ignored = new LogContext(session)) {
      return telemetry.runRoot(session, "orchestrator.run", Map.of(), () -> doRun(session, messages, options));
    }
  }

  private InferenceResponse doRun(TelemetrySession session, List<InferenceRequest.Message> messages, Map<String, Object> options) {
    // Defensive copies
    final List<InferenceRequest.Message> msgs = messages == null ? List.of() : List.copyOf(messages);
    final Map<String, Object> opts = options == null ? Map.of() : Map.copyOf(options);

    // Step 1: extract primary user intent
    String userPrompt = extractUserPrompt(msgs);

    // Step 2: build personalized system prompt with KB and services
    String systemPrompt = telemetry.inSpan(session, "orchestrator.buildSystemPrompt", this::buildSystemPrompt);

    // Step 4: guardrails validation (minimal example; can be extended)
    telemetry.inSpan(session, "orchestrator.guardrails", () -> {
      String guardrails = agentService.guardrails();
      if (guardrails != null && !guardrails.isBlank()) {
        // Minimal deny example: if guardrails contains a line "deny:" followed by a keyword present in prompt
        if (!allowByGuardrails(guardrails, userPrompt)) {
          throw new IllegalArgumentException("Request rejected by guardrails");
        }
      }
    });

    // Step 5: call inference service
    telemetry.countPrompt(session, "gentoro", "agent");
    // Build a safe registry excluding tools whose spec() throws
    NativeToolsRegistry safeRegistry = null;
    if (nativeToolsRegistry != null) {
      List<NativeTool> safeTools = nativeToolsRegistry.currentTools().stream()
          .filter(Objects::nonNull)
          .filter(t -> safeSpec(t) != null)
          .collect(Collectors.toList());
      safeRegistry = new NativeToolsRegistry(safeTools);
    }

    final NativeToolsRegistry sr = safeRegistry;
    InferenceResponse response = telemetry.inSpan(session, "orchestrator.infer", () ->
        inferenceService.sendRequest(
            formatFinalPrompt(systemPrompt, userPrompt, msgs),
            sr,
            List.of()
        ));
    telemetry.countModelCall(session, "model", "chat");
    return response;
  }

  private String extractUserPrompt(List<InferenceRequest.Message> msgs) {
    return msgs.stream()
        .filter(m -> "user".equalsIgnoreCase(m.role()))
        .map(m -> String.valueOf(m.content()))
        .findFirst()
        .orElse("");
  }

  private ToolSpec safeSpec(NativeTool t) {
    try { return t.spec(); } catch (Exception e) { LOG.warn("Failed to read tool spec {}", t, e); return null; }
  }

  private String buildSystemPrompt() {
    String base = agentService.systemPrompt();

    // Compress KB: only list resource + hint
    List<KnowledgeBaseEntry> kb = kbService.list("");
    String kbSummary = kb.stream()
        .map(e -> String.format("- %s :: %s", e.resource(), optional(e.hint())))
        .collect(Collectors.joining("\n"));

    // List of available services (heuristic: entries under kb://openapi or sdk names in hints)
    List<String> services = kb.stream()
        .filter(e -> e.resource() != null && e.resource().startsWith("kb://openapi"))
        .map(KnowledgeBaseEntry::resource)
        .sorted()
        .toList();

    String toolsSummary = "";
    if (nativeToolsRegistry != null) {
      toolsSummary = nativeToolsRegistry.currentTools().stream()
          .map(this::safeSpec)
          .filter(Objects::nonNull)
          .map(ts -> String.format("- %s :: %s", ts.name(), optional(ts.description())))
          .collect(Collectors.joining("\n"));
    }

    StringBuilder sb = new StringBuilder();
    sb.append(base == null ? "" : base);
    sb.append("\n\nKnowledge Base (resources):\n").append(kbSummary);
    sb.append("\n\nAvailable Services:\n").append(String.join("\n", services));
    sb.append("\n\nAvailable Tools:\n").append(toolsSummary);
    return sb.toString();
  }

  private boolean allowByGuardrails(String guardrails, String prompt) {
    // Extremely simple example: if guardrails contains lines like "deny: keyword"
    // and prompt contains that keyword, reject. Otherwise allow.
    for (String line : guardrails.split("\n")) {
      String s = line.trim();
      if (s.toLowerCase(Locale.ROOT).startsWith("deny:")) {
        String kw = s.substring(5).trim();
        if (!kw.isEmpty() && prompt.toLowerCase(Locale.ROOT).contains(kw.toLowerCase(Locale.ROOT))) {
          return false;
        }
      }
    }
    return true;
  }

  private String optional(String s) { return s == null ? "" : s; }

  private String formatFinalPrompt(String systemPrompt, String userPrompt, List<InferenceRequest.Message> msgs) {
    String conversation = msgs.stream()
        .map(m -> String.format("%s: %s", m.role(), String.valueOf(m.content())))
        .collect(Collectors.joining("\n"));
    return systemPrompt + "\n\n---\nConversation:\n" + conversation + "\n\nUser intent:\n" + userPrompt;
  }
}
