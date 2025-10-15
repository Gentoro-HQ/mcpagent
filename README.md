# Gentoro MCP Agent (Product module)

This is a ready-to-run Spring Boot project (Java 21) exposing an MCP HTTP Streamable endpoint at `/mcp`,
with providers for OpenAI, Gemini, and Anthropic using their official Java SDKs.

## Quickstart

```bash
cd product
./mvnw -q -DskipTests package
java -jar target/mcpagent-0.1.0-SNAPSHOT.jar
```

Or with process modes:

```bash
java -jar target/mcpagent-0.1.0-SNAPSHOT.jar --process=validate
java -jar target/mcpagent-0.1.0-SNAPSHOT.jar --process=test_suite
java -jar target/mcpagent-0.1.0-SNAPSHOT.jar --process=mock-server --tcp-port=8082
```

## Docker

Docker images are available for multiple platforms (amd64, arm64):

```bash
# Pull and run the latest image
docker pull admingentoro/gentoro:latest
docker run -p 8080:8080 -e OPENAI_API_KEY=your-key admingentoro/gentoro:latest

# Build locally
./scripts/docker/build-base.sh latest
./scripts/docker/build-product.sh latest

# Test services
./scripts/docker/test-services.sh
```

## Environment

- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4317`)
- `TS_RUNTIME_URL` (default `http://localhost:7070`)
- `FOUNDATION_DIR` (default `/var/foundation`)

## Telemetry

Logback forwards logs to OpenTelemetry via the `OpenTelemetryAppender` and console output.
Traces/metrics/logs are exported to OTLP.

## MCP

The tool `gentoro.run` accepts `{ provider, model, messages, options }` and returns `{ content, toolCall, traceId }`.
