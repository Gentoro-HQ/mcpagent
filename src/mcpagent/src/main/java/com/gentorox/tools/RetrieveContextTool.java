package com.gentorox.tools;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.knowledgebase.KnowledgeBaseEntry;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

public class RetrieveContextTool implements NativeTool {
  private KnowledgeBaseService kbService;
  private TelemetryService telemetry;
  private final ApplicationContext applicationContext;

  public RetrieveContextTool(ApplicationContext applicationContext) {
    this.applicationContext = applicationContext;
  }

  @Override
  public ToolSpec spec() {
    return new ToolSpec(
        "retrieveContext",
        "Retrieve knowledge base resources by names or relative paths and return their contents.",
        java.util.List.of(
            new ToolSpec.Parameter("resources","array",true,
                "Array of resource names. Each item may be a full kb:// URI or a relative path prefix.",
                Map.of("items", Map.of("type", "string")))
        )
    );
  }

  @Override
  public String execute(Map<String, Object> args) {

    if( kbService == null ) {
      synchronized ( this ) {
        if( kbService == null ) {
          // lazy init and prevent circular dependency
          kbService = applicationContext.getBean( KnowledgeBaseService.class);
          telemetry = applicationContext.getBean( TelemetryService.class);
        }
      }
    }

    var session = TelemetrySession.create();
    return telemetry.inSpan(session, "tool.execute", java.util.Map.of("tool", "retrieveContext"), () -> {
      telemetry.countTool(session, "retrieveContext");

      // Parse input array safely
      Object raw = args.get("resources");
      List<String> requested = new ArrayList<>();
      if (raw instanceof Collection<?> c) {
        for (Object o : c) if (o != null) requested.add(String.valueOf(o));
      } else if (raw instanceof String s && !s.isBlank()) {
        // allow single string for convenience
        requested.add(s);
      }

      if (requested.isEmpty()) return "[]";

      // Resolve to concrete kb:// resources
      Set<String> resources = new LinkedHashSet<>();
      for (String item : requested) {
        String trimmed = item.trim();
        if (trimmed.isEmpty()) continue;

        if (trimmed.startsWith("kb://")) {
          resources.add(trimmed);
        } else {
          // Treat as relative prefix under kb://
          String prefix = trimmed.startsWith("/") ? trimmed.substring(1) : trimmed;
          String kbPrefix = "kb://" + prefix;
          List<KnowledgeBaseEntry> entries = telemetry.inSpan(session, "kb.list", java.util.Map.of("prefix", kbPrefix),
              () -> kbService.list(kbPrefix));
          for (KnowledgeBaseEntry e : entries) {
            if (e.resource() != null) resources.add(e.resource());
          }
        }
      }

      // Fetch content for each resource
      List<Map<String, Object>> result = new ArrayList<>();
      for (String res : resources) {
        String content = telemetry.inSpan(session, "kb.getContent", java.util.Map.of("resource", res),
            () -> kbService.getContent(res).orElse(null));
        if (content != null) {
          result.add(Map.of(
              "resource", res,
              "content", content
          ));
        }
      }

      // Serialize to JSON (simple manual builder to avoid bringing extra dependencies here)
      return toJsonArrayOfObjects(result);
    });
  }

  private static String escapeJson(String s) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      switch (ch) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        case '\b' -> sb.append("\\b");
        case '\f' -> sb.append("\\f");
        default -> {
          if (ch < 0x20) {
            sb.append(String.format("\\u%04x", (int) ch));
          } else {
            sb.append(ch);
          }
        }
      }
    }
    return sb.toString();
  }

  private static String toJsonArrayOfObjects(List<Map<String, Object>> list) {
    StringBuilder sb = new StringBuilder();
    sb.append('[');
    boolean firstObj = true;
    for (Map<String, Object> obj : list) {
      if (!firstObj) sb.append(',');
      firstObj = false;
      sb.append('{');
      boolean firstField = true;
      for (Map.Entry<String, Object> e : obj.entrySet()) {
        if (!firstField) sb.append(',');
        firstField = false;
        sb.append('"').append(escapeJson(e.getKey())).append('"').append(':');
        Object v = e.getValue();
        if (v == null) {
          sb.append("null");
        } else {
          sb.append('"').append(escapeJson(String.valueOf(v))).append('"');
        }
      }
      sb.append('}');
    }
    sb.append(']');
    return sb.toString();
  }
}
