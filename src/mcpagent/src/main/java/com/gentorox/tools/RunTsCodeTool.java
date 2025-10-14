package com.gentorox.tools;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class RunTsCodeTool implements NativeTool {
  private final TypescriptRuntimeClient ts;
  private final TelemetryService telemetry;

  public RunTsCodeTool(TypescriptRuntimeClient ts, TelemetryService telemetry) {
    this.ts = ts; this.telemetry = telemetry;
  }

  @Override
  public ToolSpec spec() {
    return new ToolSpec("runTsCode","Execute a short TypeScript snippet in the isolated runtime and return stdout/result.",
        java.util.List.of(new ToolSpec.Parameter("code","string",true,"TypeScript code to execute",null),
            new ToolSpec.Parameter("args","object",false,"JSON-like arguments",null)));
  }

  @Override
  public String execute(Map<String, Object> args) {
    String code = String.valueOf(args.getOrDefault("code",""));
    var session = TelemetrySession.create();
    return telemetry.inSpan(session,"tool.execute", java.util.Map.of("tool","runTsCode"),
        () -> telemetry.inSpan(session,"ts.exec", java.util.Map.of(), () -> {
          var r = ts.exec(code).block();
          if (r == null) return "(no result)";
          if (r.value() == null) return "(no result)";
          return (String) r.value();
        }));
  }
}
