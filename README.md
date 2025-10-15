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

### Pull and Run Pre-built Images

```bash
# Pull and run the latest image
docker pull admingentoro/gentoro:latest
docker run -p 8080:8080 -e OPENAI_API_KEY=your-key admingentoro/gentoro:latest
```

### Build Images Locally

#### 1. Build Base Image
The base image contains the runtime environment (JRE 21, Node.js, OpenAPI Generator CLI, OpenTelemetry Collector):

```bash
# Build base image with default version (latest)
./scripts/docker/build-base.sh

# Build base image with specific version
./scripts/docker/build-base.sh v1.0.0

# Build for specific platform only
./scripts/docker/build-base.sh latest "" "" --platform linux/amd64

# Build and push to registry
./scripts/docker/build-base.sh latest --push
```

#### 2. Build Product Image
The product image contains the MCP Agent application built on the base image:

```bash
# Build product image with default version (dev)
./scripts/docker/build-product.sh

# Build product image with specific version
./scripts/docker/build-product.sh v1.0.0

# Build with specific JAR file
./scripts/docker/build-product.sh v1.0.0 mcpagent-0.1.0-SNAPSHOT.jar

# Build and push to registry
./scripts/docker/build-product.sh v1.0.0 "" --push
```

#### 3. Build Both Images
```bash
# Build both base and product images
./scripts/docker/build-base.sh latest
./scripts/docker/build-product.sh latest

# Or use the publish script to build and push both
./scripts/docker/publish.sh v1.0.0
```

### Run Container in Dependencies Mode

For local development, you can run the container in dependencies mode to start only the supporting services (OpenTelemetry Collector, TypeScript Runtime, ACME Analytics Service) while running the main MCP Agent application locally.

#### Start Dependencies Container
```bash
# Run container with only dependencies (excludes the main app)
docker run -d \
  --name mcpagent-deps \
  -p 4317:4317 \    # OpenTelemetry Collector OTLP gRPC
  -p 4318:4318 \    # OpenTelemetry Collector OTLP HTTP
  -p 7070:7070 \    # TypeScript Runtime
  -p 8082:8082 \    # ACME Analytics Service (mock server)
  admingentoro/gentoro:latest otel-only ts-only mock-only
```

#### Alternative: Use Environment Variables
```bash
# Run with specific services disabled
docker run -d \
  --name mcpagent-deps \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 7070:7070 \
  -p 8082:8082 \
  -e DISABLE_SERVICES=app \
  admingentoro/gentoro:latest
```

#### Run MCP Agent Locally
With the dependencies container running, you can now run the MCP Agent application locally:

```bash
# Set environment variables to use containerized dependencies
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export TS_RUNTIME_URL=http://localhost:7070

# Run the application locally
cd src/mcpagent
./mvnw spring-boot:run
```

#### Port Mappings
- **4317**: OpenTelemetry Collector OTLP gRPC endpoint
- **4318**: OpenTelemetry Collector OTLP HTTP endpoint  
- **7070**: TypeScript Runtime service
- **8082**: ACME Analytics Service (mock server)
- **8080**: Main MCP Agent application (when running full container)

#### Stop Dependencies Container
```bash
# Stop and remove the dependencies container
docker stop mcpagent-deps
docker rm mcpagent-deps
```

### Test Services
```bash
# Test all services in the container
./scripts/docker/validate-services.sh latest linux/amd64
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
