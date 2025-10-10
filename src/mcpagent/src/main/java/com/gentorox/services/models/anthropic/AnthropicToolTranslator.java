package com.gentorox.services.models.anthropic;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.models.ToolTranslator;

import java.util.List;

public class AnthropicToolTranslator implements ToolTranslator<Object> {
  
  // TODO: Update this class to work with Anthropic Java SDK 2.8.1
  
  @Override
  public List<Object> translate(List<ToolSpec> toolSpecs) {
    throw new UnsupportedOperationException("Anthropic tool translation not implemented for SDK 2.8.1");
  }
}
