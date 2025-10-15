package com.gentorox.tools;

import com.gentorox.core.api.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class NativeToolsRegistry {
  private List<NativeTool> tools;
  public NativeToolsRegistry(List<NativeTool> tools) { this.tools = tools; }

  public List<NativeTool> currentTools() { return List.copyOf(tools); }

  public List<ToolSpec> currentToolSpecs() { return tools.stream().map(NativeTool::spec).toList(); }

  public String execute(String name, Map<String, Object> args) {
    return tools.stream().filter(t -> t.spec().name().equals(name)).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown tool: " + name)).execute(args);
  }

  public void addTool(NativeTool tool) {
    List<NativeTool> copyOfTools = new ArrayList<>(tools);
    copyOfTools.add(tool);
    tools = copyOfTools;
  }

  public void addTools(List<NativeTool> tools) {
    Objects.requireNonNull(tools, "tools");
    tools.forEach(this::addTool);
  }
}
