package com.gentorox.tools;

import com.fasterxml.jackson.databind.util.ExceptionUtil;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.P;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Mono;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collections;

@Component
public class RunTsCodeTool implements AgentTool {
  private final TypescriptRuntimeClient ts;
  private final TelemetryService telemetry;

  public RunTsCodeTool(TypescriptRuntimeClient ts, TelemetryService telemetry) {
    this.ts = ts; this.telemetry = telemetry;
  }

  @Tool(name="RunTypescriptSnippet", value = "Execute a short TypeScript snippet in the isolated runtime and return stdout/result")
  public String runTsCode(@P("TypeScript code to execute") String code) {
    return telemetry.inSpan("tool.execute", java.util.Map.of("tool","runTsCode"),
        () -> {
          var r = ts.exec(code).onErrorResume(e -> {
            StringWriter sw = new StringWriter(4096);
            try (PrintWriter pw = new PrintWriter(sw)) {
              e.printStackTrace(pw);
              return Mono.just(new TypescriptRuntimeClient.RunResponse(false, null, Collections.emptyList(), sw.toString()));
            }
          }).block();
          if (r == null) return "(no result)";
          if (r.value() == null) return "(no result)";
          return (String) r.value();
        });
  }
}
