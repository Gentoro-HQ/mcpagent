package com.gentorox.services.telemetry;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.metrics.OtlpGrpcMetricExporter;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.metrics.SdkMeterProvider;
import io.opentelemetry.sdk.metrics.export.PeriodicMetricReader;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

// Temporarily disabled due to OpenTelemetry dependency issues
// @Configuration
public class TelemetryConfig /* implements InitializingBean */ {
  @Value("${otel.service.name:mcpagent}")
  String serviceName;

  @Value("${OTEL_EXPORTER_OTLP_ENDPOINT:}")
  String otlpEndpoint;

  // Temporarily disabled due to OpenTelemetry dependency issues
  /*
  @Override
  public void afterPropertiesSet() {
    var resource = Resource.getDefault().merge(Resource.create(
        Attributes.builder()
            .put("service.name", serviceName)
            .put("service.version", System.getenv().getOrDefault("BUILD_VERSION", "dev"))
            .build()));

    var endpoint = (otlpEndpoint == null || otlpEndpoint.isBlank()) ? "http://localhost:4317" : otlpEndpoint;

    var spanExporter = OtlpGrpcSpanExporter.builder().setEndpoint(endpoint).build();
    var tracerProvider = SdkTracerProvider.builder()
        .addSpanProcessor(BatchSpanProcessor.builder(spanExporter).build())
        .setResource(resource)
        .build();

    var metricExporter = OtlpGrpcMetricExporter.builder().setEndpoint(endpoint).build();
    var meterProvider = SdkMeterProvider.builder()
        .setResource(resource)
        .registerMetricReader(PeriodicMetricReader.builder(metricExporter).build())
        .build();

    OpenTelemetry otel = OpenTelemetrySdk.builder()
        .setTracerProvider(tracerProvider)
        .setMeterProvider(meterProvider)
        .build();

    GlobalOpenTelemetry.set(otel);
  }
  */
}
