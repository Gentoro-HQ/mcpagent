package com.gentorox.tools;

import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.P;
import org.springframework.stereotype.Component;

@Component
public class RunTsCodeTool {
  private final TypescriptRuntimeClient ts;
  private final TelemetryService telemetry;

  public RunTsCodeTool(TypescriptRuntimeClient ts, TelemetryService telemetry) {
    this.ts = ts; this.telemetry = telemetry;
  }

  @Tool("Execute a short TypeScript snippet in the isolated runtime and return stdout/result")
  public String runTsCode(@P("TypeScript code to execute") String code) {
    return telemetry.inSpan("tool.execute", java.util.Map.of("tool","runTsCode"),
        () -> telemetry.inSpan("ts.exec", java.util.Map.of(), () -> {
          var r = ts.exec(code).block();
          if (r == null) return "(no result)";
          if (r.value() == null) return "(no result)";
          return (String) r.value();
        }));
  }
}
