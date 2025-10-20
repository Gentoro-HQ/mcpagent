package com.gentorox.tools;

import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.P;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collections;
import reactor.core.scheduler.Schedulers;
import java.util.Map;
import java.util.concurrent.*;

@Component
public class RunTsCodeTool implements AgentTool {
  private final TypescriptRuntimeClient ts;
  private final TelemetryService telemetry;

  // One shared pool for bridging; daemon threads so they don't block shutdown.
  private static final ExecutorService TOOL_EXEC =
      new ThreadPoolExecutor(
          0, Math.max(4, Runtime.getRuntime().availableProcessors()),
          60L, TimeUnit.SECONDS,
          new SynchronousQueue<>(),
          r -> {
            Thread t = new Thread(r, "run-ts-bridge");
            t.setDaemon(true);
            return t;
          });

  // Reasonable upper bound so a stuck script doesn't pin a request forever.
  private static final long TIMEOUT_SECONDS = 60;

  public RunTsCodeTool(TypescriptRuntimeClient ts, TelemetryService telemetry) {
    this.ts = ts; this.telemetry = telemetry;
  }


  @Tool(name="RunTypescriptSnippet", value = "Execute a short TypeScript snippet in the isolated runtime and return stdout/result")
  public String runTsCode(@P("TypeScript code to execute") String code) {
    Callable<String> task = () -> telemetry.inSpan("tool.execute", Map.of("tool", "runTsCode"), () -> {
      TypescriptRuntimeClient.RunResponse r = ts.exec(code)
          .onErrorResume(e -> {
            StringWriter sw = new StringWriter(4096);
            try (PrintWriter pw = new PrintWriter(sw)) {
              e.printStackTrace(pw);
            }
            return Mono.just(new TypescriptRuntimeClient.RunResponse(
                false, null, Collections.emptyList(), sw.toString()));
          })
          .block(); // runs on a worker if we're bridging (safe), or on a non-reactor thread

      if (r == null || r.value() == null) return "(no result)";
      return (String) r.value();
    });

    try {
      // If we're on a Reactor non-blocking thread (e.g., reactor-http-nio-*), offload first.
      if (Schedulers.isInNonBlockingThread()) {
        return TOOL_EXEC.submit(task).get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
      }
      // Otherwise it's safe to run synchronously.
      return task.call();
    } catch (TimeoutException te) {
      return "(timeout after " + TIMEOUT_SECONDS + "s)";
    } catch (ExecutionException ee) {
      // unwrap and show cause message minimally (or rethrow if you prefer)
      Throwable cause = ee.getCause() != null ? ee.getCause() : ee;
      return "(error: " + cause.getClass().getSimpleName() + (cause.getMessage() != null ? (": " + cause.getMessage()) : "") + ")";
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      return "(interrupted)";
    } catch (Exception e) {
      return "(error: " + e.getMessage() + ")";
    }
  }
}
