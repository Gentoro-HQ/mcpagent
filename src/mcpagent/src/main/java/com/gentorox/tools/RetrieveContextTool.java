package com.gentorox.tools;

import com.gentorox.services.knowledgebase.KnowledgeBaseEntry;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.telemetry.TelemetrySession;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.P;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Component
public class RetrieveContextTool {
  private final KnowledgeBaseService kbService;
  private final TelemetryService telemetry;

  public RetrieveContextTool(KnowledgeBaseService kbService, TelemetryService telemetry) {
    this.kbService = kbService;
    this.telemetry = telemetry;
  }

  @Tool("Retrieve knowledge base resources by names or relative paths and return their contents")
  public String retrieveContext(@P("Array of resource names. Each item may be a full kb:// URI or a relative path prefix") List<String> resources) {
    var session = TelemetrySession.create();
    return telemetry.inSpan(session, "tool.execute", java.util.Map.of("tool", "retrieveContext"), () -> {
      telemetry.countTool(session, "retrieveContext");

      // Process the resources list
      if (resources == null || resources.isEmpty()) {
        return "No resources specified";
      }

      // Resolve to concrete kb:// resources
      Set<String> resolvedResources = new LinkedHashSet<>();
      for (String item : resources) {
        String trimmed = item.trim();
        if (trimmed.isEmpty()) continue;

        if (trimmed.startsWith("kb://")) {
          resolvedResources.add(trimmed);
        } else {
          // Treat as relative prefix under kb://
          String prefix = trimmed.startsWith("/") ? trimmed.substring(1) : trimmed;
          String kbPrefix = "kb://" + prefix;
          List<KnowledgeBaseEntry> entries = telemetry.inSpan(session, "kb.list", java.util.Map.of("prefix", kbPrefix),
              () -> kbService.list(kbPrefix));
          for (KnowledgeBaseEntry e : entries) {
            if (e.resource() != null) resolvedResources.add(e.resource());
          }
        }
      }

      // Fetch content for each resource
      List<Map<String, Object>> result = new ArrayList<>();
      for (String res : resolvedResources) {
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
