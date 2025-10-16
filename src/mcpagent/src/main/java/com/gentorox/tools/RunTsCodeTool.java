package com.gentorox.tools;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

public class RunTsCodeTool implements NativeTool {
  private TypescriptRuntimeClient typescriptRuntimeClient;
  private TelemetryService telemetry;
  private final ApplicationContext applicationContext;
  public RunTsCodeTool(ApplicationContext applicationContext) {
    this.applicationContext = applicationContext;
  }

  @Override
  public ToolSpec spec() {
    return new ToolSpec("runTsCode","Execute a short TypeScript snippet in the isolated runtime and return stdout/result.",
        java.util.List.of(
            new ToolSpec.Parameter("code","string",true,"TypeScript code to execute",null) ));
  }

  @Override
  public String execute(Map<String, Object> args) {

    if( typescriptRuntimeClient == null ) {
      synchronized ( this ) {
        if( typescriptRuntimeClient == null ) {
          // lazy init and prevent circular dependency
          typescriptRuntimeClient = applicationContext.getBean( TypescriptRuntimeClient.class);
          telemetry = applicationContext.getBean( TelemetryService.class);
        }
      }
    }

    String code = String.valueOf(args.getOrDefault("code",""));
    var session = TelemetrySession.create();
    return telemetry.inSpan(session,"tool.execute", java.util.Map.of("tool","runTsCode"),
        () -> telemetry.inSpan(session,"ts.exec", java.util.Map.of(), () -> {
          var r = typescriptRuntimeClient.exec(code).block();
          if (r == null) return "(no result)";
          if (r.value() == null) return "(no result)";
          return (String) r.value();
        }));
  }
}
