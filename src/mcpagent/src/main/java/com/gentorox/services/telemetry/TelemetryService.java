package com.gentorox.services.telemetry;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.common.AttributesBuilder;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

import static com.gentorox.services.telemetry.TelemetryConstants.*;

/**
 * TelemetryService centralizes common tracing and metrics patterns used by the application.
 *
 * <p>It provides small, ergonomic helpers to:
 * - Create and run code in traced spans (root/server spans and internal spans).
 * - Count key domain events with OTEL metrics (prompts, tool calls, model calls).
 *
 * <p>Design goals:
 * - Safe defaults: methods are null-safe for optional parameters like session or attributes.
 * - Minimal overhead: helpers are thin wrappers over the OpenTelemetry API.
 * - Backwards compatible: existing method signatures remain, with additional overloads for convenience.
 */
@Component
public class TelemetryService {
  private final Tracer tracer;
  private final LongCounter promptsTotal;
  private final LongCounter toolCallsTotal;
  private final LongCounter modelCallsTotal;

  /**
   * Creates a TelemetryService using the application-wide {@link OpenTelemetry} instance.
   */
  public TelemetryService(OpenTelemetry openTelemetry) {
    this.tracer = openTelemetry.getTracer(TRACER);
    Meter meter = openTelemetry.meterBuilder(METER).build();
    this.promptsTotal = meter
        .counterBuilder("com.gentorox.prompts.total")
        .setDescription("Total prompts received")
        .build();
    this.toolCallsTotal = meter
        .counterBuilder("com.gentorox.tool.calls.total")
        .setDescription("Tool calls executed")
        .build();
    this.modelCallsTotal = meter
        .counterBuilder("com.gentorox.model.calls.total")
        .setDescription("Model calls executed")
        .build();
  }

  // ---------- Tracing helpers ----------

  /**
   * Runs the supplied body within a root/server span.
   *
   * @param session optional logical session; if provided, its id is attached as an attribute.
   * @param name span name
   * @param attrs optional attributes to set on the span
   * @param body code to execute within the span's scope
   * @return the value returned by body
   * @throws RuntimeException rethrown after being recorded on the span
   */
  public <T> T runRoot(TelemetrySession session, String name, Map<String, String> attrs, Supplier<T> body) {
    Objects.requireNonNull(name, "span name");
    Objects.requireNonNull(body, "body");

    SpanBuilder spanBuilder = tracer.spanBuilder(name).setSpanKind(SpanKind.SERVER);
    applySpanAttributes(spanBuilder, session, attrs);

    Span span = spanBuilder.startSpan();
    try (Scope ignored = span.makeCurrent()) {
      return body.get();
    } catch (RuntimeException e) {
      span.recordException(e);
      span.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR);
      throw e;
    } finally {
      span.end();
    }
  }

  /**
   * Overload for {@link #runRoot(TelemetrySession, String, Map, Supplier)} without attributes.
   */
  public <T> T runRoot(TelemetrySession session, String name, Supplier<T> body) {
    return runRoot(session, name, Collections.emptyMap(), body);
  }

  /**
   * Runnable overload for server span.
   */
  public void runRoot(TelemetrySession session, String name, Map<String, String> attrs, Runnable body) {
    runRoot(session, name, attrs, () -> {
      body.run();
      return null;
    });
  }

  /**
   * Runnable overload without attributes.
   */
  public void runRoot(TelemetrySession session, String name, Runnable body) {
    runRoot(session, name, Collections.emptyMap(), body);
  }

  /**
   * Runs the supplied body within an internal span (child of current context).
   */
  public <T> T inSpan(TelemetrySession session, String name, Map<String, String> attrs, Supplier<T> body) {
    Objects.requireNonNull(name, "span name");
    Objects.requireNonNull(body, "body");

    SpanBuilder spanBuilder = tracer.spanBuilder(name).setSpanKind(SpanKind.INTERNAL);
    applySpanAttributes(spanBuilder, session, attrs);

    Span span = spanBuilder.startSpan();
    try (Scope ignored = span.makeCurrent()) {
      return body.get();
    } catch (RuntimeException e) {
      span.recordException(e);
      span.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR);
      throw e;
    } finally {
      span.end();
    }
  }

  /** Overload without attributes for internal span. */
  public <T> T inSpan(TelemetrySession session, String name, Supplier<T> body) {
    return inSpan(session, name, Collections.emptyMap(), body);
  }

  /** Runnable overload for internal span. */
  public void inSpan(TelemetrySession session, String name, Map<String, String> attrs, Runnable body) {
    inSpan(session, name, attrs, () -> {
      body.run();
      return null;
    });
  }

  /** Runnable overload without attributes for internal span. */
  public void inSpan(TelemetrySession session, String name, Runnable body) {
    inSpan(session, name, Collections.emptyMap(), body);
  }

  // ---------- Metrics helpers ----------

  /**
   * Counts a prompt event with optional session/provider/model attributes.
   */
  public void countPrompt(TelemetrySession session, String provider, String model) {
    Attributes attributes = buildMetricAttributes(session, Map.of(
        ATTR_PROVIDER, provider,
        ATTR_MODEL, model
    ));
    promptsTotal.add(1, attributes);
  }

  /**
   * Counts a tool call with optional session attribute.
   */
  public void countTool(TelemetrySession session, String toolName) {
    Attributes attributes = buildMetricAttributes(session, Map.of(
        ATTR_TOOL, toolName
    ));
    toolCallsTotal.add(1, attributes);
  }

  /**
   * Counts a model call with optional session/provider/model attributes.
   */
  public void countModelCall(TelemetrySession session, String provider, String model) {
    Attributes attributes = buildMetricAttributes(session, Map.of(
        ATTR_PROVIDER, provider,
        ATTR_MODEL, model
    ));
    modelCallsTotal.add(1, attributes);
  }

  // ---------- Internal helpers ----------

  private static void applySpanAttributes(SpanBuilder spanBuilder, TelemetrySession session, Map<String, String> attrs) {
    if (session != null && session.id() != null) {
      spanBuilder.setAttribute(ATTR_SESSION_ID, session.id());
    }
    if (attrs != null) {
      attrs.forEach((k, v) -> {
        if (k != null && v != null) {
          spanBuilder.setAttribute(AttributeKey.stringKey(k), v);
        }
      });
    }
  }

  private static Attributes buildMetricAttributes(TelemetrySession session, Map<String, String> attrs) {
    AttributesBuilder builder = Attributes.builder();
    if (session != null && session.id() != null) {
      builder.put(AttributeKey.stringKey(ATTR_SESSION_ID), session.id());
    }
    if (attrs != null) {
      attrs.forEach((k, v) -> {
        if (k != null && v != null) {
          builder.put(AttributeKey.stringKey(k), v);
        }
      });
    }
    return builder.build();
  }
}
