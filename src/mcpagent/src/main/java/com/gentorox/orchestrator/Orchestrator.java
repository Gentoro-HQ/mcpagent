package com.gentorox.orchestrator;

import com.gentorox.core.api.ModelProvider;
import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceRequest;
import com.gentorox.core.model.InferenceResponse;
import com.gentorox.services.kb.ContextBuilder;
import com.gentorox.services.kb.Retriever;
import com.gentorox.services.telemetry.LogContext;
import com.gentorox.services.telemetry.TelemetryConstants;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import com.gentorox.tools.NativeToolsRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class Orchestrator {
  private final java.util.Map<String, ModelProvider> providers;
  private final NativeToolsRegistry tools;
  private final Retriever retriever;
  private final ContextBuilder contextBuilder;
  private final TelemetryService telemetry;
  private final int autoContextTopK;
  private final boolean autoContextEnabled;
  private final String providerId;
  private final String model;

  public Orchestrator(
      java.util.List<ModelProvider> providers, NativeToolsRegistry tools, Retriever retriever, ContextBuilder contextBuilder,
      TelemetryService telemetry,
      @Value("${inference.provider:openai}") String providerId,
      @Value("${inference.model:gpt-5-mini}") String model,
      @Value("${kb.autoContext.enabled:true}") boolean autoContextEnabled,
      @Value("${kb.autoContext.topK:4}") int autoContextTopK
  ) {
    this.providers = providers.stream().collect(java.util.stream.Collectors.toMap(ModelProvider::id, p -> p));
    this.tools = tools; this.retriever = retriever; this.contextBuilder = contextBuilder; this.telemetry = telemetry;
    this.autoContextEnabled = autoContextEnabled; this.autoContextTopK = autoContextTopK;
    this.providerId = providerId; this.model = model;
  }

  public InferenceResponse run(List<InferenceRequest.Message> messages, java.util.Map<String,Object> opts) {
    var session = TelemetrySession.create();
    try (var mdc = new LogContext(session)) {
      return telemetry.runRoot(session, "orchestrator.run",
          java.util.Map.of(
              TelemetryConstants.ATTR_PROVIDER, providerId,
              TelemetryConstants.ATTR_MODEL, model), () -> {

        telemetry.countPrompt(session, providerId, model);
            List<InferenceRequest.Message> finalMessages = messages;
            if (autoContextEnabled && !messages.isEmpty()) {
              String lastUser = messages.get(messages.size()-1).content().toString();
              var ctxText = telemetry.inSpan(session, "kb.retrieve", java.util.Map.of(TelemetryConstants.ATTR_MODEL, model),
                  () -> { var chunks = retriever.query(lastUser, autoContextTopK); return contextBuilder.buildPromptBlocks(chunks); });
              finalMessages = new java.util.ArrayList<>(messages.size()+1);
              finalMessages.add(new InferenceRequest.Message("system", ctxText));
              finalMessages.addAll(messages);
            }

            var req = new InferenceRequest(model, finalMessages, opts);
            java.util.List<ToolSpec> availableTools = tools.currentToolSpecs();
            return telemetry.inSpan(session, "model.infer",
                java.util.Map.of(TelemetryConstants.ATTR_PROVIDER, providerId, TelemetryConstants.ATTR_MODEL, model),
                () -> providers.get(providerId).infer(req, availableTools));
          });
    }
  }
}
