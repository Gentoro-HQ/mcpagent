package com.gentorox.services.typescript;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import java.nio.file.Path;
import java.util.Map;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * HTTP client for the external TypeScript Runtime service.
 *
 * Features:
 * - Generate a TypeScript SDK from an OpenAPI specification by uploading a file.
 * - Execute short TypeScript code snippets using previously generated SDKs.
 *
 * Configuration:
 * - Base URL: environment variable TS_RUNTIME_URL (default: http://localhost:3000)
 *
 * This class is stateless and thread-safe.
 */
@Component
public class TypescriptRuntimeClient {
  private final WebClient web;

  /**
   * Creates a new client using the TS_RUNTIME_URL environment variable (or default).
   */
  public TypescriptRuntimeClient() {
    this.web = WebClient.builder()
        .baseUrl(System.getenv().getOrDefault("TS_RUNTIME_URL", "http://localhost:3000"))
        .build();
  }

  /**
   * Execute a short piece of TypeScript code on the runtime service.
   *
   * Sends a POST request to /run with JSON body: { "snippet": "<code>" }.
   * The response is deserialized into {@link RunResponse}.
   *
   * @param code TypeScript code to execute (non-null)
   * @return a reactive Mono emitting the {@link RunResponse} returned by the runtime
   */
  public Mono<RunResponse> exec(String code) {
    return web.post()
        .uri("/run")
        .contentType(MediaType.APPLICATION_JSON)
        .bodyValue(Map.of("snippet", code))
        .retrieve()
        .bodyToMono(RunResponse.class);
  }

  /**
   * Generate a TypeScript SDK by uploading a local OpenAPI file.
   *
   * Sends multipart/form-data to POST /sdk/upload with fields:
   * - spec: the OpenAPI YAML/JSON file (binary)
   * - outDir: desired output directory name on the runtime side
   *
   * @param specPath path to the local OpenAPI YAML/JSON file
   * @param outDir   desired output directory name on the runtime side
   * @return a reactive Mono emitting the {@link UploadResult} returned by the runtime
   */
  public Mono<UploadResult> uploadOpenapi(Path specPath, String outDir) {
    MultipartBodyBuilder mb1 = new MultipartBodyBuilder();
    mb1.part("spec", new FileSystemResource(specPath.toFile()));
    mb1.part("outDir", outDir);

    return web.post()
        .uri("/sdk/upload")
        .contentType(MediaType.MULTIPART_FORM_DATA)
        .body(BodyInserters.fromMultipartData(mb1.build()))
        .retrieve()
        .bodyToMono(UploadResult.class);
  }

  /**
   * Represents the JSON response shape returned by the `/run` endpoint.
   *
   * <p>This endpoint executes a code snippet and returns structured logs,
   * potential output values, and error information. A typical response
   * might look like:
   *
   * <pre>{@code
   * {
   *   "ok": true,
   *   "value": null,
   *   "logs": [
   *     { "level": "log", "args": ["hi"] }
   *   ],
   *   "error": null
   * }
   * }</pre>
   *
   * @param ok whether the execution completed successfully
   * @param value the returned value from the executed snippet, or {@code null} if none
   * @param logs a list of console log entries (stdout / stderr) emitted during execution
   * @param error an error message if execution failed, or {@code null} otherwise
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record RunResponse(
      boolean ok,
      Object value,
      List<LogEntry> logs,
      String error
  ) {}

  /**
   * Represents a single console log entry from a `/run` response.
   *
   * <p>Each log entry corresponds to one console output event and includes
   * the log level (e.g. "log", "warn", "error") and the arguments that were
   * printed in that call.
   *
   * <pre>{@code
   * {
   *   "level": "log",
   *   "args": ["hi"]
   * }
   * }</pre>
   *
   * @param level the console log level (e.g. "log", "warn", "error")
   * @param args the raw arguments passed to the console function
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record LogEntry(
      String level,
      List<String> args
  ) {}

  /**
   * Represents the JSON response shape returned by the `/sdk/upload` endpoint.
   *
   * <p>This endpoint uploads and registers an external SDK. Upon success,
   * it returns metadata about the generated SDK and a user-facing message.
   *
   * <pre>{@code
   * {
   *   "ok": true,
   *   "sdk": {
   *     "namespace": "simpleapi_5",
   *     "location": "/tmp/external-sdks/simpleapi_5",
   *     "entry": "file:///tmp/external-sdks/simpleapi_5/index.ts"
   *   },
   *   "message": "SDK generated and will be auto-loaded on /run under sdk.<namespace>"
   * }
   * }</pre>
   *
   * @param ok whether the SDK upload and generation completed successfully
   * @param sdk metadata describing the generated SDK (namespace, location, entry point)
   * @param message human-readable message describing the outcome
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record UploadResult(
      boolean ok,
      Sdk sdk,
      String message
  ) {}

  /**
   * Metadata describing a generated SDK artifact from the `/sdk/upload` response.
   *
   * <p>This object contains the internal namespace assigned to the SDK, the
   * filesystem location where it was stored, and the URI of its entry point file.
   *
   * <pre>{@code
   * {
   *   "namespace": "simpleapi_5",
   *   "location": "/tmp/external-sdks/simpleapi_5",
   *   "entry": "file:///tmp/external-sdks/simpleapi_5/index.ts"
   * }
   * }</pre>
   *
   * @param namespace the unique SDK namespace (used as identifier under {@code sdk.<namespace>})
   * @param location the absolute local directory path where the SDK is stored
   * @param entry the URI to the main entry file of the SDK
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Sdk(
      String namespace,
      String location,
      String entry
  ) {}
}
